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
    publisher: book.publisher || null,
    description: book.description || null,
    coverUrl: book.coverUrl || null,
    openLibraryLink: book.openLibraryLink || null,
    goodreadsLink: book.goodreadsLink || null,
    totalPages: Number.isFinite(book.totalPages) ? book.totalPages : null,
  };
}

function getStateLabel(state) {
  if (state === 'reading') return 'current reads';
  if (state === 'finished') return 'finished books';
  return 'TBR';
}

async function findExistingExactEntry(guildId, userId, title, { excludeId = null } = {}) {
  const collection = await getTbrCollection();
  const entries = await collection.find({ guildId, userId }).toArray();
  const normalizedTitle = normalizeText(title);

  const exactMatches = entries.filter((entry) => {
    if (excludeId && entry.id === excludeId) return false;
    return normalizeText(entry.book?.title) === normalizedTitle;
  });

  if (!exactMatches.length) return null;

  const priority = { reading: 0, tbr: 1, finished: 2 };
  exactMatches.sort((a, b) => {
    const aPriority = priority[a.state] ?? 99;
    const bPriority = priority[b.state] ?? 99;
    return aPriority - bPriority;
  });

  return exactMatches[0];
}

async function addTbrEntry({ guildId, userId, username, visibility, book }) {
  const existing = await findExistingExactEntry(guildId, userId, book.title);

  if (existing) {
    return {
      status: 'already_exists',
      existingState: existing.state,
      stateLabel: getStateLabel(existing.state),
      entry: existing,
    };
  }

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

  return {
    status: 'added',
    entry,
  };
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

  const target = matches[0];

  const duplicate = await findExistingExactEntry(
    guildId,
    userId,
    target.book?.title,
    { excludeId: target.id }
  );

  if (duplicate?.state === 'reading') {
    return {
      status: 'already_in_reading',
      entry: duplicate,
    };
  }

  if (duplicate?.state === 'finished') {
    return {
      status: 'already_finished',
      entry: duplicate,
    };
  }

  const readingCount = await countUserReadingEntries(guildId, userId);
  if (readingCount >= 3) {
    return { status: 'limit_reached' };
  }

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
        totalPages,
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
        totalPages,
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

async function returnReadingEntryToTbr(guildId, userId, query) {
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
        state: 'tbr',
        startedAt: null,
        currentPage: null,
        finishedAt: null,
        rating: null,
      },
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    return { status: 'not_found' };
  }

  return {
    status: 'returned',
    entry: result,
  };
}

async function getUserFinishedEntries(guildId, userId, { includePrivate = true } = {}) {
  return getUserEntries(guildId, userId, {
    includePrivate,
    state: 'finished',
  });
}

async function finalizeEntryToFinished(entry, rating) {
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return { status: 'invalid_rating' };
  }

  const collection = await getTbrCollection();
  const finishedAt = new Date().toISOString();
  const totalPages = entry.totalPages ?? entry.book?.totalPages ?? null;

  const result = await collection.findOneAndUpdate(
    {
      guildId: entry.guildId,
      userId: entry.userId,
      id: entry.id,
      state: entry.state,
    },
    {
      $set: {
        state: 'finished',
        finishedAt,
        rating: numericRating,
        currentPage: totalPages ?? entry.currentPage ?? null,
        totalPages,
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

async function createFinishedEntryDirect({
  guildId,
  userId,
  username,
  visibility = 'public',
  book,
  rating,
}) {
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return { status: 'invalid_rating' };
  }

  const cleanedBook = pickBookFields(book);
  const collection = await getTbrCollection();
  const now = new Date().toISOString();

  const entry = {
    id: makeEntryId(),
    guildId,
    userId,
    username,
    visibility,
    state: 'finished',
    addedAt: now,
    startedAt: null,
    finishedAt: now,
    currentPage: cleanedBook.totalPages ?? null,
    totalPages: cleanedBook.totalPages,
    rating: numericRating,
    book: cleanedBook,
  };

  await collection.insertOne(entry);

  return {
    status: 'finished',
    entry,
  };
}

async function logFinishedBook({
  guildId,
  userId,
  username,
  query,
  rating,
  visibility = 'public',
  book = null,
}) {
  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return { status: 'invalid_rating' };
  }

  const readingMatches = await findUserEntriesByTitle(guildId, userId, query, {
    state: 'reading',
    includePrivate: true,
  });

  if (readingMatches.length > 1) {
    return {
      status: 'multiple_matches',
      matches: readingMatches,
    };
  }

  if (readingMatches.length === 1) {
    return finalizeEntryToFinished(readingMatches[0], numericRating);
  }

  const tbrMatches = await findUserEntriesByTitle(guildId, userId, query, {
    state: 'tbr',
    includePrivate: true,
  });

  if (tbrMatches.length > 1) {
    return {
      status: 'multiple_matches',
      matches: tbrMatches,
    };
  }

  if (tbrMatches.length === 1) {
    return finalizeEntryToFinished(tbrMatches[0], numericRating);
  }

  const finishedMatches = await findUserEntriesByTitle(guildId, userId, query, {
    state: 'finished',
    includePrivate: true,
  });

  if (finishedMatches.length > 1) {
    return {
      status: 'multiple_matches',
      matches: finishedMatches,
    };
  }

  if (finishedMatches.length === 1) {
    return {
      status: 'already_finished',
      entry: finishedMatches[0],
    };
  }

  if (!book) {
    return { status: 'not_found' };
  }

  const exactExisting = await findExistingExactEntry(guildId, userId, book.title);

  if (exactExisting?.state === 'finished') {
    return {
      status: 'already_finished',
      entry: exactExisting,
    };
  }

  if (exactExisting?.state === 'reading' || exactExisting?.state === 'tbr') {
    return finalizeEntryToFinished(exactExisting, numericRating);
  }

  return createFinishedEntryDirect({
    guildId,
    userId,
    username,
    visibility,
    book,
    rating: numericRating,
  });
}

async function getReaderStatsData(guildId, userId, { includePrivate = false } = {}) {
  const [currentReads, tbrEntries, finishedEntries] = await Promise.all([
    getUserReadingEntries(guildId, userId, { includePrivate }),
    getUserEntries(guildId, userId, { includePrivate, state: 'tbr' }),
    getUserFinishedEntries(guildId, userId, { includePrivate }),
  ]);

  const sortedFinished = [...finishedEntries].sort((a, b) => {
    const aTime = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
    const bTime = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
    return bTime - aTime;
  });

  return {
    currentReads,
    tbrEntries,
    finishedEntries: sortedFinished,
    currentReadsPreview: currentReads.slice(0, 3),
    tbrPreview: tbrEntries.slice(0, 2),
    latestFinished: sortedFinished[0] || null,
    counts: {
      currentReads: currentReads.length,
      tbr: tbrEntries.length,
      finished: sortedFinished.length,
    },
  };
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
  returnReadingEntryToTbr,
  getUserFinishedEntries,
  getReaderStatsData,
  findExistingExactEntry,
  logFinishedBook,
};