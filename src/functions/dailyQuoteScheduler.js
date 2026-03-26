const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DAILY_QUOTE_CHANNEL_ID = '1356144081524363305';
const DAILY_QUOTE_HOUR = 8;
const DAILY_QUOTE_MINUTE = 0;

const stateFilePath = path.join(__dirname, '../data/dailyQuoteState.json');

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
  "Good morning, everyone! Here’s a little something to ease into the day with.",
  "A fresh day is here! Take a breath, settle in, and start gently.",
  "Good morning, friends! Here’s today’s little dose of encouragement.",
  "Before the day gets busy, here’s a quiet reminder for you.",
  "Here’s your small morning boost from Deskie.",
  "Good morning, clouders! Let’s begin today with something uplifting.",
  "A little reminder for this morning: you do not need to rush your growth.",
  "Take this as your gentle nudge to begin the day at your own pace.",
  "Good morning! Here’s a small thought to carry with you today.",
  "A new day means a new chance to begin again, even softly.",
  "Here’s today’s warm little check-in from Deskie.",
  "Hey friends! Before you dive into the day, pause for this little reminder.",
  "Good morning! Let today begin with something kind and encouraging.",
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

function ensureStateFile() {
  const folder = path.dirname(stateFilePath);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  if (!fs.existsSync(stateFilePath)) {
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify({ lastSentDate: null }, null, 2),
      'utf8'
    );
  }
}

function readState() {
  ensureStateFile();
  return JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
}

function writeState(state) {
  ensureStateFile();
  fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');
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

function hasAlreadySentToday() {
  const state = readState();
  return state.lastSentDate === getManilaDateString();
}

function markSentToday() {
  const state = readState();
  state.lastSentDate = getManilaDateString();
  writeState(state);
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

function pickNonRepeatingRandom(list, lastValue) {
  const filtered = list.filter(item => item !== lastValue);
  return filtered[Math.floor(Math.random() * filtered.length)];
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
    if (source !== 'manual' && hasAlreadySentToday()) {
      console.log(`[Daily Quote] Skipped (${source}) because today was already posted.`);
      return;
    }

    const channel = await client.channels.fetch(DAILY_QUOTE_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.error('[Daily Quote] Invalid channel.');
      return;
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
      markSentToday();
    }

    console.log(`[Daily Quote] Sent successfully via ${source}.`);
  } catch (error) {
    console.error('[Daily Quote] Failed to send quote:', error);
  }
}

async function catchUpMissedDailyQuote(client) {
  if (!isPastScheduledTimeInManila()) {
    console.log('[Daily Quote] Startup check: not past 8:00 AM Manila yet.');
    return;
  }

  if (hasAlreadySentToday()) {
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

  ensureStateFile();

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
  catchUpMissedDailyQuote(client).catch(error => {
    console.error('[Daily Quote] Startup catch-up failed:', error);
  });
}

module.exports = {
  startDailyQuoteScheduler,
  sendDailyQuote,
};