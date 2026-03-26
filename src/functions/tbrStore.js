// src/functions/tbrStore.js
const { getTbrCollection } = require('./mongo');

function makeEntryId() {
  return `tbr_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeText(text = '') {
  return String(text).trim().toLowerCase();
}

async function addTbrEntry({ guildId, userId, username, visibility, book }) {
  const collection = await getTbrCollection();

  const entry = {
    id: makeEntryId(),
    guildId,
    userId,
    username,
    visibility,
    addedAt: new Date().toISOString(),
    book,
  };

  await collection.insertOne(entry);
  return entry;
}

async function getUserEntries(guildId, userId, { includePrivate = false } = {}) {
  const collection = await getTbrCollection();

  const query = includePrivate
    ? { guildId, userId }
    : { guildId, userId, visibility: 'public' };

  return collection.find(query).sort({ addedAt: 1 }).toArray();
}

async function getPublicGuildEntries(guildId) {
  const collection = await getTbrCollection();
  return collection.find({ guildId, visibility: 'public' }).toArray();
}

async function removeUserEntry(guildId, userId, entryId) {
  const collection = await getTbrCollection();

  const result = await collection.deleteOne({
    guildId,
    userId,
    id: entryId,
  });

  return result.deletedCount > 0;
}

async function findUserEntriesByTitle(guildId, userId, query) {
  const entries = await getUserEntries(guildId, userId, { includePrivate: true });
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return [];

  const exactMatches = entries.filter((entry) => {
    const title = normalizeText(entry.book?.title);
    return title === normalizedQuery;
  });

  if (exactMatches.length) return exactMatches;

  return entries.filter((entry) => {
    const title = normalizeText(entry.book?.title);
    return title.includes(normalizedQuery);
  });
}

async function removeUserEntryByTitle(guildId, userId, query) {
  const matches = await findUserEntriesByTitle(guildId, userId, query);

  if (!matches.length) {
    return { status: 'not_found' };
  }

  if (matches.length > 1) {
    return {
      status: 'multiple_matches',
      matches,
    };
  }

  const target = matches[0];
  const removed = await removeUserEntry(guildId, userId, target.id);

  if (!removed) {
    return { status: 'not_found' };
  }

  return {
    status: 'removed',
    entry: target,
  };
}

async function getRandomPublicEntry(guildId) {
  const publicEntries = await getPublicGuildEntries(guildId);
  if (!publicEntries.length) return null;

  const randomIndex = Math.floor(Math.random() * publicEntries.length);
  return publicEntries[randomIndex];
}

module.exports = {
  addTbrEntry,
  getUserEntries,
  getPublicGuildEntries,
  removeUserEntry,
  removeUserEntryByTitle,
  findUserEntriesByTitle,
  getRandomPublicEntry,
};