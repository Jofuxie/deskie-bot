// src/functions/welcomeStore.js
const { connectToMongo, getWelcomedMembersCollection } = require('./mongo');

// Atomically marks a member as welcomed. Returns true only the first time,
// so a rejoin (or a duplicate join event) never gets a second welcome.
async function claimWelcome(guildId, userId) {
  const collection = await getWelcomedMembersCollection();

  const result = await collection.updateOne(
    { guildId, userId },
    { $setOnInsert: { guildId, userId, welcomedAt: new Date().toISOString() } },
    { upsert: true }
  );

  return result.upsertedCount > 0;
}

// Undo a claim when the welcome message failed to send, so it can be retried.
async function releaseWelcome(guildId, userId) {
  const collection = await getWelcomedMembersCollection();
  await collection.deleteOne({ guildId, userId });
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Shuffle-bag: every message is used once before any repeats,
// and the same message never appears twice in a row.
async function pickWelcomeIndex(total) {
  const db = await connectToMongo();
  const collection = db.collection('botState');
  const state = (await collection.findOne({ key: 'welcomeMessage' })) || {};

  let bag = Array.isArray(state.bag)
    ? state.bag.filter(index => Number.isInteger(index) && index < total)
    : [];

  if (!bag.length) {
    bag = shuffle([...Array(total).keys()]);

    if (bag.length > 1 && bag[0] === state.lastIndex) {
      [bag[0], bag[1]] = [bag[1], bag[0]];
    }
  }

  const index = bag.shift();

  await collection.updateOne(
    { key: 'welcomeMessage' },
    { $set: { key: 'welcomeMessage', bag, lastIndex: index } },
    { upsert: true }
  );

  return index;
}

module.exports = {
  claimWelcome,
  releaseWelcome,
  pickWelcomeIndex,
};
