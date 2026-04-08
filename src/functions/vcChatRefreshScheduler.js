const cron = require('node-cron');
const { sendLog } = require('./discordLogger');

const TARGET_CHANNEL_ID = '1485991365686067453'; // VC side chat
const REFRESH_HOUR = 0; // 12 AM Manila
const REFRESH_MINUTE = 0;

let vcRefreshTask = null;

async function wipeVcChat(channel) {
  let totalDeletedCount = 0;

  while (true) {
    const fetched = await channel.messages.fetch({ limit: 100 });

    const toDelete = fetched.filter(msg => !msg.author.bot && !msg.pinned);
    if (toDelete.size === 0) break;

    const now = Date.now();
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

    const within14Days = toDelete.filter(
      msg => now - msg.createdTimestamp < twoWeeksMs
    );
    const olderThan14Days = toDelete.filter(
      msg => now - msg.createdTimestamp >= twoWeeksMs
    );

    if (within14Days.size > 0) {
      try {
        await channel.bulkDelete(within14Days, true);
        totalDeletedCount += within14Days.size;
      } catch (err) {
        console.error('VC bulk delete error:', err);
      }
    }

    for (const [, msg] of olderThan14Days) {
      try {
        await msg.delete();
        totalDeletedCount++;
      } catch (err) {
        console.error('VC single delete error:', err);
      }
    }

    if (fetched.size < 100) break;
  }

  return totalDeletedCount;
}

async function refreshVcChat(client) {
  try {
    const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);

    if (!targetChannel) {
      throw new Error(`Could not find target channel ${TARGET_CHANNEL_ID}`);
    }

    if (!targetChannel.isTextBased()) {
      throw new Error(`Channel ${TARGET_CHANNEL_ID} is not text-based.`);
    }

    const deletedCount = await wipeVcChat(targetChannel);

    const refreshMessage = await targetChannel.send({
      content:
        `☁️ **VC Chat Refreshed**\n` +
        `A fresh clean slate for today’s side chat is hereee.\n\n` +
        `Feel free to drop your current read, thoughts, or little check-ins here 📚✨`,
    });

    await sendLog(client, {
      title: '☁️ VC Chat Auto-Refreshed',
      color: 0x57F287,
      description: 'Daily VC side chat refresh completed successfully.',
      fields: [
        {
          name: 'Channel ID',
          value: TARGET_CHANNEL_ID,
          inline: false,
        },
        {
          name: 'Deleted Messages',
          value: String(deletedCount),
          inline: true,
        },
        {
          name: 'Refresh Message ID',
          value: refreshMessage.id,
          inline: false,
        },
      ],
    });
  } catch (error) {
    console.error('VC chat refresh failed:', error);

    await sendLog(client, {
      title: '❌ VC Chat Refresh Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    }).catch(() => null);
  }
}

function startVcChatRefreshScheduler(client) {
  if (vcRefreshTask) {
    vcRefreshTask.stop();
    vcRefreshTask.destroy();
  }

  vcRefreshTask = cron.schedule(
    `${REFRESH_MINUTE} ${REFRESH_HOUR} * * *`,
    async () => {
      await refreshVcChat(client);
    },
    {
      timezone: 'Asia/Manila',
    }
  );

  sendLog(client, {
    title: '🕛 VC Chat Refresh Scheduler Started',
    color: 0x5865F2,
    description: `Daily VC chat refresh armed for ${String(REFRESH_HOUR).padStart(2, '0')}:${String(REFRESH_MINUTE).padStart(2, '0')} Asia/Manila.`,
    fields: [
      {
        name: 'Target Channel ID',
        value: TARGET_CHANNEL_ID,
        inline: false,
      },
    ],
  }).catch(() => null);
}

module.exports = {
  startVcChatRefreshScheduler,
  refreshVcChat,
};