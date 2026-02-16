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
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'change-me-token-secret';

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
      if (body.length > 1e6) reject(new Error('Payload too large'));
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

function createToken(userId) {
  const payload = {
    uid: userId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function parseToken(token) {
  if (!token || !token.includes('.')) return null;
  const [encodedPayload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(encodedPayload).digest('base64url');
  if (expected !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function roleForUser(user, store) {
  if (user.role === 'DEV') return { key: 'DEV', label: 'DEV', design: 'diamond' };
  const idx = store.loginPodiumOrder.indexOf(user.id);
  if (idx === 0) return { key: 'FIRST_USER', label: 'First user 👑', design: 'gold' };
  if (idx === 1) return { key: 'SECOND_USER', label: 'Second user', design: 'silver' };
  if (idx === 2) return { key: 'THIRD_USER', label: 'Third user', design: 'bronze' };
  return { key: 'USER', label: 'USER', design: 'default' };
}

function getSocialFilePath(reqPath) {
  const socialAliases = ['/social', '/homepage', '/registration', '/chat', '/profile'];

  for (const prefix of socialAliases) {
    if (reqPath === prefix) {
      return path.join(__dirname, '..', 'public', 'social', 'index.html');
    }

    if (reqPath.startsWith(`${prefix}/`)) {
      const tail = reqPath.slice(prefix.length + 1);
      return path.join(__dirname, '..', 'public', 'social', tail);
    }
  }

  return null;
}

function serveStatic(reqPath, res, origin) {
  let filePath = getSocialFilePath(reqPath);

  if (!filePath && reqPath === '/admin') {
    filePath = path.join(__dirname, '..', 'public', 'admin', 'index.html');
  }

  if (!filePath && reqPath.startsWith('/admin/')) {
    filePath = path.join(__dirname, '..', 'public', 'admin', reqPath.slice('/admin/'.length));
  }

  if (!filePath) return false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;

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

  if (!Array.isArray(store.messages)) store.messages = [];

  for (const user of store.users) {
    if (!Array.isArray(user.classIds)) user.classIds = [];
    if (!Array.isArray(user.likedBy)) user.likedBy = [];
    if (typeof user.messages !== 'number') user.messages = 0;
    if (typeof user.friends !== 'number') user.friends = 0;
    if (!user.activeClassId) user.activeClassId = user.classIds[0] || null;
  }

  if (store.classes.length === 0) {
    store.classes.push({ id: crypto.randomUUID(), name: '8B', code: '11111', enabled: true });
  }

  saveStore(store);
}

function isAdminAuthorized(req, store) {
  const password = req.headers['x-admin-password'];
  if (!password) return false;
  return verifyPassword(password, store.settings.adminPasswordHash);
}

function getUserByToken(store, req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  const payload = parseToken(token);
  if (!payload) return null;
  return store.users.find((item) => item.id === payload.uid) || null;
}

function ensureActiveClass(user, store) {
  if (user.activeClassId && user.classIds.includes(user.activeClassId)) return user.activeClassId;
  const existing = user.classIds.find((classId) => store.classes.some((c) => c.id === classId));
  user.activeClassId = existing || null;
  return user.activeClassId;
}

async function handleApi(req, res, origin) {
  const reqPath = new URL(req.url, `http://${req.headers.host}`).pathname;

  if (req.method === 'POST' && reqPath === '/api/auth/register') {
    const { name, username, password } = await parseBody(req);
    if (!name || !username || !password) return json(res, 400, { error: 'name, username, password are required' }, origin);

    const store = loadStore();
    const normalized = username.toLowerCase();
    if (store.users.some((user) => user.username.toLowerCase() === normalized)) return json(res, 400, { error: 'Username already exists' }, origin);

    const user = {
      id: create7DigitId(store),
      name,
      username,
      passwordHash: hashPassword(password),
      classIds: [],
      activeClassId: null,
      likedBy: [],
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

    const token = createToken(user.id);
    return json(res, 200, { token });
  }

  if (req.method === 'POST' && reqPath === '/api/admin/login') {
    const { password } = await parseBody(req);
    const store = loadStore();
    if (!verifyPassword(password, store.settings.adminPasswordHash)) return json(res, 401, { error: 'Invalid admin password' }, origin);
    return json(res, 200, { ok: true }, origin);
  }

  if (reqPath.startsWith('/api/admin/')) {
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
        likes: (u.likedBy || []).length,
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
      store.messages = store.messages.filter((m) => m.authorId !== id);
      for (const user of store.users) {
        user.likedBy = (user.likedBy || []).filter((likerId) => likerId !== id);
      }
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

    if (req.method === 'DELETE' && reqPath.match(/^\/api\/admin\/classes\/[^/]+$/)) {
      const id = reqPath.split('/')[4];
      const before = store.classes.length;
      store.classes = store.classes.filter((item) => item.id !== id);
      if (store.classes.length === before) return json(res, 404, { error: 'Class not found' }, origin);

      for (const user of store.users) {
        user.classIds = (user.classIds || []).filter((classId) => classId !== id);
        if (user.activeClassId === id) user.activeClassId = user.classIds[0] || null;
      }
      store.messages = (store.messages || []).filter((m) => m.classId !== id);

      saveStore(store);
      return json(res, 200, { message: 'Class deleted' }, origin);
    }

    return false;
  }

  if (!reqPath.startsWith('/api/')) return false;

  const store = loadStore();
  const user = getUserByToken(store, req);
  if (!user) return json(res, 401, { error: 'Invalid token' }, origin);

  ensureActiveClass(user, store);

  if (req.method === 'GET' && reqPath === '/api/me') {
    const activeClass = store.classes.find((c) => c.id === user.activeClassId) || null;
    saveStore(store);
    return json(
      res,
      200,
      {
        id: user.id,
        name: user.name,
        username: user.username,
        likes: (user.likedBy || []).length,
        friends: user.friends,
        messages: user.messages,
        role: roleForUser(user, store),
        activeClass,
        hasJoinedClass: Boolean(user.activeClassId)
      },
      origin
    );
  }

  if (req.method === 'PATCH' && reqPath === '/api/me') {
    const { name } = await parseBody(req);
    if (!name || !String(name).trim()) return json(res, 400, { error: 'name is required' }, origin);
    user.name = String(name).trim().slice(0, 40);
    saveStore(store);
    return json(res, 200, { message: 'Name updated', name: user.name }, origin);
  }

  if (req.method === 'GET' && reqPath.match(/^\/api\/users\/[^/]+\/profile$/)) {
    const targetId = reqPath.split('/')[3];
    const target = store.users.find((u) => u.id === targetId);
    if (!target) return json(res, 404, { error: 'User not found' }, origin);

    ensureActiveClass(user, store);
    if (!user.activeClassId || !target.classIds.includes(user.activeClassId)) {
      return json(res, 403, { error: 'Profile is not available outside your active class' }, origin);
    }

    return json(
      res,
      200,
      {
        id: target.id,
        name: target.name,
        username: target.username,
        likes: (target.likedBy || []).length,
        messages: target.messages || 0,
        role: roleForUser(target, store)
      },
      origin
    );
  }

  if (req.method === 'GET' && reqPath === '/api/classes') {
    const enabledClasses = store.classes
      .filter((c) => c.enabled)
      .map((c) => ({ id: c.id, name: c.name, enabled: c.enabled, joined: user.classIds.includes(c.id) }));
    return json(res, 200, enabledClasses, origin);
  }

  if (req.method === 'POST' && reqPath === '/api/join-class') {
    const { classId, code } = await parseBody(req);
    if (!classId || !code) return json(res, 400, { error: 'classId and code are required' }, origin);

    const classItem = store.classes.find((c) => c.id === classId && c.enabled);
    if (!classItem) return json(res, 404, { error: 'Class not found or disabled' }, origin);
    if (classItem.code !== String(code)) return json(res, 401, { error: 'Неверный пароль класса' }, origin);

    if (!user.classIds.includes(classId)) user.classIds.push(classId);
    user.activeClassId = classId;
    saveStore(store);
    return json(res, 200, { message: 'Class joined', activeClass: { id: classItem.id, name: classItem.name } }, origin);
  }

  if (req.method === 'POST' && reqPath === '/api/select-class') {
    const { classId } = await parseBody(req);
    if (!classId) return json(res, 400, { error: 'classId is required' }, origin);
    if (!user.classIds.includes(classId)) return json(res, 403, { error: 'You are not a member of this class' }, origin);

    const classItem = store.classes.find((c) => c.id === classId && c.enabled);
    if (!classItem) return json(res, 404, { error: 'Class not found or disabled' }, origin);

    user.activeClassId = classId;
    saveStore(store);
    return json(res, 200, { message: 'Class selected', activeClass: { id: classItem.id, name: classItem.name } }, origin);
  }

  if (!user.activeClassId) {
    return json(res, 400, { error: 'Сначала выбери класс и введи пароль класса' }, origin);
  }

  if (req.method === 'GET' && reqPath === '/api/classmates') {
    const classmates = store.users
      .filter((item) => item.classIds.includes(user.activeClassId))
      .map((item) => ({
        id: item.id,
        name: item.name,
        username: item.username,
        likes: (item.likedBy || []).length,
        likedByMe: (item.likedBy || []).includes(user.id)
      }));

    return json(res, 200, classmates, origin);
  }

  if (req.method === 'POST' && reqPath.match(/^\/api\/users\/[^/]+\/like$/)) {
    const targetId = reqPath.split('/')[3];
    if (targetId === user.id) return json(res, 400, { error: 'Cannot like yourself' }, origin);

    const target = store.users.find((item) => item.id === targetId);
    if (!target || !target.classIds.includes(user.activeClassId)) return json(res, 404, { error: 'User not found in your class' }, origin);

    if (!Array.isArray(target.likedBy)) target.likedBy = [];

    if (target.likedBy.includes(user.id)) {
      target.likedBy = target.likedBy.filter((id) => id !== user.id);
    } else {
      target.likedBy.push(user.id);
    }

    saveStore(store);
    return json(res, 200, { likes: target.likedBy.length, likedByMe: target.likedBy.includes(user.id) }, origin);
  }

  if (req.method === 'GET' && reqPath === '/api/messages') {
    const messages = (store.messages || [])
      .filter((item) => item.classId === user.activeClassId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((item) => {
        const author = store.users.find((u) => u.id === item.authorId);
        return {
          id: item.id,
          text: item.text,
          createdAt: item.createdAt,
          likes: (item.likedBy || []).length,
          likedByMe: (item.likedBy || []).includes(user.id),
          author: author
            ? { id: author.id, name: author.name, username: author.username }
            : { id: item.authorId, name: 'Unknown', username: 'unknown' },
          canDelete: item.authorId === user.id || user.role === 'DEV'
        };
      });

    return json(res, 200, messages, origin);
  }

  if (req.method === 'POST' && reqPath === '/api/messages') {
    const { text } = await parseBody(req);
    if (!text || !String(text).trim()) return json(res, 400, { error: 'text is required' }, origin);

    const message = {
      id: crypto.randomUUID(),
      classId: user.activeClassId,
      authorId: user.id,
      text: String(text).trim().slice(0, 500),
      likedBy: [],
      createdAt: new Date().toISOString()
    };

    store.messages.push(message);
    user.messages = (user.messages || 0) + 1;
    saveStore(store);

    return json(res, 201, { message: 'Message posted' }, origin);
  }

  if (req.method === 'POST' && reqPath.match(/^\/api\/messages\/[^/]+\/like$/)) {
    const messageId = reqPath.split('/')[3];
    const message = store.messages.find((item) => item.id === messageId && item.classId === user.activeClassId);
    if (!message) return json(res, 404, { error: 'Message not found' }, origin);

    if (!Array.isArray(message.likedBy)) message.likedBy = [];

    if (message.likedBy.includes(user.id)) {
      message.likedBy = message.likedBy.filter((id) => id !== user.id);
    } else {
      message.likedBy.push(user.id);
    }

    saveStore(store);
    return json(res, 200, { likes: message.likedBy.length, likedByMe: message.likedBy.includes(user.id) }, origin);
  }


  if (req.method === 'DELETE' && reqPath.match(/^\/api\/messages\/[^/]+$/)) {
    const messageId = reqPath.split('/')[3];
    const idx = store.messages.findIndex((item) => item.id === messageId && item.classId === user.activeClassId);
    if (idx === -1) return json(res, 404, { error: 'Message not found' }, origin);

    const message = store.messages[idx];
    const isOwner = message.authorId === user.id;
    const isModerator = user.role === 'DEV';
    if (!isOwner && !isModerator) return json(res, 403, { error: 'You can delete only your messages' }, origin);

    const author = store.users.find((u) => u.id === message.authorId);
    if (author) author.messages = Math.max(0, (author.messages || 0) - 1);

    store.messages.splice(idx, 1);
    saveStore(store);
    return json(res, 200, { message: 'Message deleted' }, origin);
  }

  return false;
}

async function requestHandler(req, res) {
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
    res.writeHead(302, { Location: '/homepage' });
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
}

ensureBootstrapState();

module.exports = requestHandler;

if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}
