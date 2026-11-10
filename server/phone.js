// `npm run phone`: start the built app and open a public https link with Cloudflare's free tunnel,
// so the installable app, GPS and camera can be tested on a real phone.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 4000;

// Find cloudflared: on PATH, or where installers put it (a new terminal may not see PATH changes yet).
function findCloudflared() {
  if (spawnSync('cloudflared', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0) return 'cloudflared';
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(process.env.ProgramFiles || '', 'cloudflared', 'cloudflared.exe'),
          path.join(process.env['ProgramFiles(x86)'] || '', 'cloudflared', 'cloudflared.exe'),
          path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe'),
        ]
      : ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared'];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

const cloudflared = findCloudflared();
if (!cloudflared) {
  console.log(`
  cloudflared is not installed. It makes the https link your phone needs.

  Install it once, then run "npm run phone" again:
    Windows:  winget install --id Cloudflare.cloudflared -e
    macOS:    brew install cloudflared

  (If you just installed it, open a new terminal first.)
`);
  process.exit(1);
}

const app = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', env: { ...process.env, PORT: String(PORT) } });
const tunnel = spawn(cloudflared, ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });

let shown = false;
const watch = (data) => {
  const url = String(data).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (url && !shown) {
    shown = true;
    console.log(`\n  Open this on your phone:  ${url}\n  Then Profile > Install the app. Press Ctrl+C to stop.\n`);
  }
};
tunnel.stdout.on('data', watch);
tunnel.stderr.on('data', watch);

const stop = () => {
  app.kill();
  tunnel.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
app.on('exit', (code) => {
  tunnel.kill();
  process.exit(code ?? 0);
});
tunnel.on('exit', (code) => {
  if (!shown) console.log('\n  The tunnel stopped before giving a link. Check your internet connection and try again.\n');
  app.kill();
  process.exit(code ?? 1);
});
