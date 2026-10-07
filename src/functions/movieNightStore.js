// src/functions/movieNightStore.js
const { getMovieRoundsCollection, getMovieVotesCollection } = require('./mongo');

// Dates in these collections are real Date objects (not ISO strings like the
// rest of the bot) because MongoDB's TTL index only works on Date fields.
// Setting `expireAt` on a document makes MongoDB delete it automatically.
async function ensureMovieNightIndexes() {
  const [rounds, votes] = await Promise.all([
    getMovieRoundsCollection(),
    getMovieVotesCollection(),
  ]);

  await Promise.all([
    rounds.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
    votes.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
    votes.createIndex({ roundId: 1, userId: 1 }, { unique: true }),
  ]);
}

async function getOpenRound(guildId) {
  const rounds = await getMovieRoundsCollection();
  return rounds.findOne({ guildId, status: 'open' });
}

async function getAllOpenRounds() {
  const rounds = await getMovieRoundsCollection();
  return rounds.find({ status: 'open' }).toArray();
}

async function createRound({ guildId, theme, startedBy, endsAt }) {
  const rounds = await getMovieRoundsCollection();

  const round = {
    id: `movie_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    guildId,
    status: 'open',
    theme: theme || null,
    startedBy,
    startedAt: new Date(),
    endsAt,
    reminderSent: false,
  };

  await rounds.insertOne(round);
  return round;
}

// One vote per person: voting again replaces their previous vote.
// Returns the vote it replaced (or null if this is their first vote).
async function castVote({ round, userId, username, movie }) {
  const votes = await getMovieVotesCollection();

  const filter = { roundId: round.id, userId };
  const update = {
    $set: {
      roundId: round.id,
      guildId: round.guildId,
      userId,
      username,
      tmdbId: movie.tmdbId,
      movie,
      votedAt: new Date(),
    },
  };

  try {
    return await votes.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'before' });
  } catch (error) {
    // Two votes from the same person landing at the same instant: the unique
    // index rejects the second insert, so retry it as a normal update.
    if (error?.code === 11000) {
      return votes.findOneAndUpdate(filter, update, { returnDocument: 'before' });
    }
    throw error;
  }
}

async function getRoundVotes(roundId) {
  const votes = await getMovieVotesCollection();
  return votes.find({ roundId }).toArray();
}

// Groups votes by movie: each vote is one roulette ticket.
function tallyVotes(votes) {
  const entries = new Map();

  for (const vote of votes) {
    const entry = entries.get(vote.tmdbId) || {
      tmdbId: vote.tmdbId,
      movie: vote.movie,
      tickets: 0,
      voterIds: [],
    };

    entry.tickets += 1;
    entry.voterIds.push(vote.userId);
    entries.set(vote.tmdbId, entry);
  }

  return [...entries.values()].sort(
    (a, b) => b.tickets - a.tickets || a.movie.title.localeCompare(b.movie.title)
  );
}

// Closes an open round exactly once. Returns null if it was already closed
// (e.g. the timer and /movienight end fired at the same time).
async function closeRound(roundId, fields) {
  const rounds = await getMovieRoundsCollection();

  return rounds.findOneAndUpdate(
    { id: roundId, status: 'open' },
    { $set: { ...fields, closedAt: new Date() } },
    { returnDocument: 'after' }
  );
}

// Claims the "last call" reminder exactly once. Returns null if already sent.
async function claimReminder(roundId) {
  const rounds = await getMovieRoundsCollection();

  return rounds.findOneAndUpdate(
    { id: roundId, status: 'open', reminderSent: false },
    { $set: { reminderSent: true } },
    { returnDocument: 'after' }
  );
}

async function scheduleRoundDeletion(roundId, expireAt) {
  const [rounds, votes] = await Promise.all([
    getMovieRoundsCollection(),
    getMovieVotesCollection(),
  ]);

  await Promise.all([
    rounds.updateOne({ id: roundId }, { $set: { expireAt } }),
    votes.updateMany({ roundId }, { $set: { expireAt } }),
  ]);
}

async function deleteRoundData(roundId) {
  const [rounds, votes] = await Promise.all([
    getMovieRoundsCollection(),
    getMovieVotesCollection(),
  ]);

  await Promise.all([
    rounds.deleteOne({ id: roundId }),
    votes.deleteMany({ roundId }),
  ]);
}

module.exports = {
  ensureMovieNightIndexes,
  getOpenRound,
  getAllOpenRounds,
  createRound,
  castVote,
  getRoundVotes,
  tallyVotes,
  closeRound,
  claimReminder,
  scheduleRoundDeletion,
  deleteRoundData,
};
