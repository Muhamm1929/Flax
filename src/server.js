const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadStore, saveStore } = require('./store');

const PORT = process.env.PORT || 3000;
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345';
const DEV_USERNAMES = (process.env.DEV_USERNAMES || 'dev1,dev2')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);
const SOCIAL_ORIGIN = process.env.SOCIAL_ORIGIN || '*';
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || '*';

function json(res, statusCode, payload, origin = '*') {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function setCors(req) {
  const origin = req.headers.origin;
  if (SOCIAL_ORIGIN === '*' || ADMIN_ORIGIN === '*') return '*';
  if (!origin) return SOCIAL_ORIGIN;
  if ([SOCIAL_ORIGIN, ADMIN_ORIGIN].includes(origin)) return origin;
  return '';
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function create7DigitId(store) {
  let id;
  do {
    id = Math.floor(1000000 + Math.random() * 9000000).toString();
  } while (store.users.some((user) => user.id === id));
  return id;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, original] = stored.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(original, 'hex'));
}

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

function roleForUser(user, store) {
  if (user.role === 'DEV') return { key: 'DEV', label: 'DEV', design: 'diamond' };
  const idx = store.loginPodiumOrder.indexOf(user.id);
  if (idx === 0) return { key: 'FIRST_USER', label: 'First user 👑', design: 'gold' };
  if (idx === 1) return { key: 'SECOND_USER', label: 'Second user', design: 'silver' };
  if (idx === 2) return { key: 'THIRD_USER', label: 'Third user', design: 'bronze' };
  return { key: 'USER', label: 'USER', design: 'default' };
}

function serveStatic(reqPath, res, origin) {
  let filePath;
  if (reqPath.startsWith('/social')) {
    filePath = path.join(__dirname, '..', 'public', reqPath);
  } else if (reqPath.startsWith('/admin')) {
    filePath = path.join(__dirname, '..', 'public', reqPath);
  } else {
    return false;
  }

  if (reqPath === '/social' || reqPath === '/admin') {
    filePath = path.join(__dirname, '..', 'public', reqPath.slice(1), 'index.html');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  };

  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': origin
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function ensureBootstrapState() {
  const store = loadStore();

  if (!store.settings.adminPasswordHash) {
    store.settings.adminPasswordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
  }

  if (store.classes.length === 0) {
    store.classes.push({ id: crypto.randomUUID(), name: 'Class A', code: '11111', enabled: true });
  }

  saveStore(store);
}

function isAdminAuthorized(req, store) {
  const password = req.headers['x-admin-password'];
  if (!password) return false;
  return verifyPassword(password, store.settings.adminPasswordHash);
}

async function handleApi(req, res, origin) {
  const reqPath = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (req.method === 'POST' && reqPath === '/api/auth/register') {
    const { name, username, password, classCode } = await parseBody(req);
    if (!name || !username || !password || !classCode) return json(res, 400, { error: 'name, username, password, classCode are required' }, origin);
    if (!/^\d{5}$/.test(String(classCode))) return json(res, 400, { error: 'Class code must be 5 digits' }, origin);

    const store = loadStore();
    const normalized = username.toLowerCase();
    if (store.users.some((user) => user.username.toLowerCase() === normalized)) return json(res, 400, { error: 'Username already exists' }, origin);

    const classItem = store.classes.find((item) => item.code === String(classCode));
    if (!classItem || !classItem.enabled) return json(res, 400, { error: 'Class is disabled or does not exist' }, origin);

    const user = {
      id: create7DigitId(store),
      name,
      username,
      passwordHash: hashPassword(password),
      classIds: [classItem.id],
      likes: 0,
      friends: 0,
      messages: 0,
      role: DEV_USERNAMES.includes(normalized) ? 'DEV' : 'USER'
    };

    store.users.push(user);
    saveStore(store);
    return json(res, 201, { message: 'Registered successfully', userId: user.id }, origin);
  }

  if (req.method === 'POST' && reqPath === '/api/auth/login') {
    const { username, password } = await parseBody(req);
    if (!username || !password) return json(res, 400, { error: 'username and password are required' }, origin);

    const store = loadStore();
    const user = store.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user || !verifyPassword(password, user.passwordHash)) return json(res, 401, { error: 'Invalid credentials' }, origin);

    if (user.role !== 'DEV' && !store.loginPodiumOrder.includes(user.id) && store.loginPodiumOrder.length < 3) {
      store.loginPodiumOrder.push(user.id);
    }

    const token = createToken();
    store.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
    saveStore(store);
    return json(res, 200, { token }, origin);
  }

  if (req.method === 'GET' && reqPath === '/api/me') {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return json(res, 401, { error: 'No token' }, origin);

    const store = loadStore();
    const session = store.sessions.find((item) => item.token === token);
    const user = session ? store.users.find((item) => item.id === session.userId) : null;
    if (!user) return json(res, 401, { error: 'Invalid token' }, origin);

    return json(
      res,
      200,
      {
        id: user.id,
        name: user.name,
        username: user.username,
        likes: user.likes,
        friends: user.friends,
        messages: user.messages,
        role: roleForUser(user, store)
      },
      origin
    );
  }

  if (req.method === 'POST' && reqPath === '/api/admin/login') {
    const { password } = await parseBody(req);
    const store = loadStore();
    if (!verifyPassword(password, store.settings.adminPasswordHash)) {
      return json(res, 401, { error: 'Invalid admin password' }, origin);
    }
    return json(res, 200, { ok: true }, origin);
  }

  if (!reqPath.startsWith('/api/admin/')) return false;

  const store = loadStore();
  if (!isAdminAuthorized(req, store)) return json(res, 401, { error: 'Invalid admin password' }, origin);

  if (req.method === 'POST' && reqPath === '/api/admin/change-password') {
    const { currentPassword, newPassword } = await parseBody(req);
    if (!currentPassword || !newPassword) return json(res, 400, { error: 'currentPassword and newPassword are required' }, origin);
    if (!/^\d{5}$/.test(String(newPassword))) return json(res, 400, { error: 'newPassword must be 5 digits' }, origin);
    if (!verifyPassword(currentPassword, store.settings.adminPasswordHash)) return json(res, 401, { error: 'Current password is incorrect' }, origin);

    store.settings.adminPasswordHash = hashPassword(String(newPassword));
    saveStore(store);
    return json(res, 200, { message: 'Admin password updated' }, origin);
  }

  if (req.method === 'GET' && reqPath === '/api/admin/users') {
    const users = store.users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      classIds: u.classIds,
      role: u.role,
      likes: u.likes,
      friends: u.friends,
      messages: u.messages
    }));
    return json(res, 200, users, origin);
  }

  if (req.method === 'PATCH' && reqPath.match(/^\/api\/admin\/users\/[^/]+\/status$/)) {
    const id = reqPath.split('/')[4];
    const { role } = await parseBody(req);
    if (!['USER', 'DEV'].includes(role)) return json(res, 400, { error: 'role must be USER or DEV' }, origin);

    const user = store.users.find((u) => u.id === id);
    if (!user) return json(res, 404, { error: 'User not found' }, origin);
    user.role = role;
    saveStore(store);
    return json(res, 200, { message: 'Status updated' }, origin);
  }

  if (req.method === 'DELETE' && reqPath.match(/^\/api\/admin\/users\/[^/]+$/)) {
    const id = reqPath.split('/')[4];
    const len = store.users.length;
    store.users = store.users.filter((u) => u.id !== id);
    store.sessions = store.sessions.filter((s) => s.userId !== id);
    store.loginPodiumOrder = store.loginPodiumOrder.filter((userId) => userId !== id);
    if (store.users.length === len) return json(res, 404, { error: 'User not found' }, origin);
    saveStore(store);
    return json(res, 200, { message: 'User deleted' }, origin);
  }

  if (req.method === 'GET' && reqPath === '/api/admin/classes') {
    return json(res, 200, store.classes, origin);
  }

  if (req.method === 'POST' && reqPath === '/api/admin/classes') {
    const { name, code } = await parseBody(req);
    if (!name || !code || !/^\d{5}$/.test(String(code))) return json(res, 400, { error: 'name and 5-digit code are required' }, origin);
    if (store.classes.some((c) => c.code === String(code))) return json(res, 400, { error: 'Class code already exists' }, origin);
    const classItem = { id: crypto.randomUUID(), name, code: String(code), enabled: true };
    store.classes.push(classItem);
    saveStore(store);
    return json(res, 201, classItem, origin);
  }

  if (req.method === 'PATCH' && reqPath.match(/^\/api\/admin\/classes\/[^/]+$/)) {
    const id = reqPath.split('/')[4];
    const { name, code, enabled } = await parseBody(req);
    const classItem = store.classes.find((c) => c.id === id);
    if (!classItem) return json(res, 404, { error: 'Class not found' }, origin);

    if (code !== undefined) {
      if (!/^\d{5}$/.test(String(code))) return json(res, 400, { error: 'code must be 5 digits' }, origin);
      if (store.classes.some((c) => c.id !== id && c.code === String(code))) return json(res, 400, { error: 'Class code already used' }, origin);
      classItem.code = String(code);
    }
    if (name !== undefined) classItem.name = name;
    if (enabled !== undefined) classItem.enabled = Boolean(enabled);
    saveStore(store);
    return json(res, 200, classItem, origin);
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const origin = setCors(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin || 'null',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
    });
    res.end();
    return;
  }

  if (!origin) {
    json(res, 403, { error: 'CORS forbidden' }, 'null');
    return;
  }

  const reqPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (reqPath === '/') {
    res.writeHead(302, { Location: '/social' });
    res.end();
    return;
  }

  try {
    const handledApi = await handleApi(req, res, origin);
    if (handledApi !== false) return;

    const handledStatic = serveStatic(reqPath, res, origin);
    if (handledStatic) return;

    json(res, 404, { error: 'Not found' }, origin);
  } catch (error) {
    json(res, 400, { error: error.message || 'Bad request' }, origin);
  }
});

ensureBootstrapState();

server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
