// src/functions/bookPrompts.js
const crypto = require('crypto');
const cron = require('node-cron');
const BUILT_IN_PROMPTS = require('../data/bookPrompts');
const { connectToMongo, getCustomBookPromptsCollection } = require('./mongo');
const { sendLog } = require('./discordLogger');

const BOOKISH_BANTER_CHANNEL_ID = '1486006574060409032';
const BOOK_READER_ROLE_ID = '1485994676812251196';
const PROMPT_ADMIN_ROLE_ID = '1555544474220757115';

// Mondays, Wednesdays and Fridays at 9:00 AM Asia/Manila.
const SCHEDULE_DAYS = [1, 3, 5]; // 0 = Sunday ... 6 = Saturday
const SCHEDULE_HOUR = 9;
const SCHEDULE_MINUTE = 0;
const CATCH_UP_END_HOUR = 12; // if Deskie was offline at 9 AM, catch up until noon
const LOW_POOL_WARNING = 10;

const SUBHEADERS = [
  'Let us know your answers! 💬',
  'Feel free to share your thoughts~ ☕',
  'We’d love to hear from you! 🧸',
  'Drop your answers below! 📚',
  'Share as much or as little as you like 🌿',
  'Tell us in the replies! ✨',
  'Can’t wait to read your answers! 💛',
  'Jump in whenever you’re ready~ ☁️',
];

let promptTask = null;
let isPosting = false;
let lastSubheader = null;

// Compares questions ignoring case, punctuation and spacing.
function normalizePrompt(text) {
  return String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Built-in questions are identified by a short hash of their text, so MongoDB
// only has to remember a tiny list of IDs, not the questions themselves.
function hashPrompt(text) {
  return crypto.createHash('sha1').update(normalizePrompt(text)).digest('hex').slice(0, 10);
}

const BUILT_IN = BUILT_IN_PROMPTS.map(prompt => ({ ...prompt, id: `b:${hashPrompt(prompt.text)}` }));
const BUILT_IN_BY_NORMALIZED = new Set(BUILT_IN_PROMPTS.map(prompt => normalizePrompt(prompt.text)));

async function getBotStateCollection() {
  const db = await connectToMongo();
  return db.collection('botState');
}

async function readState() {
  const collection = await getBotStateCollection();
  return collection.findOne({ key: 'bookPrompts' });
}

async function updateState(update) {
  const collection = await getBotStateCollection();
  // On first write, the upsert creates the document with key: 'bookPrompts' from the filter.
  await collection.updateOne({ key: 'bookPrompts' }, update, { upsert: true });
}

function getRemainingBuiltIns(state) {
  const used = new Set(state?.usedBuiltinIds || []);
  return BUILT_IN.filter(prompt => !used.has(prompt.id));
}

async function getQueuedCustomPrompts() {
  const collection = await getCustomBookPromptsCollection();
  return collection.find({}).sort({ addedAt: 1 }).toArray();
}

// The question that will be posted next. Admin-added questions go first (oldest
// first); otherwise a built-in one is chosen, avoiding the last post's category.
// The built-in choice is saved so /prompt preview always matches what's posted.
async function peekNextPrompt() {
  const [nextCustom] = await getQueuedCustomPrompts();

  if (nextCustom) {
    return { source: 'custom', id: nextCustom.id, text: nextCustom.text, addedBy: nextCustom.addedBy };
  }

  const state = await readState();
  const remaining = getRemainingBuiltIns(state);
  if (!remaining.length) return null;

  let next = remaining.find(prompt => prompt.id === state?.nextBuiltinId);

  if (!next) {
    const differentCategory = remaining.filter(prompt => prompt.category !== state?.lastCategory);
    const pool = differentCategory.length ? differentCategory : remaining;
    next = pool[Math.floor(Math.random() * pool.length)];
    await updateState({ $set: { nextBuiltinId: next.id } });
  }

  return { source: 'builtin', id: next.id, text: next.text, category: next.category };
}

// Marks a question as done: built-ins are added to the used list, admin-added
// ones are deleted from MongoDB entirely.
async function consumePrompt(prompt) {
  if (prompt.source === 'custom') {
    const collection = await getCustomBookPromptsCollection();
    await collection.deleteOne({ id: prompt.id });
    return;
  }

  await updateState({
    $addToSet: { usedBuiltinIds: prompt.id },
    $set: { nextBuiltinId: null, lastCategory: prompt.category },
  });
}

async function getPoolStatus() {
  const [state, custom] = await Promise.all([readState(), getQueuedCustomPrompts()]);
  const builtInLeft = getRemainingBuiltIns(state).length;

  return {
    builtInLeft,
    builtInTotal: BUILT_IN.length,
    customQueued: custom.length,
    totalLeft: builtInLeft + custom.length,
    lastPostedDate: state?.lastPostedDate || null,
  };
}

async function addCustomPrompt(text, addedBy) {
  const cleaned = String(text).trim().replace(/\s+/g, ' ');
  const normalized = normalizePrompt(cleaned);

  if (normalized.length < 8) return { status: 'too_short' };

  const queued = await getQueuedCustomPrompts();
  if (BUILT_IN_BY_NORMALIZED.has(normalized) || queued.some(prompt => normalizePrompt(prompt.text) === normalized)) {
    return { status: 'duplicate' };
  }

  const collection = await getCustomBookPromptsCollection();
  await collection.insertOne({
    id: `c:${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    text: cleaned,
    addedBy,
    addedAt: new Date().toISOString(),
  });

  return { status: 'added', position: queued.length + 1 };
}

function pickSubheader() {
  const options = SUBHEADERS.filter(line => line !== lastSubheader);
  lastSubheader = options[Math.floor(Math.random() * options.length)];
  return lastSubheader;
}

function buildPromptMessage(text, subheader = pickSubheader()) {
  return [
    `<@&${BOOK_READER_ROLE_ID}>`,
    `## 💭 ${text}`,
    subheader,
  ].join('\n');
}

function getManilaNow() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })
  );
}

function getManilaDateString() {
  const now = getManilaNow();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Posts the next question in #bookish-banter. Used by the schedule and /prompt send.
async function postNextPrompt(client, source = 'manual') {
  if (isPosting) return { status: 'busy' };
  isPosting = true;

  try {
    const prompt = await peekNextPrompt();

    if (!prompt) {
      await sendLog(client, {
        title: '⚠️ Out of Bookish Banter Questions',
        color: 0xFEE75C,
        description: 'Every question has been used. Add new ones with `/prompt add` so the Mon/Wed/Fri posts can continue.',
      });
      return { status: 'empty' };
    }

    const channel = await client.channels.fetch(BOOKISH_BANTER_CHANNEL_ID).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      throw new Error(`Invalid or inaccessible #bookish-banter channel: ${BOOKISH_BANTER_CHANNEL_ID}`);
    }

    await channel.send({
      content: buildPromptMessage(prompt.text),
      allowedMentions: { roles: [BOOK_READER_ROLE_ID] },
    });

    await consumePrompt(prompt);
    await updateState({ $set: { lastPostedDate: getManilaDateString() } });

    const status = await getPoolStatus();
    console.log(`[Book Prompts] Posted via ${source}. ${status.totalLeft} question(s) left.`);

    await sendLog(client, {
      title: '💭 Bookish Banter Question Posted',
      color: 0x57F287,
      description: `Posted via \`${source}\`: ${prompt.text}`,
      fields: [
        {
          name: 'Questions Left',
          value: `${status.builtInLeft} from Deskie’s list + ${status.customQueued} added by admins`,
          inline: false,
        },
      ],
    });

    if (status.totalLeft <= LOW_POOL_WARNING) {
      await sendLog(client, {
        title: '⚠️ Bookish Banter Questions Running Low',
        color: 0xFEE75C,
        description: `Only **${status.totalLeft}** question(s) left. Add more with \`/prompt add\` to keep the Mon/Wed/Fri posts going.`,
      });
    }

    return { status: 'sent', prompt, remaining: status.totalLeft };
  } finally {
    isPosting = false;
  }
}

async function runScheduled(client, source) {
  try {
    const state = await readState();

    // A question already went out today (e.g. via /prompt send), so don't double up.
    if (state?.lastPostedDate === getManilaDateString()) {
      console.log(`[Book Prompts] Skipped (${source}): a question was already posted today.`);
      return;
    }

    await postNextPrompt(client, source);
  } catch (error) {
    console.error('[Book Prompts] Failed to post question:', error);

    await sendLog(client, {
      title: '❌ Bookish Banter Question Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  }
}

async function catchUpMissedPrompt(client) {
  const state = await readState();

  // First launch: start the schedule without posting right away.
  if (!state) {
    await updateState({ $set: { lastPostedDate: null } });
    console.log('[Book Prompts] First launch: questions start at the next scheduled time.');
    return;
  }

  const now = getManilaNow();
  const isPromptDay = SCHEDULE_DAYS.includes(now.getDay());
  const minutes = now.getHours() * 60 + now.getMinutes();
  const isWithinCatchUp =
    minutes >= SCHEDULE_HOUR * 60 + SCHEDULE_MINUTE && now.getHours() < CATCH_UP_END_HOUR;

  if (isPromptDay && isWithinCatchUp && state.lastPostedDate !== getManilaDateString()) {
    console.log('[Book Prompts] Startup check: missed this morning’s question, posting now...');
    await runScheduled(client, 'startup-catchup');
  }
}

function startBookPromptScheduler(client) {
  if (promptTask) {
    promptTask.stop();
    promptTask.destroy();
  }

  promptTask = cron.schedule(
    `${SCHEDULE_MINUTE} ${SCHEDULE_HOUR} * * ${SCHEDULE_DAYS.join(',')}`,
    async () => {
      console.log('[Book Prompts] Running scheduled post...');
      await runScheduled(client, 'scheduled');
    },
    {
      timezone: 'Asia/Manila',
    }
  );

  console.log('[Book Prompts] Scheduler started for Mon/Wed/Fri 9:00 AM Asia/Manila.');

  catchUpMissedPrompt(client).catch(async error => {
    console.error('[Book Prompts] Startup catch-up failed:', error);

    await sendLog(client, {
      title: '❌ Bookish Banter Catch-Up Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  });
}

module.exports = {
  BOOKISH_BANTER_CHANNEL_ID,
  PROMPT_ADMIN_ROLE_ID,
  BUILT_IN,
  normalizePrompt,
  peekNextPrompt,
  consumePrompt,
  getPoolStatus,
  addCustomPrompt,
  buildPromptMessage,
  postNextPrompt,
  startBookPromptScheduler,
};
