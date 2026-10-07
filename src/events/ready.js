// src/events/ready.js
const { Events, ActivityType } = require('discord.js');
const pickPresence = require('../functions/pickPresence');
const { startDailyQuoteScheduler } = require('../functions/dailyQuoteScheduler');
const { startVcChatRefreshScheduler } = require('../functions/vcChatRefreshScheduler');
const { startScheduledMessageScheduler } = require('../functions/scheduledMessageScheduler');
const { startMonthlyDigestScheduler } = require('../functions/monthlyDigestScheduler');
const { startBookClubWelcomeScheduler } = require('../functions/bookClubWelcome');
const { startMovieNightScheduler } = require('../functions/movieNight');
const { sendLog } = require('../functions/discordLogger');
const { connectToMongo } = require('../functions/mongo');

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

    await sendLog(client, {
      title: '✅ Deskie Started',
      color: 0x57F287,
      description: `Deskie is online as \`${client.user.tag}\``,
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