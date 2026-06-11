const express = require('express');
const path = require('path');
const { initDb, query, queryOne, execute, logOperation, saveDb, getDb, DATA_DIR } = require('./lib/db');
const { storage, upload, computeHash, hammingDistance, hashBits, gwoWeights, gwoIterCount, hashComponents, weightedSimilarity, gwoOptimize, migrateHashes } = require('./lib/image');
const { createToken, verifyToken, adminOnly, canEdit, canUpload, authLimiter, apiWriteLimiter, uploadLimiter } = require('./lib/auth');
const registerRoutes = require('./routes/api');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

// ── Static files ──
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false, lastModified: false }));
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use(express.json());

// ── Rate limiting ──
app.use('/api/auth', authLimiter);
app.use('/api/search-by-image', uploadLimiter);
app.post('/api/insects', apiWriteLimiter);
app.put('/api/insects/:id', apiWriteLimiter);
app.delete('/api/insects/:id', apiWriteLimiter);

// ── API routes ──
registerRoutes(app, {
  query, queryOne, execute, logOperation, saveDb, DATA_DIR,
  upload, computeHash, gwoOptimize, hashComponents, weightedSimilarity,
  gwoWeights, gwoIterCount, hammingDistance, hashBits,
  adminOnly, canEdit, canUpload, createToken, verifyToken
});

// ── Error handler ──
const multer = require('multer');
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '文件大小不能超过10MB' });
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

// ── Startup ──
process.on('SIGTERM', () => { saveDb(); process.exit(0); });
process.on('SIGINT', () => { saveDb(); process.exit(0); });

initDb().then(async () => {
  await migrateHashes();
  app.listen(PORT, '0.0.0.0', () => {
    console.log('昆虫信息数据库已启动: http://localhost:' + PORT);
  });
}).catch(err => {
  console.error('启动失败:', err);
});
