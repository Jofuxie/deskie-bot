// src/functions/goalStore.js
const { getReadingGoalsCollection } = require('./mongo');
const { getUserFinishedEntries } = require('./tbrStore');

function getCurrentYear() {
  return new Date().getUTCFullYear();
}

async function setGoal(guildId, userId, targetBooks, year = getCurrentYear()) {
  const collection = await getReadingGoalsCollection();
  const now = new Date().toISOString();

  await collection.updateOne(
    { guildId, userId, year },
    {
      $set: { targetBooks, updatedAt: now },
      $setOnInsert: { guildId, userId, year, createdAt: now },
    },
    { upsert: true }
  );

  return getGoal(guildId, userId, year);
}

async function getGoal(guildId, userId, year = getCurrentYear()) {
  const collection = await getReadingGoalsCollection();
  return collection.findOne({ guildId, userId, year });
}

async function getGoalProgress(guildId, userId, year = getCurrentYear()) {
  const goal = await getGoal(guildId, userId, year);

  const finishedEntries = await getUserFinishedEntries(guildId, userId, {
    includePrivate: true,
  });

  const finishedThisYear = finishedEntries.filter(entry => {
    if (!entry.finishedAt) return false;
    return new Date(entry.finishedAt).getUTCFullYear() === year;
  });

  const targetBooks = goal?.targetBooks ?? null;

  return {
    year,
    targetBooks,
    finishedCount: finishedThisYear.length,
    percent: targetBooks
      ? Math.min(100, Math.round((finishedThisYear.length / targetBooks) * 100))
      : null,
  };
}

module.exports = {
  setGoal,
  getGoal,
  getGoalProgress,
  getCurrentYear,
};
