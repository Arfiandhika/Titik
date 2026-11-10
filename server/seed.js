// Demo data. `npm run seed` wipes the database and reloads it; the server also
// calls seed() on first start when the database is empty.
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, authorityFor, authorityName, UPLOAD_DIR } from './db.js';
import { ACCEPTED_STATUSES, CATEGORIES, HOAX_FLAG_THRESHOLD, POINTS, REWARDS, STATUSES } from './config.js';
import { illustration } from './illustrations.js';

// Real photos for the demo reports, copied into uploads on seed.
const SEED_PHOTOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-photos');

const TABLES = ['support_tickets', 'account_codes', 'redemptions', 'rewards', 'points_ledger', 'notifications', 'comments', 'votes', 'status_history', 'reports', 'users'];

function wipe() {
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${TABLES.map(() => '?').join(',')})`).run(...TABLES);
  })();
  db.pragma('foreign_keys = ON');
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    if (f !== '.gitkeep') fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });
  }
}

// SQLite-style UTC timestamp, `days` (fractional) before now.
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);

const USERS = {
  demo: { name: 'Aina Rahman', email: 'demo@titik.my', password: 'demo123', home: 'Bangsar' },
  ravi: { name: 'Ravi Kumar', phone: '0123456789', password: 'demo123', home: 'Brickfields' },
  wei: { name: 'Tan Wei Jie', email: 'weijie@example.my', password: 'demo123', home: 'Petaling Jaya' },
  nurul: { name: 'Nurul Huda', email: 'nurul@example.my', password: 'demo123', home: 'Kampung Baru' },
  daniel: { name: 'Daniel Lim', email: 'daniel@example.my', password: 'demo123', home: 'Subang Jaya' },
  siti: { name: 'Siti Aminah', email: 'siti@example.my', password: 'demo123', home: 'Shah Alam' },
  arjun: { name: 'Arjun Nair', email: 'arjun@example.my', password: 'demo123', home: 'Cheras' },
  hafiz: { name: 'Hafiz Ismail', email: 'hafiz@example.my', password: 'demo123', home: 'Ampang' },
  dbkl: { name: 'Farid Hassan', email: 'dbkl@titik.my', password: 'official123', role: 'official', authority: 'DBKL' },
  mbpj: { name: 'Lim Mei Ling', email: 'mbpj@titik.my', password: 'official123', role: 'official', authority: 'MBPJ' },
  mbsj: { name: 'Kavitha Raj', email: 'mbsj@titik.my', password: 'official123', role: 'official', authority: 'MBSJ' },
  mbsa: { name: 'Azlan Yusof', email: 'mbsa@titik.my', password: 'official123', role: 'official', authority: 'MBSA' },
};

// steps: { to, by, days, note } status changes, or { forward, from, by, days, note }.
const REPORTS = [
  {
    by: 'ravi', cat: 'pothole', title: 'Deep pothole on Jalan Tun Razak', days: 9,
    desc: 'Large pothole in the left lane heading to KLCC. Motorcycles swerve to avoid it, very dangerous at night.',
    lat: 3.16105, lng: 101.71902, addr: 'Jalan Tun Razak, near Hospital Kuala Lumpur',
    steps: [
      { to: 'under_review', by: 'dbkl', days: 8, note: 'Inspection team assigned.' },
      { to: 'in_progress', by: 'dbkl', days: 5, note: 'Patching scheduled this week.' },
    ],
    metoo: ['demo', 'nurul', 'arjun', 'hafiz', 'wei'],
    comments: [
      ['nurul', 'Almost fell off my bike here last night.', 8.5],
      ['dbkl', 'Thanks for reporting. Our road team will patch this by Friday.', 5],
      ['demo', 'Still there this morning, but cones are up now.', 2],
    ],
  },
  {
    by: 'hafiz', cat: 'pothole', title: 'Pothole near Jalan Tun Razak bus stop', days: 3,
    desc: 'Another hole near the bus stop, probably the same one reported before.',
    lat: 3.16131, lng: 101.71925, addr: 'Jalan Tun Razak',
    metoo: ['arjun'],
  },
  {
    by: 'demo', cat: 'streetlight', title: 'Street lights out along Jalan Telawi', days: 6,
    desc: 'Three lamps in a row are dark from the corner of Jalan Telawi 3. The whole stretch is pitch black after 8pm.',
    lat: 3.13098, lng: 101.67112, addr: 'Jalan Telawi 3, Bangsar Baru',
    steps: [{ to: 'under_review', by: 'dbkl', days: 4, note: 'Forwarded to the lighting contractor.' }],
    metoo: ['ravi', 'wei', 'nurul'],
    comments: [['wei', 'Walked past yesterday, still dark.', 3]],
  },
  {
    by: 'nurul', cat: 'dumping', title: 'Bulky waste dumped by the river', days: 12,
    desc: 'Old mattresses and furniture dumped next to the riverside walkway. Starting to smell.',
    lat: 3.16502, lng: 101.70498, addr: 'Jalan Raja Muda Musa, Kampung Baru',
    steps: [
      { to: 'under_review', by: 'dbkl', days: 11 },
      { to: 'in_progress', by: 'dbkl', days: 9, note: 'Collection booked with Alam Flora.' },
      { to: 'resolved', by: 'dbkl', days: 7, note: 'Waste cleared and area cleaned.' },
    ],
    metoo: ['demo', 'hafiz', 'ravi'],
    comments: [['nurul', 'Cleared today, thank you!', 6.8]],
  },
  {
    by: 'arjun', cat: 'drainage', title: 'Blocked drain floods the road when it rains', days: 15,
    desc: 'Drain is full of leaves and rubbish. Every afternoon storm the junction floods ankle deep.',
    lat: 3.18012, lng: 101.68699, addr: 'Jalan Ipoh, near Sentul',
    steps: [
      { to: 'under_review', by: 'dbkl', days: 14 },
      { to: 'resolved', by: 'dbkl', days: 10, note: 'Drain cleared and grating replaced.' },
    ],
    metoo: ['nurul', 'ravi', 'demo'],
  },
  {
    by: 'ravi', cat: 'sidewalk', title: 'Broken paving outside the LRT exit', days: 2,
    desc: 'Several paving tiles are lifted and cracked. Hard for wheelchairs and prams.',
    lat: 3.13419, lng: 101.68634, addr: 'Jalan Tun Sambanthan, Brickfields',
    metoo: ['demo'],
  },
  {
    by: 'arjun', cat: 'signage', title: 'Traffic light stuck on red', days: 1,
    desc: 'Pedestrian crossing signal has been stuck on red all day.',
    lat: 3.09521, lng: 101.74011, addr: 'Jalan Cheras, Taman Connaught',
    hoax: ['hafiz', 'nurul', 'wei'],
    comments: [['hafiz', 'Just drove past and it was working fine.', 0.6]],
  },
  {
    by: 'wei', cat: 'pothole', title: 'Potholes along Jalan Universiti', days: 5,
    desc: 'A series of potholes near the Section 14 junction.',
    lat: 3.11102, lng: 101.63198, addr: 'Jalan Universiti, Section 14, Petaling Jaya',
    steps: [{ to: 'under_review', by: 'mbpj', days: 3 }],
    metoo: ['daniel', 'demo'],
  },
  {
    by: 'wei', cat: 'tree', title: 'Fallen tree blocking SS2 back lane', days: 4,
    desc: 'Tree came down in last night’s storm and is blocking the back lane completely.',
    lat: 3.11823, lng: 101.62041, addr: 'Jalan SS 2/24, Petaling Jaya',
    steps: [
      { to: 'under_review', by: 'mbpj', days: 3.9 },
      { to: 'in_progress', by: 'mbpj', days: 3.5, note: 'Landscape team on site.' },
    ],
    metoo: ['daniel'],
    comments: [['mbpj', 'Crew is cutting the trunk now. Lane should reopen by evening.', 3.4]],
  },
  {
    by: 'demo', cat: 'streetlight', title: 'Flickering lamp at Damansara Utama', days: 20,
    desc: 'Lamp post outside the row of shops flickers all night.',
    lat: 3.13612, lng: 101.62302, addr: 'Jalan SS 21/37, Damansara Utama',
    steps: [
      { to: 'under_review', by: 'mbpj', days: 19 },
      { to: 'resolved', by: 'mbpj', days: 15, note: 'Lamp replaced.' },
    ],
    metoo: ['wei', 'daniel'],
  },
  {
    by: 'demo', cat: 'sidewalk', title: 'Cracked kerb near Mid Valley', days: 8,
    desc: 'Kerb ramp is cracked and has a sharp edge.',
    lat: 3.11905, lng: 101.65295, addr: 'Jalan Klang Lama',
    initialAuthority: 'DBKL',
    steps: [{ forward: 'MBPJ', from: 'DBKL', by: 'dbkl', days: 7, note: 'This side of the road is under MBPJ.' }],
    metoo: ['ravi'],
  },
  {
    by: 'daniel', cat: 'facility', title: 'Broken bench and shelter at Kelana Jaya park', days: 7,
    desc: 'Bench is snapped and the shelter roof is cracked. Pieces are falling off.',
    lat: 3.10012, lng: 101.59803, addr: 'Taman Tasik Kelana Jaya',
    steps: [{ to: 'under_review', by: 'mbpj', days: 5 }],
    metoo: ['wei'],
  },
  {
    by: 'daniel', cat: 'pothole', title: 'Pothole at the USJ 10 roundabout', days: 3,
    desc: 'Pothole on the inner lane of the roundabout.',
    lat: 3.04812, lng: 101.58302, addr: 'Persiaran Tujuan, USJ 10, Subang Jaya',
    steps: [{ to: 'under_review', by: 'mbsj', days: 2 }],
    metoo: ['siti'],
  },
  {
    by: 'daniel', cat: 'signage', title: 'Road sign knocked over in Puchong', days: 2,
    desc: 'Direction sign bent and lying on the road shoulder after an accident.',
    lat: 3.02511, lng: 101.61702, addr: 'Jalan Puchong, Bandar Puteri',
  },
  {
    by: 'siti', cat: 'dumping', title: 'Rubbish pile at Section 7', days: 10,
    desc: 'Rubbish bags left next to the bus stop.',
    lat: 3.07302, lng: 101.49501, addr: 'Persiaran Kayangan, Seksyen 7, Shah Alam',
    steps: [{ to: 'rejected', by: 'mbsa', days: 9, note: 'This is the scheduled collection point. Bags are collected every Tuesday and Friday.' }],
  },
  {
    by: 'siti', cat: 'drainage', title: 'Drain cover missing at Section 13', days: 1.5,
    desc: 'Open drain with the cover missing, right next to the pedestrian path.',
    lat: 3.08401, lng: 101.53102, addr: 'Jalan Pahat, Seksyen 13, Shah Alam',
    metoo: ['daniel'],
  },
  {
    by: 'hafiz', cat: 'facility', title: 'Public toilet locked and broken', days: 4,
    desc: 'The public toilet at the park has been locked for two weeks and the door is broken.',
    lat: 3.15012, lng: 101.76003, addr: 'Taman Ampang Hilir',
  },
  {
    by: 'nurul', cat: 'other', title: 'Abandoned car blocking parking bays', days: 0.5,
    desc: 'Car with flat tyres has been left here for months.',
    lat: 3.16815, lng: 101.70212, addr: 'Jalan Hamzah, Kampung Baru',
  },
];

export function seed() {
  wipe();
  const ids = {};
  const hash = {};
  const color = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));
  const label = (s) => STATUSES.find((x) => x.id === s).label.toLowerCase();

  db.transaction(() => {
    const insUser = db.prepare(
      `INSERT INTO users (name, email, phone, password_hash, role, authority, home_area, verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    for (const [key, u] of Object.entries(USERS)) {
      hash[u.password] ||= bcrypt.hashSync(u.password, 10);
      ids[key] = insUser.run(u.name, u.email || null, u.phone || null, hash[u.password], u.role || 'resident', u.authority || null, u.home || null, ago(40)).lastInsertRowid;
    }

    const nameById = Object.fromEntries(Object.entries(ids).map(([k, id]) => [id, USERS[k].name]));
    const insReport = db.prepare(
      `INSERT INTO reports (user_id, title, description, category, status, lat, lng, accuracy, address, authority, hoax_flagged, reject_reason, accepted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 12, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insHistory = db.prepare(
      `INSERT INTO status_history (report_id, kind, from_status, to_status, from_authority, to_authority, note, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insVote = db.prepare('INSERT INTO votes (report_id, user_id, type, created_at) VALUES (?, ?, ?, ?)');
    const insComment = db.prepare('INSERT INTO comments (report_id, user_id, body, created_at) VALUES (?, ?, ?, ?)');
    const insPoints = db.prepare('INSERT INTO points_ledger (user_id, amount, reason, report_id, created_at) VALUES (?, ?, ?, ?, ?)');
    const insNote = db.prepare('INSERT INTO notifications (user_id, report_id, type, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const note = (userId, reportId, type, message, days) => insNote.run(userId, reportId, type, message, days > 2 ? 1 : 0, ago(days));

    for (const r of REPORTS) {
      const steps = r.steps || [];
      const statusSteps = steps.filter((s) => s.to);
      const status = statusSteps.length ? statusSteps[statusSteps.length - 1].to : 'submitted';
      const acceptStep = statusSteps.find((s) => ACCEPTED_STATUSES.includes(s.to));
      const finalAuthority = authorityFor(r.lat, r.lng);
      const metoo = (r.metoo || []).map((k) => ids[k]);
      const hoax = (r.hoax || []).map((k) => ids[k]);
      const flagged = hoax.length >= HOAX_FLAG_THRESHOLD && hoax.length > metoo.length ? 1 : 0;
      const lastDays = steps.length ? steps[steps.length - 1].days : r.days;
      const reporter = ids[r.by];

      const id = insReport.run(
        reporter, r.title, r.desc, r.cat, status, r.lat, r.lng, r.addr, finalAuthority, flagged,
        status === 'rejected' ? statusSteps.at(-1).note : null,
        acceptStep ? ago(acceptStep.days) : null,
        ago(r.days), ago(lastDays),
      ).lastInsertRowid;

      // Sample photo from server/seed-photos (seed-<id>-<category>.jpg); fall back to a drawn picture if it's missing.
      const photo = path.join(SEED_PHOTOS, `seed-${id}-${r.cat}.jpg`);
      let file;
      if (fs.existsSync(photo)) {
        file = path.basename(photo);
        fs.copyFileSync(photo, path.join(UPLOAD_DIR, file));
      } else {
        file = `seed-${id}-${r.cat}.svg`;
        fs.writeFileSync(path.join(UPLOAD_DIR, file), illustration(r.cat, color[r.cat]));
      }
      db.prepare('UPDATE reports SET photo = ? WHERE id = ?').run(`/uploads/${file}`, id);

      const startAuthority = r.initialAuthority || finalAuthority;
      insHistory.run(id, 'status', null, 'submitted', null, startAuthority, `Sent to ${authorityName(startAuthority)}`, reporter, ago(r.days));
      insPoints.run(reporter, POINTS.REPORT, 'Posted a report', id, ago(r.days));
      note(reporter, id, 'status', `Thanks. Your report "${r.title}" was sent to ${authorityName(startAuthority)}. You earned ${POINTS.REPORT} points.`, r.days);

      let prev = 'submitted';
      for (const s of steps) {
        if (s.forward) {
          insHistory.run(id, 'forward', null, null, s.from, s.forward, s.note || null, ids[s.by], ago(s.days));
          note(reporter, id, 'forward', `Your report "${r.title}" was forwarded to ${authorityName(s.forward)}, the council responsible for that spot.`, s.days);
          continue;
        }
        insHistory.run(id, 'status', prev, s.to, null, null, s.note || null, ids[s.by], ago(s.days));
        note(
          reporter, id, 'status',
          s.to === 'rejected' ? `Your report "${r.title}" was rejected: ${s.note}` : `"${r.title}" is now ${label(s.to)}.${s.note ? ` Note from the council: ${s.note}` : ''}`,
          s.days,
        );
        if (s.to === 'rejected') insPoints.run(reporter, POINTS.REJECTED, 'Report rejected', id, ago(s.days));
        prev = s.to;
      }

      metoo.forEach((uid, i) => {
        const voteDays = Math.max(r.days - 0.3 - i * 0.4, 0.05);
        insVote.run(id, uid, 'metoo', ago(voteDays));
        if (acceptStep) insPoints.run(uid, POINTS.METOO_ACCEPTED, 'Me too on an accepted report', id, ago(Math.min(voteDays, acceptStep.days)));
        note(reporter, id, 'metoo', `${nameById[uid]} said "Me too" on your report "${r.title}".`, voteDays);
      });
      hoax.forEach((uid, i) => insVote.run(id, uid, 'hoax', ago(Math.max(r.days - 0.2 - i * 0.1, 0.05))));
      for (const [k, body, days] of r.comments || []) insComment.run(id, ids[k], body, ago(days));
      if (flagged) {
        for (const [k, u] of Object.entries(USERS)) {
          if (u.authority === finalAuthority) note(ids[k], id, 'hoax', `Report #${id} "${r.title}" has been flagged as a possible hoax by the community.`, 0.4);
        }
      }
      for (const [k, u] of Object.entries(USERS)) {
        if (u.role === 'official' && u.authority === finalAuthority && status === 'submitted') {
          note(ids[k], id, 'new', `New report in your area: "${r.title}".`, r.days);
        }
      }
    }

    const insReward = db.prepare('INSERT INTO rewards (id, name, description, cost, stock) VALUES (?, ?, ?, ?, ?)');
    for (const w of REWARDS) insReward.run(w.id, w.name, w.description, w.cost, w.stock);
  })();

  console.log(`[seed] ${Object.keys(USERS).length} users, ${REPORTS.length} reports, ${REWARDS.length} rewards`);
}

// `node src/seed.js`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed();
  console.log('[seed] done. Demo login: demo@titik.my / demo123');
}
