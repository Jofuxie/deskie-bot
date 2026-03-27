const cron = require('node-cron');
const axios = require('axios');
const { connectToMongo } = require('./mongo');
const { sendLog } = require('./discordLogger');

const DAILY_QUOTE_HOUR = 8;
const DAILY_QUOTE_MINUTE = 0;
const CATCH_UP_END_HOUR = 10; // catch-up allowed only before 10:00 AM Manila time

const headings = [
  "☀️ **Daily Check-In**",
  "🌤 **Morning Check-In**",
  "🧸 **Deskie’s Morning Note**",
  "✨ **Today’s Little Reminder**",
  "💛 **A Gentle Start for Today**",
  "☕ **Morning Boost**",
  "🌼 **Today’s Cozy Check-In**",
  "📖 **A Thought for the Morning**",
  "🌱 **Start-of-Day Reminder**",
  "🫶 **A Soft Start to the Day**",
];

const introLines = [
  "Good morning, everyone. Here’s a little something to ease into the day with.",
  "A fresh day is here. Take a breath, settle in, and start gently.",
  "Good morning, friends. Here’s today’s little dose of encouragement.",
  "Before the day gets busy, here’s a quiet reminder for you.",
  "Here’s your small morning boost from Deskie.",
  "Good morning, Café Cloud. Let’s begin today with something uplifting.",
  "A little reminder for this morning: you do not need to rush your growth.",
  "Take this as your gentle nudge to begin the day at your own pace.",
  "Good morning. Here’s a small thought to carry with you today.",
  "A new day means a new chance to begin again, even softly.",
  "Here’s today’s warm little check-in from Deskie.",
  "Before you dive into the day, pause for this little reminder.",
  "Good morning. Let today begin with something kind and encouraging.",
  "A soft start still counts as a strong start.",
  "Here’s something gentle for the morning before the day fully unfolds.",
];

const affirmationLines = [
  "💛 You are allowed to take things one step at a time today.",
  "🌱 Small progress is still real progress.",
  "☕ You do not need to do everything at once.",
  "✨ Showing up today already matters.",
  "🫶 Be kind to yourself as you move through the day.",
  "🌼 Today can be gentle and meaningful at the same time.",
  "📚 You are doing better than you think.",
  "🌤 One small win today is still a win.",
  "🧸 It is okay to start slow.",
  "💫 Keep going — softly is still going.",
];

const quoteCategorySets = [
  { include: 'wisdom,inspirational,success', exclude: 'love' },
  { include: 'life,inspirational,courage', exclude: 'love' },
  { include: 'happiness,freedom,inspirational', exclude: 'love' },
  { include: 'nature,life,wisdom', exclude: 'love' },
  { include: 'art,writing,inspirational', exclude: 'love' },
  { include: 'success,courage,freedom', exclude: 'love' },
  { include: 'life,happiness,wisdom', exclude: 'love' },
  { include: 'writing,art,life', exclude: 'love' },
];

let lastHeading = null;
let lastIntroLine = null;
let lastAffirmationLine = null;
let lastCategorySet = null;
let dailyQuoteTask = null;

async function getBotStateCollection() {
  const db = await connectToMongo();
  return db.collection('botState');
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

async function readState() {
  const collection = await getBotStateCollection();
  const state = await collection.findOne({ key: 'dailyQuote' });

  return state || {
    key: 'dailyQuote',
    lastSentDate: null,
  };
}

async function writeState(nextState) {
  const collection = await getBotStateCollection();

  await collection.updateOne(
    { key: 'dailyQuote' },
    {
      $set: {
        key: 'dailyQuote',
        lastSentDate: nextState.lastSentDate ?? null,
      },
    },
    { upsert: true }
  );
}

async function hasAlreadySentToday() {
  const state = await readState();
  return state.lastSentDate === getManilaDateString();
}

async function markSentToday() {
  const state = await readState();
  state.lastSentDate = getManilaDateString();
  await writeState(state);
}

function isPastScheduledTimeInManila() {
  const now = getManilaNow();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  return (
    currentHour > DAILY_QUOTE_HOUR ||
    (currentHour === DAILY_QUOTE_HOUR && currentMinute >= DAILY_QUOTE_MINUTE)
  );
}

function isStillWithinCatchUpWindow() {
  const now = getManilaNow();
  return now.getHours() < CATCH_UP_END_HOUR;
}

function pickNonRepeatingRandom(list, lastValue) {
  const filtered = list.filter(item => item !== lastValue);
  const source = filtered.length ? filtered : list;
  return source[Math.floor(Math.random() * source.length)];
}

function getRandomHeading() {
  const selected = pickNonRepeatingRandom(headings, lastHeading);
  lastHeading = selected;
  return selected;
}

function getRandomIntroLine() {
  const selected = pickNonRepeatingRandom(introLines, lastIntroLine);
  lastIntroLine = selected;
  return selected;
}

function getRandomAffirmationLine() {
  const selected = pickNonRepeatingRandom(affirmationLines, lastAffirmationLine);
  lastAffirmationLine = selected;
  return selected;
}

function getRandomCategorySet() {
  const selected = pickNonRepeatingRandom(quoteCategorySets, lastCategorySet);
  lastCategorySet = selected;
  return selected;
}

async function fetchFilteredQuote() {
  const apiKey = process.env.API_NINJAS_KEY;

  if (!apiKey) {
    throw new Error('Missing API_NINJAS_KEY in environment variables');
  }

  const categorySet = getRandomCategorySet();

  const response = await axios.get('https://api.api-ninjas.com/v2/randomquotes', {
    headers: {
      'X-Api-Key': apiKey,
    },
    params: {
      categories: categorySet.include,
      exclude_categories: categorySet.exclude,
    },
    timeout: 10000,
  });

  const quotes = response.data;

  if (!Array.isArray(quotes) || quotes.length === 0) {
    throw new Error('No filtered quotes returned from API Ninjas.');
  }

  const validQuotes = quotes.filter(quote => quote?.quote && quote?.author);

  if (validQuotes.length === 0) {
    throw new Error('No valid filtered quotes returned from API Ninjas.');
  }

  const selectedQuote =
    validQuotes[Math.floor(Math.random() * validQuotes.length)];

  return {
    text: selectedQuote.quote,
    author: selectedQuote.author,
  };
}

async function fetchRandomQuoteFallback() {
  const response = await axios.get('https://api.api-ninjas.com/v2/randomquotes', {
    headers: {
      'X-Api-Key': process.env.API_NINJAS_KEY,
    },
    timeout: 10000,
  });

  const quotes = response.data;

  if (!Array.isArray(quotes) || quotes.length === 0) {
    throw new Error('Fallback quote request returned no quotes.');
  }

  const quote = quotes[0];

  if (!quote?.quote || !quote?.author) {
    throw new Error('Invalid fallback quote response from API Ninjas.');
  }

  return {
    text: quote.quote,
    author: quote.author,
  };
}

async function fetchQuoteWithFallback() {
  try {
    return await fetchFilteredQuote();
  } catch (error) {
    console.warn('[Daily Quote] Filtered quote failed, using random fallback:', error.message);
    return await fetchRandomQuoteFallback();
  }
}

async function sendDailyQuote(client, source = 'manual') {
  try {
    const channelId = process.env.DAILY_QUOTE_CHANNEL_ID;

    if (!channelId) {
      throw new Error('Missing DAILY_QUOTE_CHANNEL_ID in environment variables');
    }

    if (source !== 'manual' && await hasAlreadySentToday()) {
      console.log(`[Daily Quote] Skipped (${source}) because today was already posted.`);
      return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      throw new Error(`Invalid or inaccessible daily quote channel: ${channelId}`);
    }

    const quote = await fetchQuoteWithFallback();
    const heading = getRandomHeading();
    const introLine = getRandomIntroLine();
    const affirmationLine = getRandomAffirmationLine();

    await channel.send(
      `${heading}\n` +
      `${introLine}\n\n` +
      `“${quote.text}”\n` +
      `— **${quote.author}**\n\n` +
      `${affirmationLine}`
    );

    if (source !== 'manual') {
      await markSentToday();
    }

    console.log(`[Daily Quote] Sent successfully via ${source}.`);

    await sendLog(client, {
      title: '☀️ Daily Quote Sent',
      color: 0x57F287,
      description: `Daily quote sent via \`${source}\`.`,
      fields: [
        {
          name: 'Channel ID',
          value: channelId,
          inline: false,
        },
        {
          name: 'Date (Manila)',
          value: getManilaDateString(),
          inline: true,
        },
      ],
    });
  } catch (error) {
    console.error('[Daily Quote] Failed to send quote:', error);

    await sendLog(client, {
      title: '❌ Daily Quote Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  }
}

async function catchUpMissedDailyQuote(client) {
  if (!isPastScheduledTimeInManila()) {
    console.log('[Daily Quote] Startup check: not past 8:00 AM Manila yet.');
    return;
  }

  if (!isStillWithinCatchUpWindow()) {
    console.log('[Daily Quote] Startup check: past catch-up window, no automatic quote will be sent.');
    return;
  }

  if (await hasAlreadySentToday()) {
    console.log('[Daily Quote] Startup check: today already sent.');
    return;
  }

  console.log('[Daily Quote] Startup check: missed 8:00 AM post detected, sending catch-up now...');
  await sendDailyQuote(client, 'startup-catchup');
}

function startDailyQuoteScheduler(client) {
  if (dailyQuoteTask) {
    dailyQuoteTask.stop();
    dailyQuoteTask.destroy();
  }

  dailyQuoteTask = cron.schedule(
    '0 8 * * *',
    async () => {
      console.log('[Daily Quote] Running scheduled 8:00 AM post...');
      await sendDailyQuote(client, 'scheduled');
    },
    {
      timezone: 'Asia/Manila',
    }
  );

  console.log('[Daily Quote] Scheduler started for 8:00 AM Asia/Manila.');

  sendLog(client, {
    title: '🕗 Daily Quote Scheduler Started',
    color: 0x5865F2,
    description: 'Scheduler armed for 8:00 AM Asia/Manila.',
  }).catch(() => null);

  catchUpMissedDailyQuote(client).catch(async error => {
    console.error('[Daily Quote] Startup catch-up failed:', error);

    await sendLog(client, {
      title: '❌ Daily Quote Catch-Up Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  });
}

module.exports = {
  startDailyQuoteScheduler,
  sendDailyQuote,
};