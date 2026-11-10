import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  db,
  addPoints,
  notify,
  notifyAuthority,
  authorityFor,
  authorityName,
  publicUser,
  UPLOAD_DIR,
} from './db.js';
import { optionalAuth, requireAuth, requireVerified, requireOfficial } from './auth.js';
import {
  ACCEPTED_STATUSES,
  AUTHORITIES,
  CATEGORY_IDS,
  DUPLICATE_MAX_RADIUS_M,
  DUPLICATE_RADIUS_M,
  HOAX_FLAG_THRESHOLD,
  PHOTO_STATUSES,
  POINTS,
  STATUSES,
  STATUS_IDS,
} from './config.js';

const router = Router();

// uploads
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${IMAGE_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_EXT[file.mimetype]) cb(null, true);
    else cb(Object.assign(new Error('Photo must be a JPG, PNG or WebP image.'), { status: 400 }));
  },
});

function removeUpload(photo) {
  if (!photo || !photo.startsWith('/uploads/')) return;
  const file = path.join(UPLOAD_DIR, path.basename(photo));
  fs.rm(file, { force: true }, () => {});
}

// geo
export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// shaping
const REPORT_SELECT = `
  SELECT r.*,
    (SELECT COUNT(*) FROM votes v WHERE v.report_id = r.id AND v.type = 'metoo') AS metoo_count,
    (SELECT COUNT(*) FROM votes v WHERE v.report_id = r.id AND v.type = 'hoax') AS hoax_count,
    (SELECT COUNT(*) FROM comments c WHERE c.report_id = r.id) AS comment_count,
    u.id AS u_id, u.name AS u_name, u.role AS u_role, u.authority AS u_authority
  FROM reports r JOIN users u ON u.id = r.user_id`;

function shape(row, viewer) {
  const myVote = viewer
    ? db.prepare('SELECT type FROM votes WHERE report_id = ? AND user_id = ?').get(row.id, viewer.id)?.type || null
    : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    address: row.address,
    photoUrl: row.photo,
    authority: row.authority,
    authorityName: authorityName(row.authority),
    aiCategory: row.ai_category,
    hoaxFlagged: Boolean(row.hoax_flagged),
    mergedInto: row.merged_into,
    rejectReason: row.reject_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reporter: publicUser({ id: row.u_id, name: row.u_name, role: row.u_role, authority: row.u_authority }),
    metoo: row.metoo_count,
    hoax: row.hoax_count,
    commentCount: row.comment_count,
    myVote,
    isMine: Boolean(viewer && viewer.id === row.user_id),
    ...(row.distance !== undefined ? { distance: Math.round(row.distance) } : {}),
  };
}

function loadRow(id) {
  return db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id);
}

function loadReport(req, res) {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? db.prepare('SELECT * FROM reports WHERE id = ?').get(id) : null;
  if (!row) {
    res.status(404).json({ error: 'Report not found.' });
    return null;
  }
  return row;
}

// Staff act only on their own council's reports (or unrouted ones).
const inMyArea = (user, report) => user.role === 'official' && (!report.authority || report.authority === user.authority);

const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id;

function supporters(reportId) {
  return db.prepare("SELECT user_id FROM votes WHERE report_id = ? AND type = 'metoo'").all(reportId).map((r) => r.user_id);
}

// +5 per "Me too" once the report is accepted. Tracked per (user, report) in the ledger.
const METOO_REASON = 'Me too on an accepted report';
const METOO_UNDO_REASON = 'Me too removed';
function metooNet(userId, reportId) {
  return db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM points_ledger WHERE user_id = ? AND report_id = ? AND reason IN (?, ?)')
    .get(userId, reportId, METOO_REASON, METOO_UNDO_REASON).n;
}
function awardMetoo(userId, reportId) {
  if (metooNet(userId, reportId) <= 0) addPoints(userId, POINTS.METOO_ACCEPTED, METOO_REASON, { reportId });
}
function undoMetoo(userId, reportId) {
  if (metooNet(userId, reportId) > 0) addPoints(userId, -POINTS.METOO_ACCEPTED, METOO_UNDO_REASON, { reportId });
}

// Hoax flag trips at the threshold when hoax votes outnumber "Me too".
function refreshHoaxFlag(reportId) {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  const { metoo, hoax } = db
    .prepare(
      `SELECT SUM(type = 'metoo') AS metoo, SUM(type = 'hoax') AS hoax FROM votes WHERE report_id = ?`,
    )
    .get(reportId);
  const flagged = (hoax || 0) >= HOAX_FLAG_THRESHOLD && (hoax || 0) > (metoo || 0) ? 1 : 0;
  if (flagged !== r.hoax_flagged) {
    db.prepare('UPDATE reports SET hoax_flagged = ? WHERE id = ?').run(flagged, reportId);
    if (flagged) {
      notifyAuthority(r.authority, `Report #${r.id} "${r.title}" has been flagged as a possible hoax by the community.`, {
        reportId,
        type: 'hoax',
      });
    }
  }
}

// list
router.get('/', optionalAuth, (req, res) => {
  const where = ['r.merged_into IS NULL'];
  const params = [];
  const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

  if (req.query.status) {
    const s = list(req.query.status).filter((x) => STATUS_IDS.includes(x));
    if (s.length) {
      where.push(`r.status IN (${s.map(() => '?').join(',')})`);
      params.push(...s);
    }
  }
  if (req.query.category) {
    const c = list(req.query.category).filter((x) => CATEGORY_IDS.includes(x));
    if (c.length) {
      where.push(`r.category IN (${c.map(() => '?').join(',')})`);
      params.push(...c);
    }
  }
  if (req.query.user) {
    where.push('r.user_id = ?');
    params.push(Number(req.query.user));
  }
  if (req.query.authority) {
    if (req.query.authority === 'none') where.push('r.authority IS NULL');
    else {
      where.push('r.authority = ?');
      params.push(req.query.authority);
    }
  }
  // Staff dashboard: own council plus unrouted reports.
  if (req.query.area === 'mine' && req.user?.role === 'official') {
    where.push('(r.authority = ? OR r.authority IS NULL)');
    params.push(req.user.authority);
  }
  if (req.query.mine === '1') {
    if (!req.user) return res.status(401).json({ error: 'Please sign in first.' });
    where.push('r.user_id = ?');
    params.push(req.user.id);
  }
  if (req.query.supported === '1') {
    if (!req.user) return res.status(401).json({ error: 'Please sign in first.' });
    where.push("EXISTS (SELECT 1 FROM votes v WHERE v.report_id = r.id AND v.user_id = ? AND v.type = 'metoo')");
    params.push(req.user.id);
  }
  if (req.query.flagged === '1') where.push('r.hoax_flagged = 1');
  if (req.query.q) {
    where.push('(r.title LIKE ? OR r.description LIKE ? OR r.address LIKE ?)');
    const q = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(q, q, q);
  }
  if (req.query.bounds) {
    const [s, w, n, e] = list(req.query.bounds).map(Number);
    if ([s, w, n, e].every(Number.isFinite)) {
      where.push('r.lat BETWEEN ? AND ? AND r.lng BETWEEN ? AND ?');
      params.push(s, n, w, e);
    }
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat !== undefined;

  let order = 'r.created_at DESC, r.id DESC';
  if (req.query.sort === 'popular') order = 'metoo_count DESC, r.created_at DESC';
  if (req.query.sort === 'oldest') order = 'r.created_at ASC';

  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  let rows = db.prepare(`${REPORT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...params);

  if (hasPoint) {
    rows = rows.map((r) => ({ ...r, distance: distanceM(lat, lng, r.lat, r.lng) }));
    const radius = Number(req.query.radius);
    if (Number.isFinite(radius) && radius > 0) rows = rows.filter((r) => r.distance <= radius);
    if (req.query.sort === 'near') rows.sort((a, b) => a.distance - b.distance);
  }

  const total = rows.length;
  res.json({ total, reports: rows.slice(offset, offset + limit).map((r) => shape(r, req.user)) });
});

// duplicates
router.get('/duplicates', optionalAuth, (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Location is required.' });
  const accuracy = Math.max(0, Number(req.query.accuracy) || 0);
  const radius = Math.min(DUPLICATE_MAX_RADIUS_M, DUPLICATE_RADIUS_M + accuracy);
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const category = req.query.category;

  const rows = db
    .prepare(
      `${REPORT_SELECT} WHERE r.merged_into IS NULL AND r.status NOT IN ('resolved', 'rejected')
       AND r.lat BETWEEN ? AND ? AND r.lng BETWEEN ? AND ?`,
    )
    .all(lat - dLat, lat + dLat, lng - dLng, lng + dLng)
    .map((r) => ({ ...r, distance: distanceM(lat, lng, r.lat, r.lng) }))
    .filter((r) => r.distance <= radius)
    .sort((a, b) => (a.category === category ? 0 : 1) - (b.category === category ? 0 : 1) || a.distance - b.distance)
    .slice(0, 5);

  res.json({ radius: Math.round(radius), reports: rows.map((r) => shape(r, req.user)) });
});

// detail
router.get('/:id', optionalAuth, (req, res) => {
  const base = loadReport(req, res);
  if (!base) return;
  const report = shape(loadRow(base.id), req.user);
  // The timeline.
  const history = db
    .prepare(
      `SELECT h.*, u.id AS a_id, u.name AS a_name, u.role AS a_role, u.authority AS a_authority
       FROM status_history h LEFT JOIN users u ON u.id = h.actor_id
       WHERE h.report_id = ? ORDER BY h.created_at ASC, h.id ASC`,
    )
    .all(base.id)
    .map((h) => ({
      id: h.id,
      kind: h.kind,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      fromAuthority: h.from_authority ? authorityName(h.from_authority) : null,
      toAuthority: h.to_authority ? authorityName(h.to_authority) : null,
      note: h.note,
      photoUrl: h.photo,
      createdAt: h.created_at,
      actor: h.a_id ? publicUser({ id: h.a_id, name: h.a_name, role: h.a_role, authority: h.a_authority }) : null,
    }));
  const mergedFrom = db.prepare('SELECT id, title FROM reports WHERE merged_into = ?').all(base.id);
  const canManage = Boolean(req.user && inMyArea(req.user, base) && !base.merged_into);
  res.json({
    report,
    history,
    mergedFrom,
    canManage,
    allowedStatuses: canManage ? TRANSITIONS[base.status] : [],
  });
});

// create
function readReportFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.title !== undefined) {
    out.title = String(body.title || '').trim().slice(0, 100);
    if (out.title.length < 3) return { error: 'Give the report a short title.' };
  }
  if (!partial || body.description !== undefined) out.description = String(body.description || '').trim().slice(0, 1000);
  if (!partial || body.category !== undefined) {
    if (!CATEGORY_IDS.includes(body.category)) return { error: 'Choose a category.' };
    out.category = body.category;
  }
  return { fields: out };
}

router.post('/', requireVerified, upload.single('photo'), (req, res) => {
  const b = req.body || {};
  const { fields, error } = readReportFields(b);
  if (error) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    return res.status(400).json({ error });
  }
  if (!req.file) return res.status(400).json({ error: 'Add a photo of the problem.' });
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    removeUpload(`/uploads/${req.file.filename}`);
    return res.status(400).json({ error: 'Set the location on the map.' });
  }
  const accuracy = Number.isFinite(Number(b.accuracy)) && b.accuracy !== '' ? Number(b.accuracy) : null;
  const authority = authorityFor(lat, lng);
  const aiCategory = CATEGORY_IDS.includes(b.aiCategory) ? b.aiCategory : null;
  const aiConfidence = Number.isFinite(Number(b.aiConfidence)) ? Number(b.aiConfidence) : null;

  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO reports (user_id, title, description, category, lat, lng, accuracy, address, photo, authority, ai_category, ai_confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user.id,
        fields.title,
        fields.description,
        fields.category,
        lat,
        lng,
        accuracy,
        String(b.address || '').trim().slice(0, 200) || null,
        `/uploads/${req.file.filename}`,
        authority,
        aiCategory,
        aiConfidence,
      );
    const reportId = info.lastInsertRowid;
    db.prepare(
      "INSERT INTO status_history (report_id, kind, to_status, to_authority, actor_id, note) VALUES (?, 'status', 'submitted', ?, ?, ?)",
    ).run(reportId, authority, req.user.id, authority ? `Sent to ${authorityName(authority)}` : 'Outside the pilot council areas');
    addPoints(req.user.id, POINTS.REPORT, 'Posted a report', { reportId });
    notify(req.user.id, `Thanks. Your report "${fields.title}" was sent to ${authorityName(authority)}. You earned ${POINTS.REPORT} points.`, {
      reportId,
      type: 'status',
    });
    notifyAuthority(authority, `New report in your area: "${fields.title}".`, { reportId, type: 'new' });
    return reportId;
  })();

  res.status(201).json({ report: shape(loadRow(id), req.user) });
});

// edit / delete own report (only while still "submitted")
router.patch('/:id', requireVerified, upload.single('photo'), (req, res) => {
  const r = loadReport(req, res);
  if (!r) return;
  const newPhoto = req.file ? `/uploads/${req.file.filename}` : null;
  const fail = (status, error) => {
    removeUpload(newPhoto);
    res.status(status).json({ error });
  };
  if (r.user_id !== req.user.id) return fail(403, 'You can only edit your own reports.');
  if (r.status !== 'submitted') return fail(400, 'This report is already being handled, so it can no longer be edited.');
  const { fields, error } = readReportFields(req.body || {}, { partial: true });
  if (error) return fail(400, error);
  if (newPhoto) fields.photo = newPhoto;
  const keys = Object.keys(fields);
  if (keys.length) {
    db.prepare(`UPDATE reports SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
      ...keys.map((k) => fields[k]),
      r.id,
    );
    if (newPhoto) removeUpload(r.photo);
  }
  res.json({ report: shape(loadRow(r.id), req.user) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const r = loadReport(req, res);
  if (!r) return;
  if (r.user_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own reports.' });
  if (r.status !== 'submitted') return res.status(400).json({ error: 'This report is already being handled, so it can no longer be deleted.' });
  db.transaction(() => {
    addPoints(req.user.id, -POINTS.REPORT, 'Deleted a report');
    db.prepare('DELETE FROM reports WHERE id = ?').run(r.id);
  })();
  removeUpload(r.photo);
  res.json({ ok: true });
});

// status
const TRANSITIONS = {
  submitted: ['under_review', 'in_progress', 'resolved', 'rejected'],
  under_review: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['resolved', 'rejected'],
  resolved: ['in_progress'],
  rejected: ['under_review'],
};

// Resolved and rejected need a staff photo as proof (PHOTO_STATUSES, sent as multipart); other statuses take none (JSON is fine).
router.patch('/:id/status', requireOfficial, upload.single('photo'), (req, res) => {
  let photo = req.file ? `/uploads/${req.file.filename}` : null;
  const fail = (status, error) => {
    removeUpload(photo);
    res.status(status).json({ error });
  };
  const r = loadReport(req, res);
  if (!r) return removeUpload(photo);
  if (!inMyArea(req.user, r)) return fail(403, 'This report belongs to another council. Forward it instead.');
  if (r.merged_into) return fail(400, 'This report was merged into another one.');
  const to = req.body?.status;
  const note = String(req.body?.note || '').trim().slice(0, 500);
  if (!STATUS_IDS.includes(to)) return fail(400, 'Choose a status.');
  if (!TRANSITIONS[r.status].includes(to)) {
    return fail(400, `A report that is ${statusLabel(r.status).toLowerCase()} cannot move to ${statusLabel(to).toLowerCase()}.`);
  }
  // A reason is required to reject.
  if (to === 'rejected' && note.length < 5) return fail(400, 'Give a reason for rejecting this report.');
  if (PHOTO_STATUSES.includes(to)) {
    if (!photo) return fail(400, to === 'rejected' ? 'Add a photo that shows why this report is rejected.' : 'Add a photo of the fixed spot.');
  } else if (photo) {
    removeUpload(photo); // photos only go with resolved / rejected
    photo = null;
  }

  db.transaction(() => {
    const firstAccept = ACCEPTED_STATUSES.includes(to) && !r.accepted_at;
    db.prepare(
      `UPDATE reports SET status = ?, reject_reason = ?, accepted_at = COALESCE(accepted_at, ?),
         authority = COALESCE(authority, ?), updated_at = datetime('now') WHERE id = ?`,
    ).run(to, to === 'rejected' ? note : null, firstAccept ? new Date().toISOString() : null, req.user.authority, r.id);
    db.prepare(
      "INSERT INTO status_history (report_id, kind, from_status, to_status, note, photo, actor_id) VALUES (?, 'status', ?, ?, ?, ?, ?)",
    ).run(r.id, r.status, to, note || null, photo, req.user.id);

    const fans = supporters(r.id).filter((id) => id !== r.user_id);
    if (firstAccept) for (const uid of fans) awardMetoo(uid, r.id);

    if (to === 'rejected') addPoints(r.user_id, POINTS.REJECTED, 'Report rejected', { reportId: r.id });
    if (r.status === 'rejected') addPoints(r.user_id, -POINTS.REJECTED, 'Report reinstated', { reportId: r.id });

    const msg =
      to === 'rejected'
        ? `Your report "${r.title}" was rejected: ${note}`
        : `"${r.title}" is now ${statusLabel(to).toLowerCase()}.${note ? ` Note from the council: ${note}` : ''}${photo ? ' The council added a photo.' : ''}`;
    notify(r.user_id, msg, { reportId: r.id, type: 'status' });
    for (const uid of fans) {
      notify(uid, `A report you confirmed, "${r.title}", is now ${statusLabel(to).toLowerCase()}.`, { reportId: r.id, type: 'status' });
    }
  })();
  res.json({ report: shape(loadRow(r.id), req.user) });
});

// forward
router.post('/:id/forward', requireOfficial, (req, res) => {
  const r = loadReport(req, res);
  if (!r) return;
  if (!inMyArea(req.user, r)) return res.status(403).json({ error: 'Only the council handling this report can forward it.' });
  const to = req.body?.authority;
  const note = String(req.body?.note || '').trim().slice(0, 500);
  if (!AUTHORITIES.some((a) => a.id === to)) return res.status(400).json({ error: 'Choose a council to forward to.' });
  if (to === r.authority) return res.status(400).json({ error: 'The report is already with that council.' });
  if (['resolved', 'rejected'].includes(r.status) || r.merged_into) return res.status(400).json({ error: 'Closed reports cannot be forwarded.' });

  db.transaction(() => {
    db.prepare("UPDATE reports SET authority = ?, updated_at = datetime('now') WHERE id = ?").run(to, r.id);
    db.prepare(
      "INSERT INTO status_history (report_id, kind, from_authority, to_authority, note, actor_id) VALUES (?, 'forward', ?, ?, ?, ?)",
    ).run(r.id, r.authority, to, note || null, req.user.id);
    notify(r.user_id, `Your report "${r.title}" was forwarded to ${authorityName(to)}, the council responsible for that spot.`, {
      reportId: r.id,
      type: 'forward',
    });
    notifyAuthority(to, `Report forwarded to you by ${authorityName(req.user.authority)}: "${r.title}".`, { reportId: r.id, type: 'new' });
  })();
  res.json({ report: shape(loadRow(r.id), req.user) });
});

// merge duplicate into main
router.post('/:id/merge', requireOfficial, (req, res) => {
  const dup = loadReport(req, res);
  if (!dup) return;
  const main = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.body?.intoId));
  if (!main) return res.status(404).json({ error: 'The main report was not found.' });
  if (main.id === dup.id) return res.status(400).json({ error: 'A report cannot be merged into itself.' });
  if (!inMyArea(req.user, dup) || !inMyArea(req.user, main)) return res.status(403).json({ error: 'Both reports must be in your area.' });
  if (dup.merged_into || main.merged_into) return res.status(400).json({ error: 'One of these reports was already merged.' });
  if (main.status === 'rejected') return res.status(400).json({ error: 'Merge into an open report, not a rejected one.' });

  db.transaction(() => {
    db.prepare(
      `UPDATE reports SET merged_into = ?, status = 'rejected', reject_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(main.id, `Duplicate of report #${main.id}`, dup.id);
    db.prepare(
      "INSERT INTO status_history (report_id, kind, from_status, to_status, note, actor_id) VALUES (?, 'merge', ?, 'rejected', ?, ?)",
    ).run(dup.id, dup.status, `Merged into report #${main.id}`, req.user.id);
    db.prepare("INSERT INTO status_history (report_id, kind, note, actor_id) VALUES (?, 'merge', ?, ?)").run(
      main.id,
      `Report #${dup.id} merged into this one`,
      req.user.id,
    );

    // The duplicate's reporter and supporters become "Me too" on the main report.
    const people = new Set([dup.user_id, ...supporters(dup.id)]);
    people.delete(main.user_id);
    const insert = db.prepare("INSERT INTO votes (report_id, user_id, type, via) VALUES (?, ?, 'metoo', 'merge') ON CONFLICT DO UPDATE SET type = 'metoo', via = 'merge'");
    for (const uid of people) {
      insert.run(main.id, uid);
      if (main.accepted_at) awardMetoo(uid, main.id);
      notify(uid, `"${dup.title}" was the same issue as "${main.title}", so they were combined. You now follow the main report.`, {
        reportId: main.id,
        type: 'merge',
      });
    }
    db.prepare('DELETE FROM votes WHERE report_id = ?').run(dup.id);
    refreshHoaxFlag(main.id);
  })();
  res.json({ report: shape(loadRow(main.id), req.user) });
});

// votes
router.post('/:id/vote', requireVerified, (req, res) => {
  const r = loadReport(req, res);
  if (!r) return;
  const type = req.body?.type;
  const via = req.body?.via === 'duplicate' ? 'duplicate' : 'direct';
  if (!['metoo', 'hoax'].includes(type)) return res.status(400).json({ error: 'Unknown vote.' });
  if (r.user_id === req.user.id) return res.status(400).json({ error: 'You cannot vote on your own report.' });
  if (r.merged_into || ['resolved', 'rejected'].includes(r.status)) return res.status(400).json({ error: 'This report is closed.' });

  db.transaction(() => {
    const existing = db.prepare('SELECT type FROM votes WHERE report_id = ? AND user_id = ?').get(r.id, req.user.id);
    if (existing?.type === type) {
      // Same vote again removes it.
      db.prepare('DELETE FROM votes WHERE report_id = ? AND user_id = ?').run(r.id, req.user.id);
      if (type === 'metoo') undoMetoo(req.user.id, r.id);
    } else {
      db.prepare(
        'INSERT INTO votes (report_id, user_id, type, via) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET type = excluded.type, via = excluded.via, created_at = datetime(\'now\')',
      ).run(r.id, req.user.id, type, via);
      if (type === 'metoo') {
        if (r.accepted_at) awardMetoo(req.user.id, r.id);
        notify(r.user_id, `${req.user.name} said "Me too" on your report "${r.title}".`, { reportId: r.id, type: 'metoo' });
      } else if (existing?.type === 'metoo') {
        undoMetoo(req.user.id, r.id);
      }
    }
    refreshHoaxFlag(r.id);
  })();
  res.json({ report: shape(loadRow(r.id), req.user) });
});

// Staff can clear a hoax flag after checking the report.
router.post('/:id/clear-flag', requireOfficial, (req, res) => {
  const r = loadReport(req, res);
  if (!r) return;
  if (!inMyArea(req.user, r)) return res.status(403).json({ error: 'This report belongs to another council.' });
  db.transaction(() => {
    db.prepare("DELETE FROM votes WHERE report_id = ? AND type = 'hoax'").run(r.id);
    db.prepare('UPDATE reports SET hoax_flagged = 0 WHERE id = ?').run(r.id);
    db.prepare("INSERT INTO status_history (report_id, kind, from_status, to_status, note, actor_id) VALUES (?, 'status', ?, ?, ?, ?)").run(
      r.id,
      r.status,
      r.status,
      'Checked by council: not a hoax',
      req.user.id,
    );
  })();
  res.json({ report: shape(loadRow(r.id), req.user) });
});

// comments
function shapeComment(c) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    author: publicUser({ id: c.u_id, name: c.u_name, role: c.u_role, authority: c.u_authority }),
  };
}
const COMMENT_SELECT = `SELECT c.*, u.id AS u_id, u.name AS u_name, u.role AS u_role, u.authority AS u_authority
  FROM comments c JOIN users u ON u.id = c.user_id`;

router.get('/:id/comments', (req, res) => {
  const r = loadReport(req, res);
  if (!r) return;
  const rows = db.prepare(`${COMMENT_SELECT} WHERE c.report_id = ? ORDER BY c.created_at ASC, c.id ASC`).all(r.id);
  res.json({ comments: rows.map(shapeComment) });
});

router.post('/:id/comments', requireVerified, (req, res) => {
  const r = loadReport(req, res);
  if (!r) return;
  const body = String(req.body?.body || '').trim().slice(0, 1000);
  if (!body) return res.status(400).json({ error: 'Write a comment first.' });
  const info = db.prepare('INSERT INTO comments (report_id, user_id, body) VALUES (?, ?, ?)').run(r.id, req.user.id, body);
  if (r.user_id !== req.user.id) {
    const who = req.user.role === 'official' ? `${req.user.name} (${authorityName(req.user.authority)})` : req.user.name;
    notify(r.user_id, `${who} commented on "${r.title}".`, { reportId: r.id, type: 'comment' });
  }
  res.status(201).json({ comment: shapeComment(db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(info.lastInsertRowid)) });
});

router.delete('/:id/comments/:commentId', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM comments WHERE id = ? AND report_id = ?').get(Number(req.params.commentId), Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Comment not found.' });
  if (c.user_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own comments.' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
  res.json({ ok: true });
});


export default router;
