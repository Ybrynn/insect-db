const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ── Rate Limiter ──
const rateLimitStore = new Map();
const RATE_CLEANUP_MS = 60 * 1000;

function rateLimiter(maxRequests, windowMs) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = ip + ':' + req.path;
    const now = Date.now();
    let entry = rateLimitStore.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      rateLimitStore.set(key, entry);
    }
    entry.count++;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: '请求太频繁，请稍后再试' });
    }
    next();
  };
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.start > RATE_CLEANUP_MS) rateLimitStore.delete(key);
  }
}, RATE_CLEANUP_MS);

// Apply rate limits
const authLimiter = rateLimiter(10, 60 * 1000);    // 10 req/min for auth
const apiReadLimiter = rateLimiter(100, 60 * 1000); // 100 req/min for reads
const apiWriteLimiter = rateLimiter(30, 60 * 1000); // 30 req/min for writes
const uploadLimiter = rateLimiter(10, 60 * 1000);   // 10 req/min for uploads


// ── Auth (JWT) ──
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    can_edit: !!user.can_edit,
    can_upload: !!user.can_upload,
    exp: Date.now() + JWT_EXPIRY_MS
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = { createToken, verifyToken, rateLimiter, authLimiter, apiReadLimiter, apiWriteLimiter, uploadLimiter, adminOnly, canEdit, canUpload };
