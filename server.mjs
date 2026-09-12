/* ============================================================
   南通中考英语模拟训练 · 后端服务（Node 22 内置 http，零业务依赖）
   部署形态（复用 login-dsm 排课系统模式）：
     - 本地开发：无 DATABASE_URL → 使用 Node 内置 node:sqlite（data/store.db）
     - 云端部署：设置 DATABASE_URL → 使用 PostgreSQL（pg）
   职责：
     1) 静态托管前端（app/ 目录：index.html / app.js / styles.css / papers.json ...）
     2) REST API：
        GET  /api/questions          题库（完整 papers.json，含五维 tags）
        POST /api/auth/register      注册（用户名+密码，scrypt 哈希）
        POST /api/auth/login         登录（返回 token）
        POST /api/auth/logout        登出（作废 token）
        GET  /api/me                 当前用户与画像
        GET  /api/wrong              错题本（按用户）
        PUT  /api/wrong              覆盖保存错题本（按用户）
        GET  /api/history            练习历史（按用户）
        PUT  /api/history            覆盖保存练习历史（按用户）
        GET  /api/profile            用户画像（按用户）
        POST /api/profile            保存用户画像（按用户）
     3) 管理后台（ADMIN_PASSWORD 环境变量设置密码）：
        POST /api/admin/login        管理员登录（password → token）
        POST /api/admin/logout       管理员登出（作废 token）
        GET  /api/admin/users        用户列表 + 统计（需管理员 token）
        GET  /api/admin/user?name=   用户详情：画像/错题/历史（需管理员 token）
        DELETE /api/admin/user?name= 删除用户（需管理员 token）
     4) GET  /health                 健康检查（Render 探活）
   鉴权：Bearer token（登录后下发，存于账号记录）
   数据持久化：SQLite（本地） / PostgreSQL（云端），重启不丢
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'store.db');
const APP_DIR = path.join(__dirname, 'app');
const PAPERS_PATH = path.join(APP_DIR, 'papers.json');

/* ---------------- 存储抽象层（本地 SQLite / 云端 Postgres 双模式） ---------------- */
let store = null; // { get(name), set(name, data) }

async function initStore() {
  if (process.env.DATABASE_URL) {
    // 云端：PostgreSQL
    const { Pool } = await import('pg');
    const poolOpts = {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    };
    const pool = new Pool(poolOpts);
    pool.on('error', (e) => console.error('[pg] 连接池错误(已忽略):', e.code || e.message));

    const RETRIABLE = ['ECONNRESET', '57P01', '57P02', '08006', '08003', 'ECONNREFUSED', 'ETIMEDOUT'];
    async function runQuery(text, params = []) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { return await pool.query(text, params); }
        catch (e) {
          if (attempt === 0 && RETRIABLE.includes(e.code)) {
            console.warn('[存储] 连接中断，重试一次：', e.code || e.message);
            try { await pool.end().catch(() => {}); } catch {}
            continue;
          }
          throw e;
        }
      }
    }
    try {
      await runQuery('SELECT 1');
      console.log('[存储] PostgreSQL 连接成功');
    } catch (e) {
      console.error('[存储] ❌ 无法连接 DATABASE_URL 指定的 PostgreSQL：', e.message);
      await pool.end().catch(() => {});
      process.exit(1);
    }
    await runQuery(`CREATE TABLE IF NOT EXISTS entities (
      name TEXT PRIMARY KEY, data TEXT NOT NULL)`);
    store = {
      async get(name) {
        const { rows } = await runQuery('SELECT data FROM entities WHERE name = $1', [name]);
        return rows[0] ? JSON.parse(rows[0].data) : null;
      },
      async set(name, data) {
        await runQuery(
          `INSERT INTO entities(name, data) VALUES($1, $2)
           ON CONFLICT(name) DO UPDATE SET data = EXCLUDED.data`,
          [name, JSON.stringify(data)]
        );
      },
    };
  } else {
    // 本地：Node 内置 SQLite
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(DB_PATH);
    db.exec(`CREATE TABLE IF NOT EXISTS entities (name TEXT PRIMARY KEY, data TEXT NOT NULL)`);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;`);
    console.log('[存储] 使用本地 SQLite ->', DB_PATH);
    store = {
      get(name) {
        const r = db.prepare('SELECT data FROM entities WHERE name = ?').get(name);
        return r ? JSON.parse(r.data) : null;
      },
      set(name, data) {
        db.prepare(`INSERT INTO entities(name, data) VALUES(?, ?)
                    ON CONFLICT(name) DO UPDATE SET data = excluded.data`)
          .run(name, JSON.stringify(data));
      },
    };
    await loadAdminTokens();
  }
}

/* ---------------- 题库缓存 ---------------- */
let PAPERS = null;
function loadPapers() {
  if (PAPERS) return PAPERS;
  try {
    PAPERS = JSON.parse(fs.readFileSync(PAPERS_PATH, 'utf-8'));
  } catch (e) {
    console.error('[题库] 读取 papers.json 失败：', e.message);
    PAPERS = { papers: [] };
  }
  return PAPERS;
}

/* ---------------- 账号工具 ---------------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, hash, salt) {
  if (!hash || !salt) return false;
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex')); }
  catch { return false; }
}
function genToken() { return crypto.randomBytes(24).toString('hex'); }

async function getAccounts() { return (await store.get('accounts')) || {}; }
async function saveAccounts(a) { await store.set('accounts', a); }

// 从请求解析当前用户（Bearer token）
async function getUser(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];
  const accounts = await getAccounts();
  for (const k in accounts) {
    if (accounts[k] && accounts[k].token === token) return accounts[k];
  }
  return null;
}

/* ---------------- 管理员鉴权 ---------------- */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
if (!process.env.ADMIN_PASSWORD) {
  console.warn("[管理后台] 未设置 ADMIN_PASSWORD 环境变量，使用默认密码 admin123，请尽快在 Render 环境变量中修改！");
}
const adminTokens = new Set();
async function loadAdminTokens() {
  try {
    const t = await store.get("admin_tokens");
    if (Array.isArray(t)) t.forEach(x => x && adminTokens.add(x));
  } catch (e) { /* 忽略 */ }
}
async function persistAdminTokens() {
  try { await store.set("admin_tokens", [...adminTokens]); } catch (e) {}
}
function isAdminReq(req) {
  const m = String(req.headers["authorization"] || "").match(/^Bearer\s+(.+)$/i);
  return !!(m && adminTokens.has(m[1]));
}

/* ---------------- HTTP 工具 ---------------- */
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('请求体无效')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
};

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const method = req.method;

  // 健康检查
  if (p === '/health') {
    sendJSON(res, 200, { ok: true, ts: Date.now() });
    return;
  }

  /* ---------------- API ---------------- */
  if (p.startsWith('/api/')) {
    try {
      // 题库（只读，无需鉴权）
      if (p === '/api/questions' && method === 'GET') {
        sendJSON(res, 200, loadPapers());
        return;
      }

      // 注册
      if (p === '/api/auth/register' && method === 'POST') {
        const { username, password } = await readBody(req);
        const name = String(username || '').trim();
        if (name.length < 1) return sendJSON(res, 400, { error: { message: '请输入用户名' } });
        if (!password || String(password).length < 3) return sendJSON(res, 400, { error: { message: '密码至少 3 位' } });
        const accounts = await getAccounts();
        if (accounts[name]) return sendJSON(res, 409, { error: { message: '该用户名已存在，请直接登录' } });
        const { salt, hash } = hashPassword(password);
        const token = genToken();
        accounts[name] = {
          username: name, passHash: hash, salt, token,
          profile: {}, wrong: [], history: [], createdAt: Date.now(),
        };
        await saveAccounts(accounts);
        sendJSON(res, 200, { token, username: name });
        return;
      }

      // 登录
      if (p === '/api/auth/login' && method === 'POST') {
        const { username, password } = await readBody(req);
        const name = String(username || '').trim();
        const accounts = await getAccounts();
        const a = accounts[name];
        if (!a) return sendJSON(res, 401, { error: { message: '用户不存在，请先注册' } });
        if (!verifyPassword(String(password || ''), a.passHash, a.salt))
          return sendJSON(res, 401, { error: { message: '密码错误' } });
        a.token = genToken();
        accounts[name] = a;
        await saveAccounts(accounts);
        sendJSON(res, 200, { token: a.token, username: name });
        return;
      }

      // 登出（需鉴权）
      if (p === '/api/auth/logout' && method === 'POST') {
        const cu = await getUser(req);
        if (!cu) return sendJSON(res, 200, { ok: true });
        const accounts = await getAccounts();
        if (accounts[cu.username]) { accounts[cu.username].token = null; await saveAccounts(accounts); }
        sendJSON(res, 200, { ok: true });
        return;
      }

      /* ---------------- 管理后台接口 ---------------- */
      // 管理员登录（校验 ADMIN_PASSWORD → 下发 token）
      if (p === '/api/admin/login' && method === 'POST') {
        const { password } = await readBody(req);
        if (String(password || '') !== ADMIN_PASSWORD)
          return sendJSON(res, 401, { error: { message: '管理员密码错误' } });
        const tok = genToken();
        adminTokens.add(tok); await persistAdminTokens();
        sendJSON(res, 200, { token: tok });
        return;
      }
      // 管理员登出（作废 token）
      if (p === '/api/admin/logout' && method === 'POST') {
        const m = String(req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/i);
        if (m && adminTokens.has(m[1])) { adminTokens.delete(m[1]); await persistAdminTokens(); }
        sendJSON(res, 200, { ok: true });
        return;
      }
      // 以下管理接口均需管理员 token
      if (p.startsWith('/api/admin/')) {
        if (!isAdminReq(req)) return sendJSON(res, 401, { error: { message: '需要管理员权限' } });

        // 用户列表 + 统计
        if (p === '/api/admin/users' && method === 'GET') {
          const accounts = await getAccounts();
          const users = Object.values(accounts).map(a => ({
            username: a.username,
            createdAt: a.createdAt || null,
            wrongCount: (a.wrong || []).length,
            historyCount: (a.history || []).length,
            targetScore: (a.profile && a.profile.targetScore) || null,
            grade: (a.profile && a.profile.grade) || null,
            lastActive: (a.history && a.history.length) ? a.history[a.history.length - 1].ts : null,
          })).sort((x, y) => (y.lastActive || 0) - (x.lastActive || 0));
          const stats = {
            userCount: users.length,
            totalWrong: users.reduce((s, x) => s + x.wrongCount, 0),
            totalHistory: users.reduce((s, x) => s + x.historyCount, 0),
          };
          sendJSON(res, 200, { users, stats });
          return;
        }
        // 单个用户详情
        if (p === '/api/admin/user' && method === 'GET') {
          const name = u.searchParams.get('name');
          const accounts = await getAccounts();
          const a = accounts[name];
          if (!a) return sendJSON(res, 404, { error: { message: '用户不存在' } });
          sendJSON(res, 200, {
            username: a.username,
            profile: a.profile || {},
            wrong: a.wrong || [],
            history: a.history || [],
          });
          return;
        }
        // 删除用户（含其错题本与练习记录）
        if (p === '/api/admin/user' && method === 'DELETE') {
          const name = u.searchParams.get('name');
          const accounts = await getAccounts();
          if (!accounts[name]) return sendJSON(res, 404, { error: { message: '用户不存在' } });
          delete accounts[name];
          await saveAccounts(accounts);
          sendJSON(res, 200, { ok: true });
          return;
        }
        return sendJSON(res, 404, { error: { message: '未知管理接口: ' + p } });
      }

      // 以下接口需鉴权
      const cu = await getUser(req);
      if (!cu) return sendJSON(res, 401, { error: { message: '请先登录' } });

      // 当前用户
      if (p === '/api/me' && method === 'GET') {
        sendJSON(res, 200, { username: cu.username, profile: cu.profile || {} });
        return;
      }

      // 错题本
      if (p === '/api/wrong') {
        if (method === 'GET') { sendJSON(res, 200, { items: cu.wrong || [] }); return; }
        if (method === 'PUT') {
          const body = await readBody(req);
          cu.wrong = Array.isArray(body.items) ? body.items : [];
          const accounts = await getAccounts(); accounts[cu.username] = cu; await saveAccounts(accounts);
          sendJSON(res, 200, { ok: true });
          return;
        }
      }

      // 练习历史
      if (p === '/api/history') {
        if (method === 'GET') { sendJSON(res, 200, { items: cu.history || [] }); return; }
        if (method === 'PUT') {
          const body = await readBody(req);
          cu.history = Array.isArray(body.items) ? body.items : [];
          const accounts = await getAccounts(); accounts[cu.username] = cu; await saveAccounts(accounts);
          sendJSON(res, 200, { ok: true });
          return;
        }
      }

      // 用户画像
      if (p === '/api/profile') {
        if (method === 'GET') { sendJSON(res, 200, { profile: cu.profile || {} }); return; }
        if (method === 'POST') {
          const body = await readBody(req);
          if (body && typeof body.profile === 'object' && body.profile) cu.profile = body.profile;
          else if (body && typeof body === 'object') cu.profile = body;
          const accounts = await getAccounts(); accounts[cu.username] = cu; await saveAccounts(accounts);
          sendJSON(res, 200, { ok: true, profile: cu.profile });
          return;
        }
      }

      sendJSON(res, 404, { error: { message: '未知接口: ' + p } });
      return;
    } catch (e) {
      sendJSON(res, 400, { error: { message: e.message || '请求处理失败' } });
      return;
    }
  }

  /* ---------------- 静态文件（托管 app/） ---------------- */
  let rel = p === '/' ? '/index.html' : p;
  // 允许 /papers.json 根路径指向 app/papers.json（本地调试用）
  const targetDir = p === '/papers.json' ? APP_DIR : APP_DIR;
  const filePath = path.normalize(path.join(targetDir, rel));
  if (path.relative(APP_DIR, filePath).startsWith('..')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
});

/* ---------------- 启动 ---------------- */
initStore().then(() => {
  loadPapers();
  server.listen(PORT, () => {
    console.log(`[英语训练后端] 已启动: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('[启动失败]', err);
  process.exit(1);
});
