// src/events/ready.js
const { Events, ActivityType } = require('discord.js');
const pickPresence = require('../functions/pickPresence');
const { startDailyQuoteScheduler } = require('../functions/dailyQuoteScheduler');
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

    startDailyQuoteScheduler(client);

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