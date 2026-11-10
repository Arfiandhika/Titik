# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Titik** — a civic reporting app for the Klang Valley, Malaysia pilot. Residents report damaged public infrastructure with a photo and GPS. Reports are routed to the responsible local council, and residents track them until fixed. The community confirms reports ("Me too") or flags them ("Hoax"), and contributions earn points that can be redeemed for rewards. Council staff use an area-scoped dashboard.

This is a university HCI assignment (ITS 63504 / ITS69904, Taylor's University, Group 39). Requirement IDs (FR1–FR20, NFR1–NFR6, DR1–DR9) come from the assignment document; `README.md` maps each one to the code. When you add or change a feature, keep that mapping accurate and mention the requirement ID in code comments where it helps.

## Commands

Run from the repo root (Node.js 20+):

```bash
npm run setup     # one npm install for the server and the client
npm run dev       # API on :4000 + Vite dev server on :5173 (proxies /api and /uploads)
npm run build     # build the client into client/dist
npm start         # production: server serves the API and client/dist on :4000
npm run seed      # wipe the SQLite database and reload the demo data
npm run phone     # build + start + https tunnel (needs cloudflared) to test the installed app on a phone
```

There is no automated test suite. Verify changes by running the app (`npm run dev`) and exercising the flow in a browser, or with `curl` against `http://localhost:4000/api`. Always run `npm run build` to catch client compile errors.

Demo logins (created on first start / `npm run seed`): resident `demo@titik.my` / `demo123`, resident by phone `012-345 6789` / `demo123`, DBKL staff `dbkl@titik.my` / `official123`, MBPJ staff `mbpj@titik.my` / `official123`.

## Stack

- **Server** (`server/`): Node.js + Express 4, ES modules, plain JavaScript. SQLite via `better-sqlite3` (synchronous). JWT auth (`jsonwebtoken`, `bcryptjs`), uploads via `multer`, AI via `@anthropic-ai/sdk`.
- **Client** (`client/`): React 18 + Vite 5, React Router 6, plain JavaScript (JSX). Google Maps via `@vis.gl/react-google-maps`, icons from `lucide-react`, font `@fontsource-variable/inter`. Styling is one hand-written stylesheet, `client/src/styles.css` (no Tailwind or CSS-in-JS).

## Layout

One `package.json` at the root (no separate server/client installs). Vite runs with `--config client/vite.config.js`.

```
server/
  index.js          Express app, static files, error handler, auto-seed on empty DB
  config.js         categories, statuses, authorities (council boxes), points rules, thresholds; loads server/.env
  db.js             schema (one table per DR), helpers: addPoints, pointsBalance, notify,
                    notifyAuthority, authorityFor, selfUser, publicUser
  auth.js           optionalAuth / requireAuth / requireVerified / requireOfficial middleware
  api-auth.js       register (email or phone), verify code, resend, login, me, change email (code),
                    forgot / reset password (code; `account_codes` table, 5 tries)
  api-reports.js    list, duplicates, create, edit, delete, status, forward, merge, vote, comments
  api-misc.js       meta, AI classify, notifications, profiles, points, rewards, leaderboard, stats,
                    customer support (`support_tickets`; topics from SUPPORT_TOPICS in config.js)
  ai.js             photo → category suggestion (Claude, structured JSON output)
  seed.js           demo data; sample report photos come from seed-photos/ (seed-<id>-<category>.jpg),
                    illustrations.js draws an SVG fallback if a photo is missing
  phone.js          `npm run phone`: runs the app + a cloudflared https tunnel and prints the phone link
client/src/
  App.jsx           routes + RequireAuth (role / verified guards)
  api.js (fetch wrapper), auth.jsx, meta.jsx (categories etc. from /api/meta),
  icons.jsx (all category/status/badge icons), utils.js (dates, numbers, GPS, image compression)
  components/       ui.jsx (StatusBadge, CategoryLabel, Avatar, Spinner, Loading, Empty, Dropdown, Modal, Confirm, Toast),
                    Navbar (top bar + floating bottom dock + report button), NotificationsPanel (bell dropdown; no notifications page), Leaderboard (on Profile and /leaderboard),
                    GoogleMap (provider, pins, fallback), LocationPicker, ReportCard, FeedPost, VoteButtons,
                    Comments, StatusTimeline
  pages/            MapPage, ReportsPage, NewReportPage, ReportDetailPage (incl. StaffPanel),
                    DashboardPage, RewardsPage, ProfilePage, AuthPages (incl. ForgotPage),
                    SettingsPages (Leaderboard, Security, Support pages opened from Profile)
```

Keep the layout flat: put new shared helpers in `utils.js` and small shared UI in `components/ui.jsx` rather than adding new folders.

## Domain rules (keep these intact)

- **Categories** (FR5) are defined once in `server/config.js` and served by `/api/meta`. The client must not hard-code the list; icons live in `client/src/icons.jsx` (`CATEGORY_ICONS`), keyed by category id.
- **Statuses** (FR10): `submitted → under_review → in_progress → resolved`, or `rejected`. Rejecting **requires a reason** (FR18), which is enforced on the server.
- **Routing** (FR12): `authorityFor(lat, lng)` picks the first matching council box in `AUTHORITIES` order (most specific first). Staff may only act on reports in their own authority or unrouted ones (`inMyArea`); otherwise they forward (FR16).
- **Points** (FR13) are rows in `points_ledger`; the balance is always the SUM. Never store a balance column. Use `addPoints(userId, amount, reason, { reportId })`. Current rules: +10 per report; +5 for each "Me too" once the report is accepted (first move to under_review/in_progress/resolved); −10 when a report is rejected; redemptions subtract the reward cost.
- **Votes** (FR7/FR8): one row per (report, user); sending the same vote again removes it. Hoax flag trips at `HOAX_FLAG_THRESHOLD` hoax votes that outnumber "Me too", and notifies the authority.
- **Duplicates** (FR9, NFR3): the search radius is 75 m, widened by GPS accuracy up to 300 m. "Same issue" posts a `metoo` vote with `via: 'duplicate'`.
- **Merge** (FR19): the duplicate gets `merged_into` and status `rejected`; its reporter and supporters become "Me too" on the main report. Lists exclude merged reports.
- **Privacy** (NFR1): anything returned about *another* user goes through `publicUser()` (display name only, never email or phone). `selfUser()` is only for the signed-in user.
- **Verification** (FR1): posting, voting, commenting and redeeming use `requireVerified`. No SMS/email provider is connected; in non-production the code is logged and returned as `devCode`. Email-change and password-reset codes work the same way.
- **History** (DR3): every status change, forward and merge inserts a `status_history` row (`kind` = `status` | `forward` | `merge`), and the affected users get a notification (FR11).
- Database changes go in the `CREATE TABLE IF NOT EXISTS` block in `db.js`. There are no migrations, so after a schema change run `npm run seed`, or delete `server/data/` to recreate the database.

## Design rules

Dark by default with a light mode, minimal, one accent. Use the CSS variables in `styles.css`; don't introduce new hex colours for UI chrome. Light-mode values live in the `:root[data-theme='light']` block; when you add a token, give it a light value there too.

| Token | Value |
|---|---|
| `--primary` | `#B5F0D2` (buttons, active states, resolved status) |
| `--on-primary` | `#192C31` (text on primary) |
| `--bg` | `#192C31` |
| `--card` | `#243B40` |
| `--text` | `#F1F5F4` |
| `--muted` | `#9BB3B1` |

- Theme: the sun/moon button in the top bar sets `data-theme` on `<html>` via `useTheme()` in `utils.js` (follows the device until chosen, saved in localStorage; `index.html` sets it before first paint; switching cross-fades over 0.6 s via the View Transitions API, with a CSS fallback). Use `--primary` for fills (buttons, active dock item) and `--accent` for accent-coloured text, icons and borders, since mint text is unreadable on white.
- Font: Inter (already bundled). Weights 400/500/600 only. Headings are 600 with slight negative letter-spacing.
- Icons: Lucide only, thin strokes (1.75), single colour. **No emoji** in the UI or in notification text.
- Status colours come from the `.st-<status>` classes (`--st` variable); category colours come from `/api/meta`.
- Routes: `/` is the home feed (`ReportsPage`), `/map` is the map; `/reports` redirects to `/`, report details stay at `/reports/:id`.
- Main navigation is the floating icon dock at the bottom centre (Reports, Map, Rewards or Dashboard for staff, Profile) on every screen size; "Report a problem" is the rounded-square button at bottom right, shown only on the home feed (`/`), and is the only report button; pages don't add their own (empty states just mention the + button). Keep pages usable at 390px width with no horizontal scroll.
- Filter and sort menus use `Dropdown` from `ui.jsx` (styled, with icons and a checkmark) rather than a native `<select>`; plain form fields can keep `<select className="select">`.
- Map (`MapPage`, `ReportMap` in `GoogleMap.jsx`): filters are two `Dropdown`s (Show: Open / Fixed / All / Mine, and Category) plus a Near-me button; no page title. "All" excludes rejected; "Mine" (residents) uses `mine=1` and outlines pins by status. Pins cluster with `supercluster` (radius 60 px, individual pins from zoom 17); the selected report is never clustered. `/map?view=<tab>&report=<id>` opens a report (the location line on feed posts links there). The map loads up to 500 reports (server cap) for now.
- Comments: `Comments` has an Instagram-style composer (auto-growing box + Post). On the feed it opens in a `Sheet` (bottom sheet on phones, stays above the keyboard); call `primeKeyboard()` in the tap handler so iOS opens the keyboard.
- Installable app (PWA): `client/public/` holds `manifest.webmanifest`, `sw.js`, `favicon.svg` and the PNG icons (served at fixed URLs; Vite `publicDir`). `main.jsx` registers the service worker in production builds only. The worker caches built files and pages (network first) but never `/api` or `/uploads`. When you change caching, bump `CACHE` in `sw.js`. `useInstall()` in `utils.js` drives Profile > "Install the app". The top bar pads for the iPhone status bar with `--safe-t`.
- Keep copy short and plain. Labels like "Me too", "Hoax" and "Same issue" are fixed terms from the assignment.

## Configuration

- `server/.env` (see `.env.example`): `PORT`, `JWT_SECRET`, `ANTHROPIC_API_KEY` (enables AI suggestion), `OFFICIAL_CODE` (staff sign-up code), `HOAX_FLAG_THRESHOLD`, `NODE_ENV=production` (hides dev verification codes).
- `client/.env`: `VITE_GOOGLE_MAPS_API_KEY` (maps show a fallback panel without it), `VITE_GOOGLE_MAP_ID`.
- AI model: `claude-opus-5-5` with server-side refusal fallback; the category is only ever a suggestion (NFR6), so the app must work with AI disabled.

## Conventions

- API errors: `res.status(4xx).json({ error: 'Human-readable message.' })`; the client shows `error` in a toast or inline.
- Multi-step DB writes go in `db.transaction(() => { ... })()`.
- Keep server code synchronous with `better-sqlite3` (no async DB wrappers).
- New pages: add the route in `App.jsx`, wrap in `RequireAuth` (with `verified` or `role="official"` as needed), and add a nav entry in `Navbar.jsx` if users should reach it directly.
- Update `README.md` (requirements table, run instructions) when behaviour or setup changes.
- `server/data/` (SQLite) and `server/uploads/*` are generated; never commit them.
