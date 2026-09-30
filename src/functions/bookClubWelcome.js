// src/functions/bookClubWelcome.js
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { AttachmentBuilder } = require('discord.js');
const { connectToMongo, getBookClubWelcomedCollection } = require('./mongo');
const { sendLog } = require('./discordLogger');

// Same guild this bot is deployed to (see src/events/ready.js).
const GUILD_ID = '1355931319384801361';
const ANNOUNCEMENT_CHANNEL_ID = '1356134887014535188';
const BOOK_READER_ROLE_ID = '1485994676812251196';

const NEW_MEMBER_WINDOW_DAYS = 30;
const MAX_MENTIONS_PER_POST = 30; // keeps the post under Discord's 2000-character limit

// Wednesdays at 6:00 PM Asia/Manila (day: 0 = Sunday ... 6 = Saturday)
const SCHEDULE_DAY = 3;
const SCHEDULE_HOUR = 18;
const SCHEDULE_MINUTE = 0;

// Drop the image in as assets/bookclub-welcome.png (or .jpg/.jpeg/.gif/.webp).
const IMAGE_DIR = path.join(__dirname, '..', '..', 'assets');
const IMAGE_BASENAME = 'bookclub-welcome';
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

let task = null;
let isSending = false;

function buildWelcomeText(mentions) {
  return [
    `📚 **Welcome to the Café Cloud Book Club, ${mentions}!** ☁️`,
    '',
    'We’re so happy you’re here! Grab a cozy drink and settle in, here’s what our little book club gets up to~',
    '',
    '🌙 **Weekly Silent Reading** — every week from 7–8 PM onwards. Bring any book and read quietly together.',
    '📖 **Book of the Month** — we read one book together and meet once a month to talk about it.',
    '🎬 **Bi-Weekly Movie Night Outs** — we head out to catch a movie together!',
    '☕ **Monthly In-Person Hangouts** — once a month, we meet up in real life too.',
    '',
    '🧸 **Deskie can help you keep track of your reading, too:**',
    '• `/tbr add` — save books you want to read',
    '• `/reading start` & `/reading progress` — track what you’re reading',
    '• `/bookreview complete` — rate and review books you’ve finished',
    '• `/goal set` — set a yearly reading goal',
    '• `/leaderboard` — see who’s been reading the most',
    '• `/help` — see everything else I can do',
    '',
    'No pressure at all, join in whenever it feels right 💛',
    '— Deskie 🐻',
  ].join('\n');
}

function findWelcomeImage() {
  for (const extension of IMAGE_EXTENSIONS) {
    const filePath = path.join(IMAGE_DIR, `${IMAGE_BASENAME}.${extension}`);

    if (fs.existsSync(filePath)) {
      return new AttachmentBuilder(filePath, { name: `${IMAGE_BASENAME}.${extension}` });
    }
  }

  return null;
}

function buildWelcomePayload(memberIds) {
  const image = findWelcomeImage();

  return {
    content: buildWelcomeText(memberIds.map(id => `<@${id}>`).join(' ')),
    files: image ? [image] : [],
    allowedMentions: { users: memberIds },
  };
}

// Book Readers who joined recently and haven't had a book club welcome yet.
async function getMembersToWelcome(guild) {
  const members = await guild.members.fetch();
  const cutoff = Date.now() - NEW_MEMBER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const candidates = members.filter(
    member =>
      !member.user.bot &&
      member.roles.cache.has(BOOK_READER_ROLE_ID) &&
      (member.joinedTimestamp ?? 0) >= cutoff
  );

  if (!candidates.size) return [];

  const collection = await getBookClubWelcomedCollection();
  const alreadyWelcomed = await collection
    .find({ guildId: guild.id, userId: { $in: [...candidates.keys()] } })
    .project({ userId: 1 })
    .toArray();
  const alreadyWelcomedIds = new Set(alreadyWelcomed.map(doc => doc.userId));

  return [...candidates.values()]
    .filter(member => !alreadyWelcomedIds.has(member.id))
    .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp)
    .slice(0, MAX_MENTIONS_PER_POST); // anyone past the cap rolls over to the next post
}

async function markWelcomed(guildId, userIds) {
  const collection = await getBookClubWelcomedCollection();
  const welcomedAt = new Date().toISOString();

  await collection.bulkWrite(
    userIds.map(userId => ({
      updateOne: {
        filter: { guildId, userId },
        update: { $setOnInsert: { guildId, userId, welcomedAt } },
        upsert: true,
      },
    }))
  );
}

// Posts one welcome for everyone waiting. Posts nothing if nobody new qualifies.
async function sendBookClubWelcome(client, source = 'manual') {
  if (isSending) return { status: 'busy', count: 0 };
  isSending = true;

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await getMembersToWelcome(guild);

    if (!members.length) {
      console.log(`[Book Club Welcome] Nobody new to welcome (${source}).`);
      return { status: 'nobody', count: 0 };
    }

    const channel = await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      throw new Error(`Invalid or inaccessible announcement channel: ${ANNOUNCEMENT_CHANNEL_ID}`);
    }

    const memberIds = members.map(member => member.id);
    await channel.send(buildWelcomePayload(memberIds));
    await markWelcomed(guild.id, memberIds);

    console.log(`[Book Club Welcome] Welcomed ${memberIds.length} member(s) via ${source}.`);

    await sendLog(client, {
      title: '📚 Book Club Welcome Sent',
      color: 0x57F287,
      description: `Welcomed ${memberIds.length} new book reader(s) via \`${source}\`.`,
      fields: [
        {
          name: 'Members',
          value: members.map(member => `${member.user.tag} (${member.id})`).join('\n'),
          inline: false,
        },
      ],
    });

    return { status: 'sent', count: memberIds.length };
  } finally {
    isSending = false;
  }
}

function getManilaNow() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  );
}

// Date of the most recent scheduled run (e.g. "2026-09-30"), used to detect a missed week.
function getCurrentWeekKey() {
  const now = getManilaNow();
  const scheduled = new Date(now);

  scheduled.setDate(now.getDate() - ((now.getDay() - SCHEDULE_DAY + 7) % 7));
  scheduled.setHours(SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);

  if (scheduled > now) {
    scheduled.setDate(scheduled.getDate() - 7);
  }

  const year = scheduled.getFullYear();
  const month = String(scheduled.getMonth() + 1).padStart(2, '0');
  const day = String(scheduled.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getBotStateCollection() {
  const db = await connectToMongo();
  return db.collection('botState');
}

async function readState() {
  const collection = await getBotStateCollection();
  return collection.findOne({ key: 'bookClubWelcome' });
}

async function writeState(lastRunWeek) {
  const collection = await getBotStateCollection();

  await collection.updateOne(
    { key: 'bookClubWelcome' },
    { $set: { key: 'bookClubWelcome', lastRunWeek } },
    { upsert: true }
  );
}

async function runScheduled(client, source) {
  try {
    await sendBookClubWelcome(client, source);
    await writeState(getCurrentWeekKey());
  } catch (error) {
    console.error('[Book Club Welcome] Failed to send:', error);

    await sendLog(client, {
      title: '❌ Book Club Welcome Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  }
}

async function catchUpMissedRun(client) {
  const state = await readState();
  const weekKey = getCurrentWeekKey();

  // First launch: start the weekly cycle without an immediate surprise post.
  if (!state) {
    await writeState(weekKey);
    console.log('[Book Club Welcome] First launch: weekly cycle starts from the next scheduled time.');
    return;
  }

  if (state.lastRunWeek === weekKey) return;

  console.log('[Book Club Welcome] Startup check: missed this week’s run, sending catch-up now...');
  await runScheduled(client, 'startup-catchup');
}

function startBookClubWelcomeScheduler(client) {
  if (task) {
    task.stop();
    task.destroy();
  }

  task = cron.schedule(
    `${SCHEDULE_MINUTE} ${SCHEDULE_HOUR} * * ${SCHEDULE_DAY}`,
    async () => {
      console.log('[Book Club Welcome] Running weekly post...');
      await runScheduled(client, 'scheduled');
    },
    {
      timezone: 'Asia/Manila',
    }
  );

  console.log('[Book Club Welcome] Scheduler started for Wednesdays 6:00 PM Asia/Manila.');

  catchUpMissedRun(client).catch(async error => {
    console.error('[Book Club Welcome] Startup catch-up failed:', error);

    await sendLog(client, {
      title: '❌ Book Club Welcome Catch-Up Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  });
}

module.exports = {
  startBookClubWelcomeScheduler,
  sendBookClubWelcome,
  getMembersToWelcome,
  buildWelcomePayload,
  findWelcomeImage,
  ANNOUNCEMENT_CHANNEL_ID,
  NEW_MEMBER_WINDOW_DAYS,
};
