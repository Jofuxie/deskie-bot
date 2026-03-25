// src/events/ready.js
const { Events, ActivityType } = require('discord.js');
const pickPresence = require('../functions/pickPresence');
const { startDailyQuoteScheduler } = require('../functions/dailyQuoteScheduler');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    // ✅ Startup confirmation
    console.log(`🚀 Deskie is online as ${client.user.tag}`);

    // 1. Initial presence
    client.user.setActivity('starting up...', { type: ActivityType.Playing });

    // 2. Start rotating presence messages
    pickPresence(client);

    // 3. Start daily quote scheduler
    startDailyQuoteScheduler(client);

    // 4. Optional guild debug check
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