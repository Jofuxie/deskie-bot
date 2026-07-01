// src/functions/monthlyDigestScheduler.js
const cron = require('node-cron');
const { getMonthlyDigestData } = require('./tbrStore');
const { connectToMongo } = require('./mongo');
const { sendLog } = require('./discordLogger');

// Same guild this bot is deployed to (see src/events/ready.js).
const DIGEST_GUILD_ID = '1355931319384801361';

const DIGEST_HOUR = 9;
const DIGEST_MINUTE = 0;
const CATCH_UP_END_DAY = 3; // catch-up allowed only within the first 3 days of the month

const MEDALS = ['🥇', '🥈', '🥉'];

let digestTask = null;

function getManilaNow() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  );
}

function getManilaMonthString(date = getManilaNow()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function getBotStateCollection() {
  const db = await connectToMongo();
  return db.collection('botState');
}

async function readState() {
  const collection = await getBotStateCollection();
  const state = await collection.findOne({ key: 'monthlyDigest' });

  return state || {
    key: 'monthlyDigest',
    lastSentMonth: null,
  };
}

async function writeState(nextState) {
  const collection = await getBotStateCollection();

  await collection.updateOne(
    { key: 'monthlyDigest' },
    {
      $set: {
        key: 'monthlyDigest',
        lastSentMonth: nextState.lastSentMonth ?? null,
      },
    },
    { upsert: true }
  );
}

async function hasAlreadySentThisMonth() {
  const state = await readState();
  return state.lastSentMonth === getManilaMonthString();
}

async function markSentThisMonth() {
  await writeState({ lastSentMonth: getManilaMonthString() });
}

function isPastScheduledTimeToday() {
  const now = getManilaNow();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  return (
    currentHour > DIGEST_HOUR ||
    (currentHour === DIGEST_HOUR && currentMinute >= DIGEST_MINUTE)
  );
}

function isStillWithinCatchUpWindow() {
  return getManilaNow().getDate() <= CATCH_UP_END_DAY;
}

function getPreviousMonthTarget() {
  const now = getManilaNow();
  const targetDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));

  return {
    year: targetDate.getUTCFullYear(),
    month: targetDate.getUTCMonth() + 1,
    label: targetDate.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

function buildDigestMessage(monthLabel, data) {
  const lines = [
    `🗓️ **${monthLabel} Reading Digest**`,
    '',
    `This month, Café Cloud finished **${data.totalFinishedPublic}** book(s) together, with **${data.activeReaderCount}** reader(s) active. Cozy work, everyone 💛`,
    '',
  ];

  if (data.leaderboard.length) {
    lines.push('**🏆 Top Finishers**');
    data.leaderboard.forEach((row, index) => {
      const medal = MEDALS[index] || `**${index + 1}.**`;
      const books = row.count === 1 ? 'book' : 'books';
      lines.push(`${medal} <@${row.userId}> — **${row.count}** ${books}`);
    });
    lines.push('');
  }

  if (data.spotlight) {
    const book = data.spotlight.book || {};
    const authors = book.authors?.join(', ') || 'Unknown Author';
    lines.push('**✨ Review Spotlight**');
    lines.push(`*"${data.spotlight.reviewText}"*`);
    lines.push(`— <@${data.spotlight.userId}>, on **${book.title || 'Unknown Title'}** by ${authors}`);
    lines.push('');
  }

  lines.push('Here’s to another gentle chapter ahead. 📖🌙');

  return lines.join('\n');
}

async function sendMonthlyDigest(client, source = 'manual') {
  try {
    const channelId = process.env.MONTHLY_DIGEST_CHANNEL_ID || process.env.DAILY_QUOTE_CHANNEL_ID;

    if (!channelId) {
      throw new Error('Missing MONTHLY_DIGEST_CHANNEL_ID (or DAILY_QUOTE_CHANNEL_ID fallback) in environment variables');
    }

    if (source !== 'manual' && await hasAlreadySentThisMonth()) {
      console.log(`[Monthly Digest] Skipped (${source}) because this month was already posted.`);
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      throw new Error(`Invalid or inaccessible monthly digest channel: ${channelId}`);
    }

    const { year, month, label } = getPreviousMonthTarget();
    const data = await getMonthlyDigestData(DIGEST_GUILD_ID, { year, month });
    const message = buildDigestMessage(label, data);

    await channel.send(message);

    if (source !== 'manual') {
      await markSentThisMonth();
    }

    console.log(`[Monthly Digest] Sent successfully via ${source} for ${label}.`);

    await sendLog(client, {
      title: '🗓️ Monthly Digest Sent',
      color: 0x57F287,
      description: `Monthly digest sent via \`${source}\` for ${label}.`,
      fields: [
        {
          name: 'Channel ID',
          value: channelId,
          inline: false,
        },
      ],
    });
  } catch (error) {
    console.error('[Monthly Digest] Failed to send digest:', error);

    await sendLog(client, {
      title: '❌ Monthly Digest Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  }
}

async function catchUpMissedMonthlyDigest(client) {
  if (!isStillWithinCatchUpWindow()) {
    console.log('[Monthly Digest] Startup check: past catch-up window, no automatic digest will be sent.');
    return;
  }

  if (getManilaNow().getDate() === 1 && !isPastScheduledTimeToday()) {
    console.log('[Monthly Digest] Startup check: not past 9:00 AM Manila yet on the 1st.');
    return;
  }

  if (await hasAlreadySentThisMonth()) {
    console.log('[Monthly Digest] Startup check: this month already sent.');
    return;
  }

  console.log('[Monthly Digest] Startup check: missed post detected, sending catch-up now...');
  await sendMonthlyDigest(client, 'startup-catchup');
}

function startMonthlyDigestScheduler(client) {
  if (digestTask) {
    digestTask.stop();
    digestTask.destroy();
  }

  digestTask = cron.schedule(
    `${DIGEST_MINUTE} ${DIGEST_HOUR} 1 * *`,
    async () => {
      console.log('[Monthly Digest] Running scheduled 1st-of-month post...');
      await sendMonthlyDigest(client, 'scheduled');
    },
    {
      timezone: 'Asia/Manila',
    }
  );

  console.log('[Monthly Digest] Scheduler started for 9:00 AM Asia/Manila on the 1st of each month.');

  sendLog(client, {
    title: '🗓️ Monthly Digest Scheduler Started',
    color: 0x5865F2,
    description: 'Scheduler armed for 9:00 AM Asia/Manila on the 1st of each month.',
  }).catch(() => null);

  catchUpMissedMonthlyDigest(client).catch(async error => {
    console.error('[Monthly Digest] Startup catch-up failed:', error);

    await sendLog(client, {
      title: '❌ Monthly Digest Catch-Up Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  });
}

module.exports = {
  startMonthlyDigestScheduler,
  sendMonthlyDigest,
};
