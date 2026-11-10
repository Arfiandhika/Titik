import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { PORT, AI_ENABLED } from './config.js';
import { isEmpty, UPLOAD_DIR } from './db.js';
import authRoutes from './api-auth.js';
import reportRoutes from './api-reports.js';
import miscRoutes from './api-misc.js';
import { seed } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(here, '..', 'client', 'dist');

if (isEmpty()) {
  console.log('[seed] empty database, loading demo data');
  seed();
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', miscRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

// Production: serve the built client and let React Router handle the paths.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      maxAge: '1h',
      // The service worker and manifest must always be fresh so app updates reach phones.
      setHeaders: (res, file) => /(sw\.js|manifest\.webmanifest)$/.test(file) && res.setHeader('Cache-Control', 'no-cache'),
    }),
  );
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large (8 MB max).' : 'Could not read the upload.';
    return res.status(400).json({ error: msg });
  }
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Titik API on http://localhost:${PORT}  (AI suggestion ${AI_ENABLED ? 'on' : 'off'})`);
});
