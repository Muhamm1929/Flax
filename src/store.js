const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '..', 'data', 'store.json');

const baseState = {
  users: [],
  classes: [],
  sessions: [],
  loginPodiumOrder: [],
  settings: {
    adminPasswordHash: ''
  }
};

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

function ensureStore() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(baseState, null, 2));
  }
}

function loadStore() {
  ensureStore();
  const raw = fs.readFileSync(storePath, 'utf-8');
  const parsed = JSON.parse(raw);
  return mergeWithBase(parsed, baseState);
}

function saveStore(state) {
  fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
}

module.exports = {
  loadStore,
  saveStore,
  baseState
};
