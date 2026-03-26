// src/functions/tbrStore.js
const { getTbrCollection } = require('./mongo');

function makeEntryId() {
  return `tbr_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeText(text = '') {
  return String(text).trim().toLowerCase();
}

function pickBookFields(book = {}) {
  return {
    title: book.title || 'Unknown Title',
    authors: Array.isArray(book.authors) && book.authors.length
      ? book.authors
      : ['Unknown Author'],
    publishedYear: book.publishedYear || null,
    coverUrl: book.coverUrl || null,
    openLibraryLink: book.openLibraryLink || null,
    goodreadsLink: book.goodreadsLink || null,
    totalPages: Number.isFinite(book.totalPages) ? book.totalPages : null,
  };
}

async function addTbrEntry({ guildId, userId, username, visibility, book }) {
  const collection = await getTbrCollection();

  const cleanedBook = pickBookFields(book);

  const entry = {
    id: makeEntryId(),
    guildId,
    userId,
    username,
    visibility,
    state: 'tbr',
    addedAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    currentPage: null,
    totalPages: cleanedBook.totalPages,
    rating: null,
    book: cleanedBook,
  };

  await collection.insertOne(entry);
  return entry;
}

async function getUserEntries(
  guildId,
  userId,
  {
    includePrivate = false,
    state = null,
  } = {}
) {
  const collection = await getTbrCollection();

  const query = includePrivate
    ? { guildId, userId }
    : { guildId, userId, visibility: 'public' };

  if (state) {
    query.state = state;
  }

  return collection.find(query).sort({ addedAt: 1 }).toArray();
}

async function getPublicGuildEntries(guildId, { state = 'tbr' } = {}) {
  const collection = await getTbrCollection();

  const query = { guildId, visibility: 'public' };
  if (state) {
    query.state = state;
  }

  return collection.find(query).toArray();
}

async function removeUserEntry(guildId, userId, entryId) {
  const collection = await getTbrCollection();

  const result = await collection.deleteOne({
    guildId,
    userId,
    id: entryId,
    state: 'tbr',
  });

  return result.deletedCount > 0;
}

async function findUserEntriesByTitle(
  guildId,
  userId,
  query,
  { state = null, includePrivate = true } = {}
) {
  const entries = await getUserEntries(guildId, userId, {
    includePrivate,
    state,
  });

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
  const matches = await findUserEntriesByTitle(guildId, userId, query, {
    state: 'tbr',
    includePrivate: true,
  });

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
  const publicEntries = await getPublicGuildEntries(guildId, { state: 'tbr' });
  if (!publicEntries.length) return null;

  const randomIndex = Math.floor(Math.random() * publicEntries.length);
  return publicEntries[randomIndex];
}

async function countUserReadingEntries(guildId, userId) {
  const collection = await getTbrCollection();
  return collection.countDocuments({
    guildId,
    userId,
    state: 'reading',
  });
}

async function startReadingEntry(guildId, userId, query) {
  const matches = await findUserEntriesByTitle(guildId, userId, query, {
    state: 'tbr',
    includePrivate: true,
  });

  if (!matches.length) {
    return { status: 'not_found' };
  }

  if (matches.length > 1) {
    return {
      status: 'multiple_matches',
      matches,
    };
  }

  const readingCount = await countUserReadingEntries(guildId, userId);
  if (readingCount >= 3) {
    return { status: 'limit_reached' };
  }

  const target = matches[0];
  const collection = await getTbrCollection();
  const startedAt = new Date().toISOString();

  const result = await collection.findOneAndUpdate(
    {
      guildId,
      userId,
      id: target.id,
      state: 'tbr',
    },
    {
      $set: {
        state: 'reading',
        startedAt,
        currentPage: 0,
        totalPages: target.totalPages ?? target.book?.totalPages ?? null,
      },
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    return { status: 'not_found' };
  }

  return {
    status: 'started',
    entry: result,
  };
}

async function getUserReadingEntries(guildId, userId, { includePrivate = true } = {}) {
  return getUserEntries(guildId, userId, {
    includePrivate,
    state: 'reading',
  });
}

async function updateReadingProgress(guildId, userId, query, page) {
  const matches = await findUserEntriesByTitle(guildId, userId, query, {
    state: 'reading',
    includePrivate: true,
  });

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
  const totalPages = target.totalPages ?? target.book?.totalPages ?? null;
  const numericPage = Number(page);

  if (!Number.isFinite(numericPage) || numericPage < 0) {
    return { status: 'invalid_page' };
  }

  if (totalPages && numericPage > totalPages) {
    return {
      status: 'page_exceeds_total',
      totalPages,
    };
  }

  const collection = await getTbrCollection();

  const result = await collection.findOneAndUpdate(
    {
      guildId,
      userId,
      id: target.id,
      state: 'reading',
    },
    {
      $set: {
        currentPage: numericPage,
        totalPages: totalPages,
      },
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    return { status: 'not_found' };
  }

  return {
    status: 'updated',
    entry: result,
  };
}

async function finishReadingEntry(guildId, userId, query, rating) {
  const matches = await findUserEntriesByTitle(guildId, userId, query, {
    state: 'reading',
    includePrivate: true,
  });

  if (!matches.length) {
    return { status: 'not_found' };
  }

  if (matches.length > 1) {
    return {
      status: 'multiple_matches',
      matches,
    };
  }

  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return { status: 'invalid_rating' };
  }

  const target = matches[0];
  const collection = await getTbrCollection();
  const finishedAt = new Date().toISOString();
  const totalPages = target.totalPages ?? target.book?.totalPages ?? null;

  const result = await collection.findOneAndUpdate(
    {
      guildId,
      userId,
      id: target.id,
      state: 'reading',
    },
    {
      $set: {
        state: 'finished',
        finishedAt,
        rating: numericRating,
        currentPage: totalPages ?? target.currentPage ?? null,
        totalPages: totalPages,
      },
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    return { status: 'not_found' };
  }

  return {
    status: 'finished',
    entry: result,
  };
}

async function getUserFinishedEntries(guildId, userId, { includePrivate = true } = {}) {
  return getUserEntries(guildId, userId, {
    includePrivate,
    state: 'finished',
  });
}

module.exports = {
  addTbrEntry,
  getUserEntries,
  getPublicGuildEntries,
  removeUserEntry,
  removeUserEntryByTitle,
  findUserEntriesByTitle,
  getRandomPublicEntry,
  countUserReadingEntries,
  startReadingEntry,
  getUserReadingEntries,
  updateReadingProgress,
  finishReadingEntry,
  getUserFinishedEntries,
};