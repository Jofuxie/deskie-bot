// src/functions/scheduledMessageScheduler.js
const {
  getAllPendingScheduledMessages,
  deleteScheduledMessage,
} = require('./scheduledMessageStore');
const { sendLog } = require('./discordLogger');

// setTimeout delays overflow (and fire immediately) past ~24.8 days.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const activeTimeouts = new Map();

function scheduleMessage(client, doc) {
  if (activeTimeouts.has(doc.id)) {
    clearTimeout(activeTimeouts.get(doc.id));
  }

  const delay = Math.min(
    Math.max(new Date(doc.fireAt).getTime() - Date.now(), 0),
    MAX_TIMEOUT_MS
  );

  const timeout = setTimeout(async () => {
    activeTimeouts.delete(doc.id);

    try {
      const channel = await client.channels.fetch(doc.channelId).catch(() => null);

      if (channel && channel.isTextBased()) {
        await channel.send(doc.content);
      }
    } catch (error) {
      console.error(`Failed to deliver scheduled message ${doc.id}:`, error);

      await sendLog(client, {
        title: '❌ Scheduled Message Delivery Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    } finally {
      await deleteScheduledMessage(doc.id).catch(() => null);
    }
  }, delay);

  activeTimeouts.set(doc.id, timeout);
}

async function startScheduledMessageScheduler(client) {
  const pending = await getAllPendingScheduledMessages();

  for (const doc of pending) {
    scheduleMessage(client, doc);
  }

  console.log(`[Scheduled Messages] Recovered ${pending.length} pending message(s) after startup.`);
}

module.exports = {
  scheduleMessage,
  startScheduledMessageScheduler,
};
