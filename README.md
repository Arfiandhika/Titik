# Titik

Civic reporting for the Klang Valley, Malaysia (pilot). Residents report damaged public infrastructure with a photo and GPS, the report is routed to the responsible local council, and residents follow it until it is fixed. The community confirms reports ("Me too") or flags them ("Hoax"), and contributions earn points that can be redeemed for rewards. Council staff work from a dashboard scoped to their own area.

HCI assignment for ITS 63504 / ITS69904 Human Computer Interaction, Taylor's University, Group 39 (earlier working name: LaporKotaku). Supports SDG 11, Sustainable Cities and Communities.

## Run it

Needs Node.js 20 or newer.

```bash
npm run setup     # one npm install for the server and the client
npm run dev       # API on http://localhost:4000 + app on http://localhost:5173
```

Open http://localhost:5173: the home page is the report feed, and the map is at `/map`. On first start the database is created and filled with demo data.

| Command | What it does |
|---|---|
| `npm run dev` | API (auto-restarts on change) and Vite dev server, which proxies `/api` and `/uploads` |
| `npm run build` | Builds the client into `client/dist` |
| `npm start` | Production: the API also serves `client/dist`, all on http://localhost:4000 |
| `npm run seed` | Wipes the SQLite database and reloads the demo data |
| `npm run phone` | Builds, starts the app and opens a public https link for testing on a phone (needs `cloudflared`, see below) |

npm 11 blocks package install scripts by default. `better-sqlite3` and `esbuild` need theirs, so they are listed under `allowScripts` in the root `package.json`. If an install still complains, run `npm install-scripts approve better-sqlite3` (or `esbuild`) in the project root.

### Use it on your phone (installable app)

Titik is an installable web app (PWA): on a phone it can be added to the home screen and opens full screen like a normal app. Phones only allow installing, GPS and the camera on an **https** link, so a local address like `http://192.168.x.x` is not enough.

1. Install Cloudflare's free tunnel tool once: `winget install --id Cloudflare.cloudflared -e` (Windows) or `brew install cloudflared` (macOS).
2. Run `npm run phone`. After a few seconds it prints a link like `https://something.trycloudflare.com`.
3. Open that link on the phone and sign in.
4. Install it: Profile > **Install the app** (Android/Chrome shows the install prompt; on iPhone it explains Share > Add to Home Screen).

Keep the computer running while you test. If you use a Google Maps key with website restrictions, add `*.trycloudflare.com/*` to its allowed websites.

The service worker only runs in production builds (`npm start` / `npm run phone`), not in `npm run dev`.

### Demo logins

The sign-in page has one-tap buttons for these.

| Role | Login | Password |
|---|---|---|
| Resident | `demo@titik.my` | `demo123` |
| Resident (phone) | `012-345 6789` | `demo123` |
| DBKL staff (Kuala Lumpur) | `dbkl@titik.my` | `official123` |
| MBPJ staff (Petaling Jaya) | `mbpj@titik.my` | `official123` |
| MBSJ staff (Subang Jaya) | `mbsj@titik.my` | `official123` |
| MBSA staff (Shah Alam) | `mbsa@titik.my` | `official123` |

New staff accounts need the staff sign-up code (`OFFICIAL_CODE`, default `TITIK-STAFF-2026`).

### Configuration (optional)

Everything works without keys. Copy the example files to turn on extras:

- `server/.env` (from `server/.env.example`)
  - `ANTHROPIC_API_KEY`: turns on the AI category suggestion on the photo step (model `claude-opus-5-5`, with server-side refusal fallback).
  - `JWT_SECRET`, `PORT`, `OFFICIAL_CODE`, `HOAX_FLAG_THRESHOLD` (default 3), `NODE_ENV=production` (hides the on-screen verification code).
- `client/.env` (from `client/.env.example`)
  - `VITE_GOOGLE_MAPS_API_KEY`: real Google Maps with street detail and address lookup. Without it, a simple built-in map shows the council areas and pins, and you can still tap to place a report.
  - `VITE_GOOGLE_MAP_ID`: Map ID for advanced markers (`DEMO_MAP_ID` is used if empty).

No email or SMS service is connected. Outside production the 6-digit verification code is shown on the verify page and printed in the server log.

## How it works

1. **Report.** A verified resident adds a photo (camera or file; resized in the browser before upload), picks a category (the AI can pre-select one), writes a title, and sets the spot by GPS or by tapping the map.
2. **Duplicate check.** Before sending, Titik lists open reports within 75 m (widened by the GPS accuracy, up to 300 m). If one is the same problem, "Same issue" adds the resident's "Me too" to it instead.
3. **Routing.** The server picks the council from the location (first matching council area, most specific first). Spots outside every area are left unrouted for staff to pick up.
4. **Tracking.** Staff move the report through Submitted, Under review, In progress, Resolved, or Rejected (a reason is required). Every change, forward and merge is kept in the report's history, and the reporter and supporters are notified.
5. **Community.** Residents say "Me too", flag a "Hoax" (at 3 hoax votes that outnumber "Me too", staff are alerted), and comment.
6. **Points.** +10 per report, +5 per "Me too" once the council accepts the report, −10 if a report is rejected. Points buy rewards and count toward badges and the leaderboard.

## Requirements

The IDs below follow the numbering used in this repository. The FR, NFR and DR lists in the group report are not in this folder, so check the descriptions against the final report and adjust the wording or numbers here if they differ. FR1, FR5, FR7 to FR13, FR16, FR18, FR19, NFR1, NFR3, NFR6 and DR3 are fixed by the project brief (`CLAUDE.md`).

### Functional requirements

| ID | Requirement | Where |
|---|---|---|
| FR1 | Register with email or Malaysian mobile number and verify with a 6-digit code. Posting, voting, commenting and redeeming need a verified account. | `server/api-auth.js`, `requireVerified` in `server/auth.js`, `client/src/pages/AuthPages.jsx` |
| FR2 | Sign in and sign out; "Forgot password" resets it with a code (5 wrong tries cancel the code). | `POST /api/auth/login`, `/api/auth/forgot`, `/api/auth/reset`, `LoginPage`, `ForgotPage`, "Sign out" on `ProfilePage.jsx` |
| FR3 | View and edit own profile (name, neighbourhood). The profile opens Leaderboard, Security (change password, change email with a code, forgot password) and Customer support (FAQ, contact form). Public profiles show name, stats and badges. | `PATCH /api/auth/me`, `/api/auth/email`, `/api/support`, `GET /api/users/:id`, `ProfilePage.jsx`, `SettingsPages.jsx` |
| FR4 | Create a report with a photo from the camera or a file. Owners can edit or delete it while it is still Submitted. | `POST/PATCH/DELETE /api/reports`, `NewReportPage.jsx`, `ReportDetailPage.jsx` |
| FR5 | Categorise the issue from a fixed list defined on the server. | `CATEGORIES` in `server/config.js`, `/api/meta`, `client/src/meta.jsx` |
| FR6 | Detect location by GPS, adjust it on the map, add a street or landmark. | `LocationPicker.jsx`, `PickMap` in `GoogleMap.jsx`, `client/src/utils.js` |
| FR7 | "Me too": confirm someone else's report. Pressing again takes the vote back. | `POST /api/reports/:id/vote`, `VoteButtons.jsx` |
| FR8 | "Hoax": flag a false report. The flag trips at the threshold and alerts the council. | `refreshHoaxFlag` in `api-reports.js`, `VoteButtons.jsx` |
| FR9 | Warn about nearby open reports before posting and offer "Same issue". | `GET /api/reports/duplicates`, duplicate panel in `NewReportPage.jsx` |
| FR10 | Track status: Submitted, Under review, In progress, Resolved, or Rejected. | `STATUSES` in `config.js`, `PATCH /api/reports/:id/status`, `StatusTimeline.jsx`, "My reports" tab |
| FR11 | Notifications for status changes, forwards, merges, "Me too", comments, hoax flags and rewards. | `notify` / `notifyAuthority` in `db.js`, `/api/notifications`, bell dropdown in `NotificationsPanel.jsx` (opened from `Navbar.jsx`) |
| FR12 | Route each report to the council responsible for its location. | `AUTHORITIES` in `config.js`, `authorityFor` in `db.js` |
| FR13 | Contribution points, badges, rewards and a leaderboard. | `points_ledger`, `addPoints` in `db.js`, `/api/points`, `/api/rewards`, `/api/leaderboard`, `RewardsPage.jsx`, `Leaderboard.jsx` (shown on the Profile page) |
| FR14 | Interactive map with Open / Fixed / All / Mine tabs (Mine shows all your own reports with a status-coloured outline; rejected reports never show on the public map) and pin clustering when zoomed out, plus a photo feed (category "stories" strip, status/text filters, double-tap for "Me too") and "Near me". | `GET /api/reports`, `MapPage.jsx`, `ReportsPage.jsx`, `FeedPost.jsx`, `ReportMap` in `GoogleMap.jsx` |
| FR15 | Comment on reports (staff comments are marked). On the feed, the comment button opens a bottom sheet with the keyboard ready. | `/api/reports/:id/comments`, `Comments.jsx`, `Sheet` in `ui.jsx`, `FeedPost.jsx` |
| FR16 | Staff forward a report to another council. | `POST /api/reports/:id/forward`, `StaffPanel` in `ReportDetailPage.jsx` |
| FR17 | Staff dashboard scoped to their council: counts, breakdowns and work queues. | `GET /api/stats`, `GET /api/reports?area=mine`, `DashboardPage.jsx` |
| FR18 | Rejecting a report requires a reason, shown to the reporter. | `PATCH /api/reports/:id/status` (server check), `StaffPanel` |
| FR19 | Staff merge a duplicate into the main report. Its reporter and supporters become "Me too" on the main report. | `POST /api/reports/:id/merge`, `StaffPanel` |
| FR20 | AI suggests a category (and title) from the photo. | `server/ai.js`, `POST /api/ai/classify`, `AiStatus` in `NewReportPage.jsx` |

### Non-functional requirements

| ID | Requirement | Where |
|---|---|---|
| NFR1 | Privacy: other users only ever see a display name, never an email or phone number. | `publicUser` / `selfUser` in `db.js` |
| NFR2 | Usability: works on phones (390 px wide, installable as an app) and desktop, dark or light mode (sun/moon button, follows the device by default, with a 0.6 s cross-fade), with a floating icon dock (Reports, Map, Rewards/Dashboard, Profile) and a bottom-right "Report a problem" button; follows Nielsen's heuristics (see below). | `client/src/styles.css`, `Navbar.jsx` |
| NFR3 | Location accuracy: high-accuracy GPS with the accuracy shown; weak fixes prompt the user to adjust the pin; duplicate radius grows with GPS accuracy (75 m to 300 m). | `utils.js`, `LocationPicker.jsx`, `/api/reports/duplicates` |
| NFR4 | Security: bcrypt password hashes, signed JWT sessions, role and area checks on the server for every staff action, upload type and size limits. | `server/auth.js`, `api-reports.js` |
| NFR5 | Performance: photos are resized in the browser (max 1600 px JPEG) before upload; lists and the map load in one request; map pins cluster (supercluster) so thousands of reports stay readable and fast. | `client/src/utils.js` |
| NFR6 | AI is only a suggestion: the resident always chooses, and the app works fully with AI turned off. | `ai.js` returns `null` on any failure; category picker in `NewReportPage.jsx` |

### Data requirements

One SQLite table per data requirement, defined in `server/db.js`.

| ID | Data | Table |
|---|---|---|
| DR1 | User accounts: name, email or phone, password hash, role, council, verification | `users` |
| DR2 | Reports: title, details, category, status, location and accuracy, address, photo, council, AI hint, hoax flag, merge link, reject reason | `reports` |
| DR3 | History of status changes, forwards and merges | `status_history` |
| DR4 | "Me too" and "Hoax" votes, one per user per report | `votes` |
| DR5 | Comments | `comments` |
| DR6 | Notifications | `notifications` |
| DR7 | Points ledger (the balance is always the sum) | `points_ledger` |
| DR8 | Rewards catalogue and stock | `rewards` |
| DR9 | Redemptions with claim codes | `redemptions` |
| (extra) | One-time codes for email change and password reset; customer support messages | `account_codes`, `support_tickets` |

## Nielsen's usability heuristics in the prototype

| Heuristic | Examples |
|---|---|
| 1. Visibility of system status | Status progress bar and full timeline on every report; unread count on the bell; loading states; toasts after each action; "Goes to Dewan Bandaraya Kuala Lumpur" before posting |
| 2. Match with the real world | Plain labels ("Me too", "Hoax", "Same issue", "Fixed"); council names residents know; category icons for potholes, lights, drains |
| 3. User control and freedom | Tap a vote again to take it back; Back and Cancel on every step of the report form; edit or delete a report until the council starts on it |
| 4. Consistency and standards | One set of status colours and icons everywhere; same report card on the map, list and profile; one accent colour for primary actions |
| 5. Error prevention | Duplicate check before posting; step-by-step validation; reject needs a reason; confirm dialogs for delete and redeem; warnings for weak GPS or spots outside the pilot area |
| 6. Recognition rather than recall | Category picker with icons and hints; nearby reports shown on the location map; demo login buttons |
| 7. Flexibility and efficiency | Sign up with email or phone; GPS or tap-to-place; filters, search and "Near me"; staff work queues sorted oldest first |
| 8. Aesthetic and minimalist design | Dark theme with a single accent; one primary action per screen; details only where needed |
| 9. Help users recover from errors | Specific messages ("Location permission is off. Allow it in your browser, or pick the spot on the map."); inline field errors |
| 10. Help and documentation | Hints under fields; empty states that say what to do next; points rules on the rewards page |

## Project layout

```
package.json        one install for everything (npm run setup / dev / build / start / seed)
server/
  index.js          Express app, static files, error handler, auto-seed on empty DB
  config.js         categories, statuses, councils, points rules, rewards, badges
  db.js             schema (one table per DR) and helpers
  auth.js           auth middleware
  api-auth.js       register, verify, login, me
  api-reports.js    reports, votes, comments, status, forward, merge
  api-misc.js       meta, AI, notifications, profiles, points, rewards, leaderboard, stats
  ai.js             photo -> category suggestion (Claude)
  seed.js           demo data; illustrations.js draws the sample report images
client/
  index.html, vite.config.js
  public/           favicon, app icons, manifest.webmanifest, sw.js (installable app)
  src/
    main.jsx, App.jsx, styles.css
    api.js, auth.jsx, meta.jsx, icons.jsx, utils.js   shared helpers
    components/     ui.jsx (badges, modal, toasts), Navbar, FeedPost, GoogleMap, LocationPicker, ReportCard, ...
    pages/          Map, Reports, New report, Report detail (with staff panel), Dashboard, Rewards, ...
```

`server/data/` (SQLite) and `server/uploads/*` are generated at runtime and are git-ignored.

## Limits of the prototype

- Council areas are rough rectangles, good enough for the pilot demo but not real boundaries.
- Verification, email-change and password-reset codes are not actually sent; there is no email or SMS provider.
- Customer support messages are saved, but there is no support inbox for staff yet.
- Changing or resetting a password does not sign out other devices that are already signed in.
- Rewards and claim codes are simulated.
- There is no automated test suite. Check changes by running the app.
