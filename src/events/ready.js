// src/events/ready.js
const os = require('os');
const { Events, ActivityType } = require('discord.js');
const pickPresence = require('../functions/pickPresence');
const { startDailyQuoteScheduler } = require('../functions/dailyQuoteScheduler');
const { startVcChatRefreshScheduler } = require('../functions/vcChatRefreshScheduler');
const { startScheduledMessageScheduler } = require('../functions/scheduledMessageScheduler');
const { startMonthlyDigestScheduler } = require('../functions/monthlyDigestScheduler');
const { startBookClubWelcomeScheduler } = require('../functions/bookClubWelcome');
const { startMovieNightScheduler } = require('../functions/movieNight');
const { startBookPromptScheduler } = require('../functions/bookPrompts');
const { startReadingSessionTracker } = require('../functions/readingSessions');
const { sendLog } = require('../functions/discordLogger');
const { connectToMongo } = require('../functions/mongo');

// Reports which settings Deskie can see at startup (names only, never values),
// so a missing variable on the host shows up in the log channel.
const EXPECTED_ENV = [
  { name: 'MONGODB_URI', purpose: 'database' },
  { name: 'LOG_CHANNEL_ID', purpose: 'log channel' },
  { name: 'DAILY_QUOTE_CHANNEL_ID', purpose: 'daily quote' },
  { name: 'API_NINJAS_KEY', purpose: 'daily quote' },
  { name: 'TMDB_API_KEY', purpose: 'movie night' },
  { name: 'MONTHLY_DIGEST_CHANNEL_ID', purpose: 'monthly digest', optional: true },
];

function describeEnvironment() {
  return EXPECTED_ENV.map(({ name, purpose, optional }) => {
    if (process.env[name]?.trim()) return `✅ \`${name}\``;
    return optional
      ? `➖ \`${name}\` (optional, ${purpose})`
      : `❌ \`${name}\` missing, ${purpose} won't work`;
  }).join('\n');
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`🚀 Deskie is online as ${client.user.tag}`);

    client.user.setActivity('starting up...', { type: ActivityType.Playing });

    pickPresence(client);

    try {
      await connectToMongo();
      console.log('✅ MongoDB connected successfully.');
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);

      await sendLog(client, {
        title: '❌ MongoDB Connection Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    try {
      startDailyQuoteScheduler(client);
      console.log('✅ Daily quote scheduler started.');
    } catch (error) {
      console.error('❌ Failed to start daily quote scheduler:', error);

      await sendLog(client, {
        title: '❌ Daily Quote Scheduler Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    try {
      startVcChatRefreshScheduler(client);
      console.log('✅ VC chat refresh scheduler started.');
    } catch (error) {
      console.error('❌ Failed to start VC chat refresh scheduler:', error);

      await sendLog(client, {
        title: '❌ VC Chat Refresh Scheduler Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    try {
      await startScheduledMessageScheduler(client);
      console.log('✅ Scheduled message scheduler started.');
    } catch (error) {
      console.error('❌ Failed to start scheduled message scheduler:', error);

      await sendLog(client, {
        title: '❌ Scheduled Message Scheduler Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    try {
      startMonthlyDigestScheduler(client);
      console.log('✅ Monthly digest scheduler started.');
    } catch (error) {
      console.error('❌ Failed to start monthly digest scheduler:', error);

      await sendLog(client, {
        title: '❌ Monthly Digest Scheduler Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    try {
      startBookClubWelcomeScheduler(client);
      console.log('✅ Book club welcome scheduler started.');
    } catch (error) {
      console.error('❌ Failed to start book club welcome scheduler:', error);

      await sendLog(client, {
        title: '❌ Book Club Welcome Scheduler Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    try {
      await startMovieNightScheduler(client);
      console.log('✅ Movie night scheduler started.');
    } catch (error) {
      console.error('❌ Failed to start movie night scheduler:', error);

      await sendLog(client, {
        title: '❌ Movie Night Scheduler Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    try {
      startBookPromptScheduler(client);
      console.log('✅ Bookish Banter question scheduler started.');
    } catch (error) {
      console.error('❌ Failed to start Bookish Banter question scheduler:', error);

      await sendLog(client, {
        title: '❌ Bookish Banter Scheduler Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    try {
      await startReadingSessionTracker(client);
      console.log('✅ Reading session tracker started.');
    } catch (error) {
      console.error('❌ Failed to start reading session tracker:', error);

      await sendLog(client, {
        title: '❌ Reading Session Tracker Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });
    }

    await sendLog(client, {
      title: '✅ Deskie Started',
      color: 0x57F287,
      // The machine name makes it easy to spot a second copy running elsewhere.
      description: `Deskie is online as \`${client.user.tag}\`\nRunning on: \`${os.hostname()}\``,
      fields: [
        {
          name: 'Settings Check',
          value: describeEnvironment(),
          inline: false,
        },
        {
          // Lets you confirm the host is running the latest code after an update.
          name: `Commands Loaded (${client.commands.size})`,
          value: [...client.commands.keys()].sort().map(name => `\`/${name}\``).join(' ').slice(0, 1024) || 'None',
          inline: false,
        },
      ],
    });

    const myGuildId = '1355931319384801361';
    const guild = client.guilds.cache.get(myGuildId);

    if (guild) {
      const everyoneRoleId = guild.roles.everyone.id;
      console.log(`📌 Connected to: ${guild.name}`);
      console.log(`🆔 @everyone Role ID: ${everyoneRoleId}`);
    } else {
      console.warn(`⚠️ Guild not found in cache: ${myGuildId}`);
    }
  },
};