import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { db, addPoints, pointsBalance, notify, publicUser, getUser, authorityName } from './db.js';
import { optionalAuth, requireAuth, requireVerified } from './auth.js';
import { upload } from './api-reports.js';
import { classifyPhoto, mediaTypeFor } from './ai.js';
import {
  AI_ENABLED,
  AUTHORITIES,
  BADGES,
  CATEGORIES,
  DUPLICATE_MAX_RADIUS_M,
  DUPLICATE_RADIUS_M,
  HOAX_FLAG_THRESHOLD,
  MAP_CENTER,
  PHOTO_STATUSES,
  POINTS,
  SERVICE_BOUNDS,
  STATUSES,
  SUPPORT_TOPICS,
} from './config.js';

const router = Router();
const REDEEM_PREFIX = 'Redeemed: ';

// meta: single source for categories, statuses, councils
router.get('/meta', (_req, res) => {
  res.json({
    categories: CATEGORIES,
    statuses: STATUSES,
    photoStatuses: PHOTO_STATUSES,
    authorities: AUTHORITIES.map(({ id, name, short, box }) => ({ id, name, short, box })),
    points: POINTS,
    badges: BADGES.map(({ id, label, description, color }) => ({ id, label, description, color })),
    aiEnabled: AI_ENABLED,
    mapCenter: MAP_CENTER,
    serviceBounds: SERVICE_BOUNDS,
    hoaxThreshold: HOAX_FLAG_THRESHOLD,
    supportTopics: SUPPORT_TOPICS,
    duplicateRadius: { base: DUPLICATE_RADIUS_M, max: DUPLICATE_MAX_RADIUS_M },
  });
});

// customer support
const shapeTicket = (t) => ({ id: t.id, topic: t.topic, message: t.message, status: t.status, createdAt: t.created_at });

router.get('/support', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.json({ tickets: rows.map(shapeTicket) });
});

router.post('/support', requireAuth, (req, res) => {
  const topic = SUPPORT_TOPICS.find((t) => t.id === req.body?.topic);
  const message = String(req.body?.message || '').trim();
  if (!topic) return res.status(400).json({ error: 'Choose a topic.' });
  if (message.length < 10) return res.status(400).json({ error: 'Tell us a little more (at least 10 characters).' });
  if (message.length > 2000) return res.status(400).json({ error: 'Keep the message under 2000 characters.' });
  const ticket = db.transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO support_tickets (user_id, topic, message) VALUES (?, ?, ?)').run(req.user.id, topic.id, message);
    notify(req.user.id, `We got your message about "${topic.label}". We usually reply within 2 working days.`);
    return db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(lastInsertRowid);
  })();
  res.status(201).json({ ticket: shapeTicket(ticket) });
});

// AI category suggestion
router.post('/ai/classify', requireVerified, upload.single('photo'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Add a photo first.' });
  try {
    if (!AI_ENABLED) return res.json({ enabled: false, suggestion: null });
    const suggestion = await classifyPhoto(req.file.path, mediaTypeFor(req.file.filename));
    res.json({ enabled: true, suggestion });
  } catch (err) {
    next(err);
  } finally {
    fs.rm(req.file.path, { force: true }, () => {});
  }
});

// notifications
router.get('/notifications', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100')
    .all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).n;
  res.json({
    unread,
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      reportId: n.report_id,
      read: Boolean(n.read),
      createdAt: n.created_at,
    })),
  });
});

router.get('/notifications/unread', requireAuth, (req, res) => {
  res.json({ unread: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).n });
});

router.post('/notifications/read', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (ids && ids.length) {
    db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).run(req.user.id, ...ids);
  } else {
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  }
  res.json({ ok: true });
});

// profiles, badges
export function userStats(userId) {
  const one = (sql) => db.prepare(sql).get(userId).n;
  return {
    reports: one('SELECT COUNT(*) AS n FROM reports WHERE user_id = ? AND merged_into IS NULL'),
    resolved: one("SELECT COUNT(*) AS n FROM reports WHERE user_id = ? AND status = 'resolved'"),
    metoos: one("SELECT COUNT(*) AS n FROM votes WHERE user_id = ? AND type = 'metoo'"),
    comments: one('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?'),
    earned: one(`SELECT COALESCE(SUM(amount), 0) AS n FROM points_ledger WHERE user_id = ? AND reason NOT LIKE '${REDEEM_PREFIX}%'`),
  };
}

export function badgesFor(stats) {
  return BADGES.filter((b) => b.test(stats)).map(({ id, label, description, color }) => ({ id, label, description, color }));
}

router.get('/users/:id', optionalAuth, (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const stats = userStats(u.id);
  res.json({
    user: { ...publicUser(u), authorityName: u.role === 'official' ? authorityName(u.authority) : undefined, joined: u.created_at.slice(0, 10) },
    stats,
    badges: badgesFor(stats),
  });
});

// points
router.get('/points', requireAuth, (req, res) => {
  const history = db
    .prepare(
      `SELECT p.*, r.title AS report_title FROM points_ledger p LEFT JOIN reports r ON r.id = p.report_id
       WHERE p.user_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 100`,
    )
    .all(req.user.id)
    .map((p) => ({ id: p.id, amount: p.amount, reason: p.reason, reportId: p.report_id, reportTitle: p.report_title, createdAt: p.created_at }));
  const redemptions = db
    .prepare(
      `SELECT d.*, w.name FROM redemptions d JOIN rewards w ON w.id = d.reward_id WHERE d.user_id = ? ORDER BY d.created_at DESC, d.id DESC`,
    )
    .all(req.user.id)
    .map((d) => ({ id: d.id, rewardId: d.reward_id, name: d.name, cost: d.cost, code: d.code, createdAt: d.created_at }));
  const stats = userStats(req.user.id);
  res.json({ balance: pointsBalance(req.user.id), stats, badges: badgesFor(stats), history, redemptions });
});

// rewards
router.get('/rewards', (_req, res) => {
  res.json({ rewards: db.prepare('SELECT * FROM rewards ORDER BY cost ASC').all() });
});

router.post('/rewards/:id/redeem', requireVerified, (req, res) => {
  if (req.user.role !== 'resident') return res.status(403).json({ error: 'Rewards are for residents.' });
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(req.params.id);
  if (!reward) return res.status(404).json({ error: 'Reward not found.' });

  const result = db.transaction(() => {
    const fresh = db.prepare('SELECT stock FROM rewards WHERE id = ?').get(reward.id);
    if (fresh.stock <= 0) return { error: 'This reward is out of stock.' };
    const balance = pointsBalance(req.user.id);
    if (balance < reward.cost) return { error: `You need ${reward.cost - balance} more points for this reward.` };
    const code = `TTK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    db.prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ?').run(reward.id);
    db.prepare('INSERT INTO redemptions (user_id, reward_id, cost, code) VALUES (?, ?, ?, ?)').run(req.user.id, reward.id, reward.cost, code);
    addPoints(req.user.id, -reward.cost, `${REDEEM_PREFIX}${reward.name}`);
    notify(req.user.id, `You redeemed "${reward.name}". Your code is ${code}.`, { type: 'reward' });
    return { code };
  })();

  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ code: result.code, balance: pointsBalance(req.user.id) });
});

// leaderboard
router.get('/leaderboard', optionalAuth, (req, res) => {
  const month = req.query.period === 'month';
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.role, COALESCE(SUM(p.amount), 0) AS points
       FROM users u JOIN points_ledger p ON p.user_id = u.id
       WHERE u.role = 'resident' AND p.reason NOT LIKE '${REDEEM_PREFIX}%'
       ${month ? "AND p.created_at >= datetime('now', 'start of month')" : ''}
       GROUP BY u.id HAVING points > 0 ORDER BY points DESC, u.name ASC LIMIT 50`,
    )
    .all();
  res.json({
    period: month ? 'month' : 'all',
    leaders: rows.map((r, i) => {
      const stats = userStats(r.id);
      return { rank: i + 1, user: publicUser(r), points: r.points, reports: stats.reports, badges: badgesFor(stats), isMe: req.user?.id === r.id };
    }),
  });
});

// stats (dashboard; public summary for the map page)
router.get('/stats', optionalAuth, (req, res) => {
  let authority = req.query.authority || null;
  if (req.query.area === 'mine' && req.user?.role === 'official') authority = req.user.authority;
  const scope = authority ? 'AND (authority = ? OR authority IS NULL)' : '';
  const args = authority ? [authority] : [];

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
  for (const row of db.prepare(`SELECT status, COUNT(*) AS n FROM reports WHERE merged_into IS NULL ${scope} GROUP BY status`).all(...args)) {
    byStatus[row.status] = row.n;
  }
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  for (const row of db.prepare(`SELECT category, COUNT(*) AS n FROM reports WHERE merged_into IS NULL ${scope} GROUP BY category`).all(...args)) {
    byCategory[row.category] = row.n;
  }
  const resolvedTimes = db
    .prepare(
      `SELECT AVG(julianday(h.created_at) - julianday(r.created_at)) AS days
       FROM reports r JOIN status_history h ON h.report_id = r.id AND h.kind = 'status' AND h.to_status = 'resolved'
       WHERE r.merged_into IS NULL ${scope.replace(/authority/g, 'r.authority')}`,
    )
    .get(...args);
  const one = (sql) => db.prepare(sql).get(...args).n;
  res.json({
    authority,
    authorityName: authority ? authorityName(authority) : 'All councils',
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    open: byStatus.submitted + byStatus.under_review + byStatus.in_progress,
    byStatus,
    byCategory,
    flagged: one(`SELECT COUNT(*) AS n FROM reports WHERE hoax_flagged = 1 AND merged_into IS NULL AND status NOT IN ('resolved','rejected') ${scope}`),
    unrouted: one(`SELECT COUNT(*) AS n FROM reports WHERE authority IS NULL AND merged_into IS NULL AND status NOT IN ('resolved','rejected') ${authority ? 'AND ? IS NOT NULL' : ''}`),
    newThisWeek: one(`SELECT COUNT(*) AS n FROM reports WHERE merged_into IS NULL AND created_at >= datetime('now', '-7 days') ${scope}`),
    avgDaysToResolve: resolvedTimes.days ? Math.round(resolvedTimes.days * 10) / 10 : null,
  });
});

export default router;
