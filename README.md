# Titik

![Titik Logo](LogoTitik.png)

Civic reporting around Malaysia (pilot). Residents report damaged public infrastructure with a photo and GPS, the report is routed to the responsible local council, and residents follow it until it is fixed. The community confirms reports ("Me too") or flags them ("Hoax"), and contributions earn points that can be redeemed for rewards. Council staff work from a dashboard scoped to their own area.

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


## Limits of the prototype

- Council areas are rough rectangles, good enough for the pilot demo but not real boundaries.
- Verification, email-change and password-reset codes are not actually sent; there is no email or SMS provider.
- Customer support messages are saved, but there is no support inbox for staff yet.
- Changing or resetting a password does not sign out other devices that are already signed in.
- Rewards and claim codes are simulated.
- There is no automated test suite. Check changes by running the app.
