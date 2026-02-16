const fs = require('fs');
const path = require('path');

const isVercel = Boolean(process.env.VERCEL);
const defaultStorePath = path.join(__dirname, '..', 'data', 'store.json');
const vercelStorePath = '/tmp/flax-store.json';
const storePath = isVercel ? vercelStorePath : defaultStorePath;

const baseState = {
  users: [],
  classes: [],
  sessions: [],
  loginPodiumOrder: [],
  messages: [],
  settings: {
    adminPasswordHash: ''
  }
};

let memoryStore = JSON.parse(JSON.stringify(baseState));

function mergeWithBase(value, base) {
  if (Array.isArray(base)) {
    return Array.isArray(value) ? value : base;
  }

  if (base && typeof base === 'object') {
    const source = value && typeof value === 'object' ? value : {};
    const result = { ...source };

    for (const key of Object.keys(base)) {
      result[key] = mergeWithBase(source[key], base[key]);
    }

    return result;
  }

  return value === undefined ? base : value;
}

function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function ensureStore() {
  const existing = tryReadJson(storePath);
  if (existing) {
    memoryStore = mergeWithBase(existing, baseState);
    return;
  }

  const bundled = tryReadJson(defaultStorePath);
  memoryStore = mergeWithBase(bundled || baseState, baseState);

  try {
    fs.writeFileSync(storePath, JSON.stringify(memoryStore, null, 2));
  } catch {
    // read-only fs fallback (shouldn't happen on /tmp, but keep safe)
  }
}

function loadStore() {
  ensureStore();

  const fromDisk = tryReadJson(storePath);
  if (fromDisk) {
    memoryStore = mergeWithBase(fromDisk, baseState);
    return memoryStore;
  }

  return mergeWithBase(memoryStore, baseState);
}

function saveStore(state) {
  memoryStore = mergeWithBase(state, baseState);

  try {
    fs.writeFileSync(storePath, JSON.stringify(memoryStore, null, 2));
  } catch {
    // keep in-memory state when filesystem write is unavailable
  }
}

module.exports = {
  loadStore,
  saveStore,
  baseState,
  storePath
};
