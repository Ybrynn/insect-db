const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

function registerRoutes(app, deps) {
  const { query, queryOne, execute, logOperation, saveDb, DATA_DIR, upload, computeHash, gwoOptimize, hashComponents, weightedSimilarity, gwoWeights, gwoIterCount, hammingDistance, hashBits, adminOnly, canEdit, canUpload, verifyToken, createToken } = deps;

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

    const token = createToken({ id: user.id, username: user.username, role: user.role, can_edit: user.can_edit, can_upload: user.can_upload });

    res.json({ token, user: { id: user.id, username: user.username, role: user.role, can_edit: !!user.can_edit, can_upload: !!user.can_upload } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.json({ user: null });
  const payload = verifyToken(token);
  if (!payload) return res.json({ user: null });
  res.json({ user: { id: payload.id, username: payload.username, role: payload.role, can_edit: payload.can_edit, can_upload: payload.can_upload } });
});

// Auth middleware – protect all /api/* except /api/auth/
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: '请先登录' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: '登录已过期' });
  req.user = payload;
  next();
});







app.get('/api/admin/logs', adminOnly, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const logs = query(`SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
    const total = queryOne(`SELECT COUNT(*) as count FROM operation_logs`).count;
    res.json({ logs, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', adminOnly, (req, res) => {
  try {
    const users = query(`SELECT id, username, role, can_edit, can_upload, created_at FROM users ORDER BY id`);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id/permissions', adminOnly, (req, res) => {
  try {
    const user = queryOne(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.role === 'admin') return res.status(400).json({ error: '不能修改管理员权限' });
    const { can_edit, can_upload } = req.body;
    execute(`UPDATE users SET can_edit=?, can_upload=? WHERE id=?`, [can_edit ? 1 : 0, can_upload ? 1 : 0, req.params.id]);
    // JWT is stateless - user permissions refresh on next login
    res.json({ message: '权限更新成功' }); logOperation(req.user.id, req.user.username, '修改权限', '用户', req.params.id, JSON.stringify(req.body));
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
    // JWT is stateless - token expires naturally
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
    const orders = query(`SELECT insect_order, COUNT(*) as cnt FROM insects WHERE insect_order != '' GROUP BY insect_order ORDER BY cnt DESC, CASE WHEN insect_order = '苹果' THEN 0 ELSE 1 END, insect_order`);
    const result = {};
    for (const ord of orders.map(r => r.insect_order)) {
      const families = query(`SELECT family, COUNT(*) as cnt FROM insects WHERE insect_order = ? AND family != '' GROUP BY family ORDER BY cnt DESC, CASE WHEN family = '苹果' THEN 0 ELSE 1 END, family`, [ord]);
      const famObj = {};
      for (const f of families.map(r => r.family)) {
        const genera = query(`SELECT genus, COUNT(*) as cnt FROM insects WHERE insect_order = ? AND family = ? AND genus != '' GROUP BY genus ORDER BY cnt DESC, CASE WHEN genus = '苹果' THEN 0 ELSE 1 END, genus`, [ord, f]);
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
    const rows = query(`SELECT host_plant FROM insects WHERE host_plant != ''`);
    const hostCounts = {};
    for (const r of rows) {
      const parts = r.host_plant.split(/[、,，\/\\]/).map(s => s.trim()).filter(Boolean);
      for (const p of parts) hostCounts[p] = (hostCounts[p] || 0) + 1;
    }
    const all = Object.keys(hostCounts).sort((a, b) => {
      if (hostCounts[b] !== hostCounts[a]) return hostCounts[b] - hostCounts[a];
      if (a === '苹果') return -1;
      if (b === '苹果') return 1;
      return a.localeCompare(b);
    });
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taxonomy/damages', (req, res) => {
  try {
    const rows = query(`SELECT damage_type, COUNT(*) as cnt FROM insects WHERE damage_type != '' GROUP BY damage_type ORDER BY cnt DESC, CASE WHEN damage_type = '苹果' THEN 0 ELSE 1 END, damage_type`);
    res.json(rows.map(r => r.damage_type));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/taxonomy/categories', (req, res) => {
  try {
    const rows = query(`SELECT category, COUNT(*) as cnt FROM insects WHERE category != '' GROUP BY category ORDER BY cnt DESC, CASE WHEN category = '苹果' THEN 0 ELSE 1 END, category`);
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

app.post('/api/insects', canUpload, upload.single('image'), async (req, res) => {
  try {
    const { name, scientific_name, alias_name, description, host_plant, damage_type, prey_insect, predator_stage, morphology, habit, family, insect_order, genus, category, status, custom_values } = req.body;
    if (!name) return res.status(400).json({ error: '名称不能为空' });

    let image_path = '';
    let image_hash = '';
    if (req.file) {
      image_path = '/uploads/' + req.file.filename;
      image_hash = await computeHash(req.file.path);
    }

    execute(
      `INSERT INTO insects (name, scientific_name, alias_name, description, host_plant, damage_type, prey_insect, predator_stage, morphology, habit, family, insect_order, genus, category, status, image_path, image_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, scientific_name || '', alias_name || '', description || '', host_plant || '', damage_type || '', prey_insect || '', predator_stage || '', morphology || '', habit || '', family || '', insect_order || '', genus || '', category || '', status || '在库', image_path, image_hash]
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
    res.json({ id: last.id, message: '添加成功' }); logOperation(req.user.id, req.user.username, '创建', '昆虫', last.id, name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/insects/:id', canEdit, upload.single('image'), async (req, res) => {
  try {
    const { name, scientific_name, alias_name, description, host_plant, damage_type, prey_insect, predator_stage, morphology, habit, family, insect_order, genus, category, status, custom_values } = req.body;
    if (!name) return res.status(400).json({ error: '名称不能为空' });

    const existing = queryOne(`SELECT image_path FROM insects WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: '未找到' });

    if (req.file) {
      const image_path = '/uploads/' + req.file.filename;
      const image_hash = await computeHash(req.file.path);
      execute(
        `UPDATE insects SET name=?, scientific_name=?, alias_name=?, description=?, host_plant=?, damage_type=?, prey_insect=?, predator_stage=?, morphology=?, habit=?, family=?, insect_order=?, genus=?, category=?, status=?, image_path=?, image_hash=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [name, scientific_name || '', alias_name || '', description || '', host_plant || '', damage_type || '', prey_insect || '', predator_stage || '', morphology || '', habit || '', family || '', insect_order || '', genus || '', category || '', status || '在库', image_path, image_hash, req.params.id]
      );
      if (existing.image_path) {
        const oldPath = path.join(DATA_DIR, existing.image_path.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    } else {
      execute(
        `UPDATE insects SET name=?, scientific_name=?, alias_name=?, description=?, host_plant=?, damage_type=?, prey_insect=?, predator_stage=?, morphology=?, habit=?, family=?, insect_order=?, genus=?, category=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [name, scientific_name || '', alias_name || '', description || '', host_plant || '', damage_type || '', prey_insect || '', predator_stage || '', morphology || '', habit || '', family || '', insect_order || '', genus || '', category || '', status || '在库', req.params.id]
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
    res.json({ message: '更新成功' }); logOperation(req.user.id, req.user.username, '更新', '昆虫', req.params.id, name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/insects/:id', adminOnly, (req, res) => {
  try {
    const row = queryOne(`SELECT image_path, name FROM insects WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: '未找到' });
    if (row.image_path) {
      const p = path.join(DATA_DIR, row.image_path.replace(/^\//, ''));
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    execute(`DELETE FROM insect_custom_values WHERE insect_id = ?`, [req.params.id]);
    execute(`DELETE FROM insects WHERE id = ?`, [req.params.id]);
    logOperation(req.user.id, req.user.username, '删除', '昆虫', req.params.id, row.name);
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



﻿// ── XLSX Export ──
app.get('/api/export/xlsx', adminOnly, (req, res) => {
  try {
    const XLSX = require('xlsx');
    const insects = query('SELECT * FROM insects ORDER BY updated_at DESC');
    const customFields = query('SELECT * FROM custom_fields ORDER BY id');
    const fieldNames = customFields.map(f => f.name);

    const headers = [
      'ID', '种名', '学名', '别名', '目', '科', '属',
      '寄主植物', '危害类型', '害虫/天敌', '在库情况',
      '形态特征', '生活习性', '详细描述',
      ...fieldNames,
      '创建时间', '更新时间'
    ];

    const rows = [headers];
    for (const insect of insects) {
      const customVals = query('SELECT cf.name, icv.value FROM insect_custom_values icv JOIN custom_fields cf ON icv.field_id=cf.id WHERE icv.insect_id=?', [insect.id]);
      const customMap = {};
      for (const cv of customVals) customMap[cv.name] = cv.value;

      rows.push([
        insect.id, insect.name, insect.scientific_name, insect.alias_name,
        insect.insect_order, insect.family, insect.genus,
        insect.host_plant, insect.damage_type, insect.category, insect.status,
        insect.morphology, insect.habit, insect.description,
        ...fieldNames.map(fn => customMap[fn] || ''),
        insect.created_at, insect.updated_at
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '昆虫数据');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = 'insect-db-export-' + new Date().toISOString().slice(0,10) + '.xlsx';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent(filename));
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

}

module.exports = registerRoutes;
