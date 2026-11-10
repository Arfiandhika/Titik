import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORITIES } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(here, 'data');
export const UPLOAD_DIR = path.join(here, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'titik.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// One table per data requirement (DR1-DR9). No migrations: after a change, run `npm run seed`.
db.exec(`
CREATE TABLE IF NOT EXISTS users (                 -- DR1
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'resident' CHECK (role IN ('resident', 'official')),
  authority TEXT,
  home_area TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  verify_code TEXT,
  verify_expires INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (               -- DR2
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  address TEXT,
  photo TEXT,
  authority TEXT,
  ai_category TEXT,
  ai_confidence REAL,
  hoax_flagged INTEGER NOT NULL DEFAULT 0,
  merged_into INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  reject_reason TEXT,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_geo ON reports(lat, lng);
CREATE INDEX IF NOT EXISTS idx_reports_authority ON reports(authority, status);

CREATE TABLE IF NOT EXISTS status_history (        -- DR3
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('status', 'forward', 'merge')),
  from_status TEXT,
  to_status TEXT,
  from_authority TEXT,
  to_authority TEXT,
  note TEXT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (                 -- DR4
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('metoo', 'hoax')),
  via TEXT NOT NULL DEFAULT 'direct',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (report_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (              -- DR5
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (         -- DR6
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS points_ledger (         -- DR7
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rewards (               -- DR8
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  cost INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS redemptions (           -- DR9
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id TEXT NOT NULL REFERENCES rewards(id),
  cost INTEGER NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Security: one-time codes for changing email and resetting a forgotten password.
CREATE TABLE IF NOT EXISTS account_codes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('email', 'reset')),
  code TEXT NOT NULL,
  target TEXT,                                     -- the new email for purpose = 'email'
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, purpose)
);

-- Customer support messages from residents and staff.
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---------- helpers ----------

// FR13: the balance is always the sum of the ledger.
export function addPoints(userId, amount, reason, { reportId = null } = {}) {
  if (!userId || !amount) return;
  db.prepare('INSERT INTO points_ledger (user_id, amount, reason, report_id) VALUES (?, ?, ?, ?)').run(
    userId,
    amount,
    reason,
    reportId,
  );
}

export function pointsBalance(userId) {
  return db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM points_ledger WHERE user_id = ?').get(userId).total;
}

// FR11
export function notify(userId, message, { reportId = null, type = 'info' } = {}) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id, report_id, type, message) VALUES (?, ?, ?, ?)').run(
    userId,
    reportId,
    type,
    message,
  );
}

export function notifyAuthority(authority, message, opts = {}) {
  if (!authority) return;
  const staff = db.prepare("SELECT id FROM users WHERE role = 'official' AND authority = ?").all(authority);
  for (const s of staff) notify(s.id, message, opts);
}

// FR12: first matching box wins (AUTHORITIES is ordered most specific first).
export function authorityFor(lat, lng) {
  for (const a of AUTHORITIES) {
    const [minLat, minLng, maxLat, maxLng] = a.box;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) return a.id;
  }
  return null;
}

export function authorityName(id) {
  return AUTHORITIES.find((a) => a.id === id)?.name || 'Unassigned';
}

// NFR1: what other people may see about a user.
export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    authority: u.role === 'official' ? u.authority : undefined,
  };
}

// Only for the signed-in user themselves.
export function selfUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    authority: u.authority,
    homeArea: u.home_area,
    verified: Boolean(u.verified),
    createdAt: u.created_at,
    points: pointsBalance(u.id),
  };
}

export function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function isEmpty() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
}
