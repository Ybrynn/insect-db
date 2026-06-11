const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
let initSqlJs;
let db;
const DATA_DIR = process.env.DATA_DIR || require('path').join(__dirname, '..');

// ensure data dir
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });





// 确保数据目录和上传目录存在


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
      can_edit INTEGER DEFAULT 0,
      can_upload INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      detail TEXT,
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);
  const userCols = db.exec(`PRAGMA table_info(users)`).flatMap(r => r.values).map(v => v[1]);
  if (!userCols.includes('can_edit')) db.run(`ALTER TABLE users ADD COLUMN can_edit INTEGER DEFAULT 0`);
  if (!userCols.includes('can_upload')) db.run(`ALTER TABLE users ADD COLUMN can_upload INTEGER DEFAULT 0`);
  const adminExists = queryOne(`SELECT id FROM users WHERE username = 'admin'`);
  if (!adminExists) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync('admin123', salt, 10000, 64, 'sha512').toString('hex');
    execute(`INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, 'admin')`, ['admin', hash, salt]);
    console.log('  已创建默认管理员账号 (admin / admin123)');
  }
  saveDb();
}

let saveTimer = null;
const SAVE_DEBOUNCE_MS = 5000;
const MAX_BACKUPS = 5;

function saveDb() {
  const dbPath = path.join(DATA_DIR, 'insects.db');

  if (fs.existsSync(dbPath)) {
    const backupDir = path.join(DATA_DIR, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `insects-${timestamp}.db`);
    fs.copyFileSync(dbPath, backupPath);

    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('insects-') && f.endsWith('.db'))
      .sort()
      .reverse();
    for (let i = MAX_BACKUPS; i < backups.length; i++) {
      fs.unlinkSync(path.join(backupDir, backups[i]));
    }
  }

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDb();
    saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

function execute(sql, params = []) {
  db.run(sql, params);
  scheduleSave();
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

function logOperation(userId, username, action, targetType, targetId, detail) {
  try {
    db.run(`INSERT INTO operation_logs (user_id, username, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?)`, [userId||null, username||'', action, targetType||'', targetId||null, detail||'']);
  } catch(e) { console.error('logOperation error:', e.message); }
}

module.exports = { initDb, getDb: () => db, query, queryOne, execute, logOperation, saveDb, DATA_DIR };
