import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';
import { getUser } from './db.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function readUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, JWT_SECRET);
    return getUser(sub) || null;
  } catch {
    return null;
  }
}

export function optionalAuth(req, _res, next) {
  req.user = readUser(req);
  next();
}

export function requireAuth(req, res, next) {
  req.user = readUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please sign in first.' });
  next();
}

// FR1: posting, voting, commenting and redeeming need a verified account.
export function requireVerified(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.verified) {
      return res.status(403).json({ error: 'Verify your account to do this.', code: 'unverified' });
    }
    next();
  });
}

export function requireOfficial(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'official') return res.status(403).json({ error: 'Council staff only.' });
    next();
  });
}
