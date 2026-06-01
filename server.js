const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;

// 确保数据目录和上传目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

let db;
let initSqlJs;

async function initDb() {
  initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const dbPath = path.join(DATA_DIR, 'insects.db');
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS insects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scientific_name TEXT DEFAULT '',
      alias_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      host_plant TEXT DEFAULT '',
      damage_type TEXT DEFAULT '',
      morphology TEXT DEFAULT '',
      habit TEXT DEFAULT '',
      image_path TEXT DEFAULT '',
      image_hash TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);
  const cols = db.exec(`PRAGMA table_info(insects)`).flatMap(r => r.values).map(v => v[1]);
  if (!cols.includes('family')) db.run(`ALTER TABLE insects ADD COLUMN family TEXT DEFAULT ''`);
  if (!cols.includes('insect_order')) db.run(`ALTER TABLE insects ADD COLUMN insect_order TEXT DEFAULT ''`);
  if (!cols.includes('category')) db.run(`ALTER TABLE insects ADD COLUMN category TEXT DEFAULT ''`);
  if (!cols.includes('genus')) db.run(`ALTER TABLE insects ADD COLUMN genus TEXT DEFAULT ''`);
  if (!cols.includes('status')) db.run(`ALTER TABLE insects ADD COLUMN status TEXT DEFAULT '在库'`);
  db.run(`
    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS insect_custom_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      insect_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      value TEXT DEFAULT '',
      FOREIGN KEY (insect_id) REFERENCES insects(id),
      FOREIGN KEY (field_id) REFERENCES custom_fields(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);
  const adminExists = queryOne(`SELECT id FROM users WHERE username = 'admin'`);
  if (!adminExists) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('admin123', salt, 10000, 64, 'sha512').toString('hex');
    execute(`INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, 'admin')`, ['admin', hash, salt]);
    console.log('  已创建默认管理员账号 (admin / admin123)');
  }
  saveDb();
}

function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(path.join(DATA_DIR, 'insects.db'), buffer);
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

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

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));
app.use(express.json());

// ── Auth ──
const sessions = new Map();

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (username.length < 3) return res.status(400).json({ error: '用户名至少3个字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });

    const existing = queryOne(`SELECT id FROM users WHERE username = ?`, [username]);
    if (existing) return res.status(400).json({ error: '用户名已存在' });

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    execute(`INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, 'user')`, [username, hash, salt]);

    res.json({ message: '注册成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

    const user = queryOne(`SELECT * FROM users WHERE username = ?`, [username]);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });

    const hash = crypto.pbkdf2Sync(password, user.salt, 10000, 64, 'sha512').toString('hex');
    if (hash !== user.password_hash) return res.status(401).json({ error: '用户名或密码错误' });

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { id: user.id, username: user.username, role: user.role });

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.json({ user: null });
  const session = sessions.get(token);
  if (!session) return res.json({ user: null });
  res.json({ user: session });
});

// Auth middleware – protect all /api/* except /api/auth/
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: '请先登录' });
  const session = sessions.get(token);
  if (!session) return res.status(401).json({ error: '登录已过期' });
  req.user = session;
  next();
});

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '权限不足' });
  next();
}

app.get('/api/admin/users', adminOnly, (req, res) => {
  try {
    const users = query(`SELECT id, username, role, created_at FROM users ORDER BY id`);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', adminOnly, (req, res) => {
  try {
    const user = queryOne(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.id === req.user.id) return res.status(400).json({ error: '不能删除自己' });
    if (user.role === 'admin') return res.status(400).json({ error: '不能删除管理员' });
    execute(`DELETE FROM users WHERE id = ?`, [req.params.id]);
    for (const [t, s] of sessions) { if (s.id === user.id) sessions.delete(t); }
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/insects', (req, res) => {
  try {
    const { q, order, family, genus, host_plant, damage_type, category } = req.query;
    let sql = 'SELECT * FROM insects WHERE 1=1';
    const params = [];
    if (q) {
      sql += ' AND (name LIKE ? OR scientific_name LIKE ? OR alias_name LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (order) {
      sql += ' AND insect_order = ?';
      params.push(order);
    }
    if (family) {
      sql += ' AND family = ?';
      params.push(family);
    }
    if (genus) {
      sql += ' AND genus = ?';
      params.push(genus);
    }
    if (host_plant) {
      sql += ' AND host_plant LIKE ?';
      params.push(`%${host_plant}%`);
    }
    if (damage_type) {
      sql += ' AND damage_type LIKE ?';
      params.push(`%${damage_type}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY updated_at DESC';
    const rows = query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taxonomy', (req, res) => {
  try {
    const orders = query(`SELECT DISTINCT insect_order FROM insects WHERE insect_order != '' ORDER BY insect_order`);
    const result = {};
    for (const ord of orders.map(r => r.insect_order)) {
      const families = query(`SELECT DISTINCT family FROM insects WHERE insect_order = ? AND family != '' ORDER BY family`, [ord]);
      const famObj = {};
      for (const f of families.map(r => r.family)) {
        const genera = query(`SELECT DISTINCT genus FROM insects WHERE insect_order = ? AND family = ? AND genus != '' ORDER BY genus`, [ord, f]);
        famObj[f] = genera.map(r => r.genus);
      }
      result[ord] = famObj;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taxonomy/hosts', (req, res) => {
  try {
    const rows = query(`SELECT DISTINCT host_plant FROM insects WHERE host_plant != '' ORDER BY host_plant`);
    const all = [];
    for (const r of rows) {
      const parts = r.host_plant.split(/[、,，\/\\]/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!all.includes(p)) all.push(p);
      }
    }
    all.sort();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taxonomy/damages', (req, res) => {
  try {
    const rows = query(`SELECT DISTINCT damage_type FROM insects WHERE damage_type != '' ORDER BY damage_type`);
    const all = [];
    for (const r of rows) {
      const parts = r.damage_type.split(/[、,，\/\\]/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!all.includes(p)) all.push(p);
      }
    }
    all.sort();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taxonomy/categories', (req, res) => {
  try {
    const rows = query(`SELECT DISTINCT category FROM insects WHERE category != '' ORDER BY category`);
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taxonomy/genus', (req, res) => {
  try {
    const rows = query(`SELECT DISTINCT genus FROM insects WHERE genus != '' ORDER BY genus`);
    res.json(rows.map(r => r.genus));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/custom-fields', (req, res) => {
  try {
    const fields = query(`SELECT * FROM custom_fields ORDER BY id`);
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/custom-fields', adminOnly, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '名称不能为空' });
    execute(`INSERT INTO custom_fields (name) VALUES (?)`, [name.trim()]);
    const last = queryOne(`SELECT MAX(id) as id FROM custom_fields`);
    res.json({ id: last.id, message: '添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/custom-fields/:id', adminOnly, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '名称不能为空' });
    execute(`UPDATE custom_fields SET name=? WHERE id=?`, [name.trim(), req.params.id]);
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/custom-fields/:id', adminOnly, (req, res) => {
  try {
    execute(`DELETE FROM insect_custom_values WHERE field_id=?`, [req.params.id]);
    execute(`DELETE FROM custom_fields WHERE id=?`, [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taxonomy/custom', (req, res) => {
  try {
    const fields = query(`SELECT * FROM custom_fields ORDER BY id`);
    const result = {};
    for (const f of fields) {
      const vals = query(`SELECT DISTINCT value FROM insect_custom_values WHERE field_id=? AND value != '' ORDER BY value`, [f.id]);
      result[f.name] = vals.map(r => r.value);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const total = queryOne(`SELECT COUNT(*) as count FROM insects`).count;

    const byOrder = query(`SELECT insect_order, COUNT(*) as count FROM insects WHERE insect_order != '' GROUP BY insect_order ORDER BY count DESC`);

    const byFamily = query(`SELECT family, COUNT(*) as count FROM insects WHERE family != '' GROUP BY family ORDER BY count DESC`);

    const allHosts = query(`SELECT host_plant FROM insects WHERE host_plant != ''`);
    const hostCounts = {};
    for (const r of allHosts) {
      const parts = r.host_plant.split(/[、,，\/\\]/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        hostCounts[p] = (hostCounts[p] || 0) + 1;
      }
    }
    const byHost = Object.entries(hostCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    const allDamages = query(`SELECT damage_type FROM insects WHERE damage_type != ''`);
    const damageCounts = {};
    for (const r of allDamages) {
      const parts = r.damage_type.split(/[、,，\/\\]/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        damageCounts[p] = (damageCounts[p] || 0) + 1;
      }
    }
    const byDamage = Object.entries(damageCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    const byCategory = query(`SELECT category, COUNT(*) as count FROM insects WHERE category != '' GROUP BY category ORDER BY count DESC`);

    const byGenus = query(`SELECT genus, COUNT(*) as count FROM insects WHERE genus != '' GROUP BY genus ORDER BY count DESC`);

    const customFields = query(`SELECT * FROM custom_fields ORDER BY id`);
    const byCustom = {};
    for (const f of customFields) {
      const vals = query(`SELECT value, COUNT(*) as count FROM insect_custom_values WHERE field_id=? AND value != '' GROUP BY value ORDER BY count DESC`, [f.id]);
      byCustom[f.name] = vals;
    }

    res.json({ total, byOrder, byFamily, byGenus, byHost, byDamage, byCategory, byCustom });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/insects/:id', (req, res) => {
  try {
    const row = queryOne(`SELECT * FROM insects WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: '未找到' });
    const custom = query(`SELECT icv.field_id, icv.value, cf.name FROM insect_custom_values icv JOIN custom_fields cf ON icv.field_id=cf.id WHERE icv.insect_id=?`, [req.params.id]);
    row.custom_values = {};
    for (const c of custom) {
      row.custom_values[c.field_id] = c.value;
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/insects', adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, scientific_name, alias_name, description, host_plant, damage_type, morphology, habit, family, insect_order, genus, category, status, custom_values } = req.body;
    if (!name) return res.status(400).json({ error: '名称不能为空' });

    let image_path = '';
    let image_hash = '';
    if (req.file) {
      image_path = '/uploads/' + req.file.filename;
      image_hash = await computeHash(req.file.path);
    }

    execute(
      `INSERT INTO insects (name, scientific_name, alias_name, description, host_plant, damage_type, morphology, habit, family, insect_order, genus, category, status, image_path, image_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, scientific_name || '', alias_name || '', description || '', host_plant || '', damage_type || '', morphology || '', habit || '', family || '', insect_order || '', genus || '', category || '', status || '在库', image_path, image_hash]
    );

    const last = queryOne(`SELECT MAX(id) as id FROM insects`);
    let parsedCustom = {};
    if (custom_values) {
      try { parsedCustom = JSON.parse(custom_values); } catch (e) { parsedCustom = {}; }
    }
    if (Object.keys(parsedCustom).length > 0) {
      for (const [fid, val] of Object.entries(parsedCustom)) {
        if (val) execute(`INSERT INTO insect_custom_values (insect_id, field_id, value) VALUES (?, ?, ?)`, [last.id, fid, val]);
      }
    }
    res.json({ id: last.id, message: '添加成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/insects/:id', adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, scientific_name, alias_name, description, host_plant, damage_type, morphology, habit, family, insect_order, genus, category, status, custom_values } = req.body;
    if (!name) return res.status(400).json({ error: '名称不能为空' });

    const existing = queryOne(`SELECT image_path FROM insects WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: '未找到' });

    if (req.file) {
      const image_path = '/uploads/' + req.file.filename;
      const image_hash = await computeHash(req.file.path);
      execute(
        `UPDATE insects SET name=?, scientific_name=?, alias_name=?, description=?, host_plant=?, damage_type=?, morphology=?, habit=?, family=?, insect_order=?, genus=?, category=?, status=?, image_path=?, image_hash=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [name, scientific_name || '', alias_name || '', description || '', host_plant || '', damage_type || '', morphology || '', habit || '', family || '', insect_order || '', genus || '', category || '', status || '在库', image_path, image_hash, req.params.id]
      );
      if (existing.image_path) {
        const oldPath = path.join(DATA_DIR, existing.image_path.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    } else {
      execute(
        `UPDATE insects SET name=?, scientific_name=?, alias_name=?, description=?, host_plant=?, damage_type=?, morphology=?, habit=?, family=?, insect_order=?, genus=?, category=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [name, scientific_name || '', alias_name || '', description || '', host_plant || '', damage_type || '', morphology || '', habit || '', family || '', insect_order || '', genus || '', category || '', status || '在库', req.params.id]
      );
    }

    let parsedCustom = {};
    if (custom_values) {
      try { parsedCustom = JSON.parse(custom_values); } catch (e) { parsedCustom = {}; }
    }
    if (Object.keys(parsedCustom).length > 0) {
      execute(`DELETE FROM insect_custom_values WHERE insect_id=?`, [req.params.id]);
      for (const [fid, val] of Object.entries(parsedCustom)) {
        if (val) execute(`INSERT INTO insect_custom_values (insect_id, field_id, value) VALUES (?, ?, ?)`, [req.params.id, fid, val]);
      }
    }
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/insects/:id', adminOnly, (req, res) => {
  try {
    const row = queryOne(`SELECT image_path FROM insects WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: '未找到' });
    if (row.image_path) {
      const p = path.join(DATA_DIR, row.image_path.replace(/^\//, ''));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    execute(`DELETE FROM insect_custom_values WHERE insect_id = ?`, [req.params.id]);
    execute(`DELETE FROM insects WHERE id = ?`, [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/search-by-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    const queryHash = await computeHash(req.file.path);
    fs.unlinkSync(req.file.path);

    const all = query(`SELECT * FROM insects WHERE image_hash != ''`);
    const qc = hashComponents(queryHash);
    const results = all.map(r => {
      const dc = hashComponents(r.image_hash);
      const sim = gwoIterCount > 0
        ? weightedSimilarity(qc, dc, gwoWeights)
        : 1 - hammingDistance(queryHash, r.image_hash) / hashBits(queryHash);
      return { ...r, similarity: sim };
    }).filter(r => r.similarity > 0.40).sort((a, b) => b.similarity - a.similarity).slice(0, 20);

    res.json({ results, queryHash, weights: gwoWeights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/search-feedback', (req, res) => {
  try {
    const { queryHash, resultId } = req.body;
    if (!queryHash || !resultId) return res.status(400).json({ error: '缺少参数' });

    const row = queryOne(`SELECT image_hash FROM insects WHERE id = ?`, [resultId]);
    if (!row || !row.image_hash) return res.status(404).json({ error: '未找到记录' });

    const all = query(`SELECT image_hash FROM insects WHERE image_hash != ''`);
    gwoOptimize(queryHash, row.image_hash, all.map(r => r.image_hash));

    res.json({ weights: gwoWeights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '文件大小不能超过10MB' });
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

initDb().then(async () => {
  await migrateHashes();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`昆虫信息数据库已启动: http://localhost:${PORT}`);
    console.log(`局域网访问: http://<本机IP>:${PORT}`);
  });
}).catch(err => {
  console.error('启动失败:', err);
});

async function migrateHashes() {
  const rows = query(`SELECT id, image_path FROM insects WHERE image_path != ''`);
  for (const r of rows) {
    const fullPath = path.join(DATA_DIR, r.image_path.replace(/^\//, ''));
    const existing = queryOne(`SELECT image_hash FROM insects WHERE id = ?`, [r.id]);
    if (existing && existing.image_hash && existing.image_hash.length === 16) {
      console.log(`  迁移记录 #${r.id}: ${r.image_path}`);
      try {
        if (fs.existsSync(fullPath)) {
          const newHash = await computeHash(fullPath);
          execute(`UPDATE insects SET image_hash=? WHERE id=?`, [newHash, r.id]);
        }
      } catch (e) {
        console.log(`  跳过 #${r.id}: 无法读取图片文件`);
      }
    }
  }
}
