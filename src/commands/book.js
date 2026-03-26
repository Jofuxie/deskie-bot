// src/functions/tbrStore.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const tbrPath = path.join(dataDir, 'tbr.json');

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(tbrPath)) {
    fs.writeFileSync(
      tbrPath,
      JSON.stringify({ entries: [] }, null, 2),
      'utf8'
    );
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(tbrPath, 'utf8');
  return JSON.parse(raw);
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(tbrPath, JSON.stringify(data, null, 2), 'utf8');
}

function makeEntryId() {
  return `tbr_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function addTbrEntry({
  guildId,
  userId,
  username,
  visibility,
  book,
}) {
  const data = readStore();

  const entry = {
    id: makeEntryId(),
    guildId,
    userId,
    username,
    visibility,
    addedAt: new Date().toISOString(),
    book,
  };

  data.entries.push(entry);
  writeStore(data);

  return entry;
}

function getUserEntries(guildId, userId, { includePrivate = false } = {}) {
  const data = readStore();

  return data.entries.filter(entry => {
    if (entry.guildId !== guildId) return false;
    if (entry.userId !== userId) return false;
    if (includePrivate) return true;
    return entry.visibility === 'public';
  });
}

function getPublicGuildEntries(guildId) {
  const data = readStore();

  return data.entries.filter(entry => (
    entry.guildId === guildId && entry.visibility === 'public'
  ));
}

function removeUserEntry(guildId, userId, entryId) {
  const data = readStore();
  const before = data.entries.length;

  data.entries = data.entries.filter(entry => !(
    entry.guildId === guildId &&
    entry.userId === userId &&
    entry.id === entryId
  ));

  writeStore(data);
  return data.entries.length < before;
}

function getRandomPublicEntry(guildId) {
  const publicEntries = getPublicGuildEntries(guildId);
  if (!publicEntries.length) return null;

  const randomIndex = Math.floor(Math.random() * publicEntries.length);
  return publicEntries[randomIndex];
}

module.exports = {
  addTbrEntry,
  getUserEntries,
  getPublicGuildEntries,
  removeUserEntry,
  getRandomPublicEntry,
};