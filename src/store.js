const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '..', 'data', 'store.json');

const baseState = {
  users: [],
  classes: [],
  sessions: [],
  loginPodiumOrder: []
};

function ensureStore() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(baseState, null, 2));
  }
}

function loadStore() {
  ensureStore();
  const raw = fs.readFileSync(storePath, 'utf-8');
  return JSON.parse(raw);
}

function saveStore(state) {
  fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
}

function updateStore(mutator) {
  const state = loadStore();
  mutator(state);
  saveStore(state);
}

module.exports = {
  loadStore,
  saveStore,
  updateStore
};
