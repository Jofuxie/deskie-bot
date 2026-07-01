// src/functions/scheduledMessageStore.js
const { getScheduledMessagesCollection } = require('./mongo');

function makeScheduledMessageId() {
  return `sched_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createScheduledMessage({
  guildId,
  channelId,
  userId,
  content,
  fireAt,
  type = 'reminder',
}) {
  const collection = await getScheduledMessagesCollection();

  const doc = {
    id: makeScheduledMessageId(),
    guildId,
    channelId,
    userId,
    content,
    fireAt,
    type,
    createdAt: new Date().toISOString(),
  };

  await collection.insertOne(doc);
  return doc;
}

async function getAllPendingScheduledMessages() {
  const collection = await getScheduledMessagesCollection();
  return collection.find({}).toArray();
}

async function deleteScheduledMessage(id) {
  const collection = await getScheduledMessagesCollection();
  await collection.deleteOne({ id });
}

module.exports = {
  createScheduledMessage,
  getAllPendingScheduledMessages,
  deleteScheduledMessage,
};
