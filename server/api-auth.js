import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, getUser, notify, selfUser } from './db.js';
import { signToken, requireAuth } from './auth.js';
import { AUTHORITIES, IS_PROD, OFFICIAL_CODE } from './config.js';

const router = Router();
const CODE_TTL_MS = 15 * 60 * 1000;

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Malaysian mobile numbers: accept "012-345 6789", "+60123456789", etc. Store as "0123456789".
export function normalisePhone(s) {
  let d = String(s || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+60')) d = '0' + d.slice(3);
  else if (d.startsWith('60') && d.length >= 11) d = '0' + d.slice(2);
  d = d.replace(/\D/g, '');
  return /^01\d{8,9}$/.test(d) ? d : null;
}

function parseIdentifier(raw) {
  const s = String(raw || '').trim();
  if (s.includes('@')) return isEmail(s) ? { email: s.toLowerCase() } : null;
  const phone = normalisePhone(s);
  return phone ? { phone } : null;
}

function findByIdentifier(id) {
  if (id.email) return db.prepare('SELECT * FROM users WHERE email = ?').get(id.email);
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(id.phone);
}

// FR1: a code is "sent" by email or SMS. No provider is connected in the pilot,
// so outside production the code is logged and returned as devCode.
function issueCode(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare('UPDATE users SET verify_code = ?, verify_expires = ? WHERE id = ?').run(code, Date.now() + CODE_TTL_MS, user.id);
  const channel = user.email ? `email ${user.email}` : `SMS ${user.phone}`;
  console.log(`[verify] code ${code} for user ${user.id} via ${channel}`);
  return IS_PROD ? {} : { devCode: code };
}

// FR1: register with email or phone.
router.post('/register', (req, res) => {
  const { name, identifier, password, role = 'resident', officialCode, authority } = req.body || {};
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) return res.status(400).json({ error: 'Enter your name.' });
  const id = parseIdentifier(identifier);
  if (!id) return res.status(400).json({ error: 'Enter a valid email or Malaysian mobile number.' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (findByIdentifier(id)) return res.status(409).json({ error: 'An account with that email or phone already exists.' });

  let userRole = 'resident';
  let userAuthority = null;
  if (role === 'official') {
    if (officialCode !== OFFICIAL_CODE) return res.status(403).json({ error: 'Staff sign-up code is not correct.' });
    if (!AUTHORITIES.some((a) => a.id === authority)) return res.status(400).json({ error: 'Choose your council.' });
    userRole = 'official';
    userAuthority = authority;
  }

  const info = db
    .prepare('INSERT INTO users (name, email, phone, password_hash, role, authority) VALUES (?, ?, ?, ?, ?, ?)')
    .run(cleanName, id.email || null, id.phone || null, bcrypt.hashSync(password, 10), userRole, userAuthority);
  const user = getUser(info.lastInsertRowid);
  const extra = issueCode(user);
  res.status(201).json({ token: signToken(user), user: selfUser(user), ...extra });
});

router.post('/verify', requireAuth, (req, res) => {
  const u = req.user;
  if (u.verified) return res.json({ user: selfUser(u) });
  const code = String(req.body?.code || '').trim();
  if (!u.verify_code || Date.now() > u.verify_expires) {
    return res.status(400).json({ error: 'That code has expired. Send a new one.' });
  }
  if (code !== u.verify_code) return res.status(400).json({ error: 'That code is not correct.' });
  db.prepare('UPDATE users SET verified = 1, verify_code = NULL, verify_expires = NULL WHERE id = ?').run(u.id);
  res.json({ user: selfUser(getUser(u.id)) });
});

router.post('/resend', requireAuth, (req, res) => {
  if (req.user.verified) return res.json({ ok: true });
  res.json({ ok: true, ...issueCode(req.user) });
});

// FR2
router.post('/login', (req, res) => {
  const { identifier, password } = req.body || {};
  const id = parseIdentifier(identifier);
  const user = id && findByIdentifier(id);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email/phone or password is not correct.' });
  }
  res.json({ token: signToken(user), user: selfUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: selfUser(req.user) }));

// FR3: edit own profile.
router.patch('/me', requireAuth, (req, res) => {
  const { name, homeArea, currentPassword, newPassword } = req.body || {};
  const u = req.user;
  // Validate everything first so a bad field never leaves a half-applied update.
  const n = name !== undefined ? String(name).trim() : null;
  if (n !== null && n.length < 2) return res.status(400).json({ error: 'Enter your name.' });
  if (newPassword !== undefined) {
    if (!bcrypt.compareSync(String(currentPassword || ''), u.password_hash)) {
      return res.status(400).json({ error: 'Current password is not correct.' });
    }
    if (String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  db.transaction(() => {
    if (n !== null) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(n, u.id);
    if (homeArea !== undefined) {
      db.prepare('UPDATE users SET home_area = ? WHERE id = ?').run(String(homeArea).trim().slice(0, 80) || null, u.id);
    }
    if (newPassword !== undefined) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), u.id);
    }
  })();
  res.json({ user: selfUser(getUser(u.id)) });
});

// ---------- security: change email, forgot password ----------
// Codes work like FR1 verification: no email/SMS provider is connected, so outside
// production the code is logged and returned as devCode.
const MAX_CODE_ATTEMPTS = 5;

function issueAccountCode(userId, purpose, target, channel) {
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare(
    `INSERT INTO account_codes (user_id, purpose, code, target, expires_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, purpose) DO UPDATE SET code = excluded.code, target = excluded.target, attempts = 0, expires_at = excluded.expires_at`,
  ).run(userId, purpose, code, target, Date.now() + CODE_TTL_MS);
  console.log(`[${purpose}] code ${code} for user ${userId} via ${channel}`);
  return IS_PROD ? {} : { devCode: code };
}

// Returns { row } when the code matches, else { error }. Five wrong tries cancel the code.
function checkAccountCode(userId, purpose, code) {
  const row = db.prepare('SELECT * FROM account_codes WHERE user_id = ? AND purpose = ?').get(userId, purpose);
  if (!row || Date.now() > row.expires_at) return { error: 'That code has expired. Ask for a new one.' };
  if (String(code || '').trim() !== row.code) {
    if (row.attempts + 1 >= MAX_CODE_ATTEMPTS) {
      db.prepare('DELETE FROM account_codes WHERE user_id = ? AND purpose = ?').run(userId, purpose);
      return { error: 'Too many wrong codes. Ask for a new one.' };
    }
    db.prepare('UPDATE account_codes SET attempts = attempts + 1 WHERE user_id = ? AND purpose = ?').run(userId, purpose);
    return { error: 'That code is not correct.' };
  }
  return { row };
}

const emailTaken = (email, userId) => Boolean(db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, userId));

// Change (or add) the account email: confirm the password, then a code sent to the new address.
router.post('/email', requireAuth, (req, res) => {
  const { email, password } = req.body || {};
  const e = String(email || '').trim().toLowerCase();
  if (!isEmail(e)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (e === req.user.email) return res.status(400).json({ error: 'That is already your email.' });
  if (!bcrypt.compareSync(String(password || ''), req.user.password_hash)) {
    return res.status(400).json({ error: 'Password is not correct.' });
  }
  if (emailTaken(e, req.user.id)) return res.status(409).json({ error: 'Another account already uses that email.' });
  res.json({ ok: true, email: e, ...issueAccountCode(req.user.id, 'email', e, `email ${e}`) });
});

router.post('/email/confirm', requireAuth, (req, res) => {
  const check = checkAccountCode(req.user.id, 'email', req.body?.code);
  if (check.error) return res.status(400).json({ error: check.error });
  const e = check.row.target;
  if (emailTaken(e, req.user.id)) return res.status(409).json({ error: 'Another account already uses that email.' });
  db.transaction(() => {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(e, req.user.id);
    db.prepare("DELETE FROM account_codes WHERE user_id = ? AND purpose = 'email'").run(req.user.id);
    notify(req.user.id, `Your email was changed to ${e}.`);
  })();
  res.json({ user: selfUser(getUser(req.user.id)) });
});

// Forgot password, step 1: send a reset code. The answer is the same whether or not
// the account exists, so this cannot be used to find out who has an account.
router.post('/forgot', (req, res) => {
  const id = parseIdentifier(req.body?.identifier);
  if (!id) return res.status(400).json({ error: 'Enter a valid email or Malaysian mobile number.' });
  const user = findByIdentifier(id);
  const extra = user ? issueAccountCode(user.id, 'reset', null, user.email ? `email ${user.email}` : `SMS ${user.phone}`) : {};
  res.json({ ok: true, ...extra });
});

// Step 2: code + new password. Signs the user in; receiving the code also proves the contact, so it verifies the account.
router.post('/reset', (req, res) => {
  const { identifier, code, newPassword } = req.body || {};
  const id = parseIdentifier(identifier);
  const user = id && findByIdentifier(id);
  if (!user) return res.status(400).json({ error: 'That code has expired. Ask for a new one.' });
  if (String(newPassword || '').length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const check = checkAccountCode(user.id, 'reset', code);
  if (check.error) return res.status(400).json({ error: check.error });
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, verified = 1, verify_code = NULL, verify_expires = NULL WHERE id = ?').run(
      bcrypt.hashSync(String(newPassword), 10),
      user.id,
    );
    db.prepare("DELETE FROM account_codes WHERE user_id = ? AND purpose = 'reset'").run(user.id);
    notify(user.id, 'Your password was reset. If this was not you, contact support.');
  })();
  res.json({ token: signToken(user), user: selfUser(getUser(user.id)) });
});

export default router;
