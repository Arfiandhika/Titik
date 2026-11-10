import { useEffect, useState } from 'react';

// Small helpers: dates and numbers, GPS, photo compression.

// format
// Server timestamps are SQLite UTC ("YYYY-MM-DD HH:MM:SS") or ISO strings.
export function parseDate(s) {
  if (!s) return null;
  if (s.includes('T')) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

export function timeAgo(s) {
  const d = parseDate(s);
  if (!d) return '';
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d ago`;
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: day > 300 ? 'numeric' : undefined });
}

export function dateTime(s) {
  const d = parseDate(s);
  return d ? d.toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

export function distance(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// geo
// Ask for a fresh, high-accuracy fix and report the accuracy radius.
export function getPosition({ timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device cannot share its location. Pick the spot on the map.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (err) => {
        const msg =
          err.code === 1
            ? 'Location permission is off. Allow it in your browser, or pick the spot on the map.'
            : 'Could not get your location. Pick the spot on the map instead.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
  });
}

export function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function inBounds({ lat, lng }, [s, w, n, e]) {
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

export function formatCoords({ lat, lng }) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// image
// Shrink photos before upload so reports send quickly on mobile data.
export async function compressImage(file, { maxSide = 1600, quality = 0.82 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Formats the browser cannot decode (e.g. some HEIC) are sent as they are.
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 900 * 1024 && file.type === 'image/jpeg') return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

// theme
// Light or dark. Follows the device until the user picks one; the choice is remembered.
const THEME_KEY = 'titik-theme';
const systemTheme = () => (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#fbf6f1' : '#192C31');
}
// Cross-fade the whole page when the theme changes (about 0.6 s).
// Uses the View Transitions API where available, else CSS colour transitions.
function fadeTheme(swap) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return swap();
  if (document.startViewTransition) return document.startViewTransition(swap);
  const root = document.documentElement;
  root.classList.add('theme-fade');
  swap();
  clearTimeout(fadeTheme.t);
  fadeTheme.t = setTimeout(() => root.classList.remove('theme-fade'), 700);
  return undefined;
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => document.documentElement.dataset.theme || savedTheme() || systemTheme());
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const onChange = (e) => {
      if (e.key === THEME_KEY || e.type === 'titik-theme') setThemeState(savedTheme() || systemTheme());
    };
    window.addEventListener('storage', onChange);
    window.addEventListener('titik-theme', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('titik-theme', onChange);
    };
  }, []);
  const setTheme = (t) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* private mode: still switch for this visit */
    }
    const swap = () => {
      applyTheme(t);
      setThemeState(t);
      window.dispatchEvent(new Event('titik-theme'));
    };
    fadeTheme(swap);
  };
  return [theme, setTheme];
}

// install as an app (PWA)
// Android/desktop Chrome fire beforeinstallprompt; we keep it so an "Install" button can use it.
// iPhone has no prompt: people use Share > Add to Home Screen.
let installEvent = null;
const installListeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    installListeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    installListeners.forEach((f) => f());
  });
}
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    installListeners.add(f);
    return () => installListeners.delete(f);
  }, []);
  const ua = navigator.userAgent;
  return {
    installed: isStandalone(),
    canPrompt: Boolean(installEvent),
    isIOS: /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1),
    async prompt() {
      if (!installEvent) return false;
      installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      installEvent = null;
      installListeners.forEach((f) => f());
      return outcome === 'accepted';
    },
  };
}
