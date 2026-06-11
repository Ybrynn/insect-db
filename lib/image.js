const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { DATA_DIR, query, queryOne, execute } = require('./db');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(DATA_DIR, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (ok.includes(ext)) return cb(null, true);
    cb(new Error('仅支持 JPG/PNG/GIF/WebP/BMP 格式'));
  }
});

async function computeHash(imagePath) {
  const { data } = await sharp(imagePath)
    .grayscale()
    .resize(9, 9, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col;
      bits += data[idx] > data[idx + 1] ? '1' : '0';
      bits += data[idx] > data[idx + 9] ? '1' : '0';
      bits += data[idx] > data[idx + 10] ? '1' : '0';
      bits += data[idx + 1] > data[idx + 9] ? '1' : '0';
    }
  }
  const hex = BigInt('0b' + bits).toString(16);
  return hex.padStart(64, '0');
}

function hammingDistance(h1, h2) {
  const len = Math.min(h1.length, h2.length);
  let d = 0;
  for (let i = 0; i < len; i++) {
    const x = parseInt(h1[i], 16) ^ parseInt(h2[i], 16);
    d += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return d;
}

function hashBits(hex) {
  return hex.length * 4;
}

// GWO (Grey Wolf Optimizer) for adaptive hash component weighting
let gwoWeights = [0.4, 0.2, 0.2, 0.2];
let gwoIterCount = 0;

function hashComponents(hex) {
  const len = Math.floor(hex.length / 4);
  return [hex.slice(0, len), hex.slice(len, 2 * len), hex.slice(2 * len, 3 * len), hex.slice(3 * len)];
}

function weightedSimilarity(qc, dc, w) {
  let sim = 0;
  for (let i = 0; i < 4; i++) {
    sim += w[i] * (1 - hammingDistance(qc[i], dc[i]) / 64);
  }
  return sim;
}

function gwoOptimize(queryHash, posHash, allHashes) {
  const qc = hashComponents(queryHash);
  const pc = hashComponents(posHash);
  const dbComps = allHashes.map(hashComponents);
  const dim = 4, popSize = 15, maxIter = 25;

  function fitness(w) {
    const posSim = weightedSimilarity(qc, pc, w);
    let maxOther = -1;
    for (const comp of dbComps) {
      if (comp.every((v, i) => v === pc[i])) continue;
      const s = weightedSimilarity(qc, comp, w);
      if (s > maxOther) maxOther = s;
    }
    return maxOther < 0 ? posSim : (posSim - maxOther) * 10 + posSim;
  }

  let wolves = [{ pos: [...gwoWeights] }];
  for (let i = 1; i < popSize; i++) {
    const raw = Array.from({ length: dim }, () => Math.random());
    const sum = raw.reduce((a, b) => a + b, 0);
    wolves.push({ pos: raw.map(x => x / sum) });
  }
  for (const w of wolves) w.fitness = fitness(w.pos);

  wolves.sort((a, b) => b.fitness - a.fitness);
  let alpha = { pos: [...wolves[0].pos], fitness: wolves[0].fitness };
  let beta  = { pos: [...wolves[1].pos], fitness: wolves[1].fitness };
  let delta = { pos: [...wolves[2].pos], fitness: wolves[2].fitness };

  for (let iter = 0; iter < maxIter; iter++) {
    const a = 2 - 2 * iter / maxIter;
    for (let i = 0; i < popSize; i++) {
      const X1 = alpha.pos.map((v, j) => {
        const D = Math.abs((2 * Math.random()) * v - wolves[i].pos[j]);
        return Math.max(0, v - (2 * a * Math.random() - a) * D);
      });
      const X2 = beta.pos.map((v, j) => {
        const D = Math.abs((2 * Math.random()) * v - wolves[i].pos[j]);
        return Math.max(0, v - (2 * a * Math.random() - a) * D);
      });
      const X3 = delta.pos.map((v, j) => {
        const D = Math.abs((2 * Math.random()) * v - wolves[i].pos[j]);
        return Math.max(0, v - (2 * a * Math.random() - a) * D);
      });
      let newPos = X1.map((_, j) => (X1[j] + X2[j] + X3[j]) / 3);
      const sum = newPos.reduce((a, b) => a + b, 0);
      wolves[i].pos = sum > 0 ? newPos.map(x => x / sum) : Array(dim).fill(1 / dim);
    }
    for (const w of wolves) w.fitness = fitness(w.pos);
    wolves.sort((a, b) => b.fitness - a.fitness);
    if (wolves[0].fitness > alpha.fitness) alpha = { pos: [...wolves[0].pos], fitness: wolves[0].fitness };
    if (wolves[1].fitness > beta.fitness)  beta  = { pos: [...wolves[1].pos], fitness: wolves[1].fitness };
    if (wolves[2].fitness > delta.fitness) delta = { pos: [...wolves[2].pos], fitness: wolves[2].fitness };
  }

  for (let i = 0; i < dim; i++) gwoWeights[i] = 0.6 * gwoWeights[i] + 0.4 * alpha.pos[i];
  const total = gwoWeights.reduce((a, b) => a + b, 0);
  gwoWeights = gwoWeights.map(w => w / total);
  gwoIterCount++;
  console.log(`[GWO] #${gwoIterCount} H=${gwoWeights[0].toFixed(3)} V=${gwoWeights[1].toFixed(3)} D=${gwoWeights[2].toFixed(3)} A=${gwoWeights[3].toFixed(3)}`);
}


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

app.use('/api/auth', authLimiter);
app.use('/api/search-by-image', uploadLimiter);
app.post('/api/insects', apiWriteLimiter);
app.put('/api/insects/:id', apiWriteLimiter);
app.delete('/api/insects/:id', apiWriteLimiter);

module.exports = { storage, upload, computeHash, hammingDistance, hashBits, gwoWeights, gwoIterCount, hashComponents, weightedSimilarity, gwoOptimize, migrateHashes };
