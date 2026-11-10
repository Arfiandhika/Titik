import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load server/.env wherever the command is run from.
dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)) });

export const PORT = Number(process.env.PORT) || 4000;
export const JWT_SECRET = process.env.JWT_SECRET || 'titik-dev-secret-change-me';
export const OFFICIAL_CODE = process.env.OFFICIAL_CODE || 'TITIK-STAFF-2026';
export const IS_PROD = process.env.NODE_ENV === 'production';
export const HOAX_FLAG_THRESHOLD = Number(process.env.HOAX_FLAG_THRESHOLD) || 3;

// FR5: the one place categories are defined. The client reads them from /api/meta.
export const CATEGORIES = [
  { id: 'pothole', label: 'Pothole', color: '#F2A65A', hint: 'Holes or cracks in the road surface' },
  { id: 'streetlight', label: 'Street light', color: '#F4D35E', hint: 'Broken, flickering or dark street lights' },
  { id: 'dumping', label: 'Illegal dumping', color: '#C98BDB', hint: 'Rubbish or bulky waste left in public' },
  { id: 'drainage', label: 'Drain / flooding', color: '#6FB7E8', hint: 'Blocked drains, broken covers, flash-flood spots' },
  { id: 'sidewalk', label: 'Damaged sidewalk', color: '#E58F8F', hint: 'Broken paving, kerbs or ramps' },
  { id: 'signage', label: 'Road sign / signal', color: '#8FD3C1', hint: 'Damaged, missing or faulty signs and traffic lights' },
  { id: 'tree', label: 'Fallen tree', color: '#9CCB7A', hint: 'Fallen trees or branches blocking the way' },
  { id: 'facility', label: 'Public facility', color: '#B9A6F0', hint: 'Parks, playgrounds, bus stops, public toilets' },
  { id: 'other', label: 'Other', color: '#A9B8B6', hint: 'Anything else that needs council attention' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

// FR10: report lifecycle.
export const STATUSES = [
  { id: 'submitted', label: 'Submitted' },
  { id: 'under_review', label: 'Under review' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'rejected', label: 'Rejected' },
];
export const STATUS_IDS = STATUSES.map((s) => s.id);
export const ACCEPTED_STATUSES = ['under_review', 'in_progress', 'resolved'];

// FR12: council areas as rough bounding boxes for the Klang Valley pilot.
// Order matters: the first box that contains the point wins, so smaller areas come first.
export const AUTHORITIES = [
  { id: 'PPJ', name: 'Perbadanan Putrajaya', short: 'Putrajaya', box: [2.88, 101.65, 2.99, 101.73] },
  { id: 'MBPJ', name: 'Majlis Bandaraya Petaling Jaya', short: 'Petaling Jaya', box: [3.07, 101.57, 3.17, 101.655] },
  { id: 'MBSJ', name: 'Majlis Bandaraya Subang Jaya', short: 'Subang Jaya', box: [2.98, 101.55, 3.07, 101.66] },
  { id: 'MPAJ', name: 'Majlis Perbandaran Ampang Jaya', short: 'Ampang Jaya', box: [3.1, 101.745, 3.22, 101.82] },
  { id: 'DBKL', name: 'Dewan Bandaraya Kuala Lumpur', short: 'Kuala Lumpur', box: [3.03, 101.61, 3.25, 101.76] },
  { id: 'MBSA', name: 'Majlis Bandaraya Shah Alam', short: 'Shah Alam', box: [2.95, 101.44, 3.17, 101.57] },
  { id: 'MBDK', name: 'Majlis Bandaraya Diraja Klang', short: 'Klang', box: [2.9, 101.3, 3.15, 101.44] },
  { id: 'MPS', name: 'Majlis Perbandaran Selayang', short: 'Selayang', box: [3.2, 101.5, 3.4, 101.745] },
];

// Pilot service area (used to warn about reports far outside the Klang Valley).
export const SERVICE_BOUNDS = [2.85, 101.25, 3.45, 101.85];
export const MAP_CENTER = { lat: 3.139, lng: 101.6869 };

// FR13: contribution points.
export const POINTS = {
  REPORT: 10,
  METOO_ACCEPTED: 5,
  REJECTED: -10,
};

// FR9 / NFR3: duplicate search.
export const DUPLICATE_RADIUS_M = 75;
export const DUPLICATE_MAX_RADIUS_M = 300;

// FR13: rewards catalogue (copied into the rewards table on seed).
export const REWARDS = [
  { id: 'tree', name: 'Plant a tree in your name', cost: 50, description: 'A sapling planted with a local green group, with your name on the planting list.', stock: 200 },
  { id: 'parking', name: 'Council parking voucher', cost: 80, description: 'Two hours of street parking in your council area.', stock: 150 },
  { id: 'transit', name: 'Rail day pass', cost: 150, description: 'Unlimited LRT, MRT and monorail rides for one day.', stock: 80 },
  { id: 'ewallet', name: 'RM10 e-wallet credit', cost: 200, description: 'Credited to the mobile number on your account.', stock: 100 },
  { id: 'cleanup', name: 'Community clean-up kit', cost: 120, description: 'Gloves, grabbers and bags for a neighbourhood clean-up.', stock: 40 },
];

// Badges are earned from activity counts (shown on profiles and the leaderboard).
// Customer support topics (shown in the contact form).
export const SUPPORT_TOPICS = [
  { id: 'report', label: 'A report I posted' },
  { id: 'account', label: 'My account or sign-in' },
  { id: 'points', label: 'Points and rewards' },
  { id: 'bug', label: 'Something is not working' },
  { id: 'other', label: 'Something else' },
];

export const BADGES = [
  // `color` is the badge's own theme colour (medal tint on Rewards, Profile and the leaderboard).
  { id: 'first_report', label: 'First report', color: '#F2A65A', description: 'Posted a first report', test: (s) => s.reports >= 1 },
  { id: 'watchful', label: 'Neighbourhood watch', color: '#6FB7E8', description: 'Posted 10 reports', test: (s) => s.reports >= 10 },
  { id: 'confirmer', label: 'Confirmer', color: '#B9A6F0', description: 'Said "Me too" on 10 reports', test: (s) => s.metoos >= 10 },
  { id: 'fixer', label: 'Got it fixed', color: '#F4D35E', description: '3 of your reports were resolved', test: (s) => s.resolved >= 3 },
  { id: 'voice', label: 'Community voice', color: '#E58F8F', description: 'Wrote 10 comments', test: (s) => s.comments >= 10 },
];

export const AI_MODEL = 'claude-opus-5-5';
export const AI_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY);
