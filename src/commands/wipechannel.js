// src/commands/wipechannel.js
const {
    SlashCommandBuilder,
    PermissionFlagsBits
  } = require('discord.js');
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('wipechannel')
      .setDescription('Wipe user messages in channel 1356160694130573332, then announce in 1356134887014535188.')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)  // Admin only
      .setDMPermission(false),  // Guild only
  
    async execute(interaction) {
      // Hardcoded channel IDs
      const TARGET_CHANNEL_ID = '1356160694130573332';
      const ANNOUNCEMENT_CHANNEL_ID = '1356134887014535188';
  
      // Let user know we received the command (ephemeral)
      await interaction.deferReply({ ephemeral: true });
  
      // Grab the channels
      const targetChannel = interaction.client.channels.cache.get(TARGET_CHANNEL_ID);
      const announcementChannel = interaction.client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
  
      if (!targetChannel) {
        return interaction.editReply({ content: `❌ Could not find target channel ${TARGET_CHANNEL_ID}`, ephemeral: true });
      }
      if (!announcementChannel) {
        return interaction.editReply({ content: `❌ Could not find announcement channel ${ANNOUNCEMENT_CHANNEL_ID}`, ephemeral: true });
      }
  
      let totalDeletedCount = 0;
  
      // 1) Wipe user messages (ignore pinned + bot)
      try {
        while (true) {
          // Fetch up to 100 messages
          const fetched = await targetChannel.messages.fetch({ limit: 100 });
          // Filter out pinned + bot
          const toDelete = fetched.filter(m => !m.author.bot && !m.pinned);
          if (toDelete.size === 0) break;
  
          // 14-day cutoff for bulkDelete
          const now = Date.now();
          const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
          const within14Days = toDelete.filter(m => now - m.createdTimestamp < twoWeeksMs);
          const olderThan14Days = toDelete.filter(m => now - m.createdTimestamp >= twoWeeksMs);
  
          // Bulk delete for < 14 days
          if (within14Days.size > 0) {
            try {
              await targetChannel.bulkDelete(within14Days, true);
              totalDeletedCount += within14Days.size;
            } catch (err) {
              console.error('Bulk delete error:', err);
            }
          }
  
          // Single-delete older
          for (const [id, msg] of olderThan14Days) {
            try {
              await msg.delete();
              totalDeletedCount++;
            } catch (err) {
              console.error('Single delete error:', err);
            }
          }
  
          // If fewer than 100 fetched, likely done
          if (fetched.size < 100) break;
        }
      } catch (err) {
        console.error('Error wiping channel:', err);
        return interaction.editReply({
          content: '❌ Failed to wipe the channel (check permissions?).',
          ephemeral: true
        });
      }
  
      // 2) Post a mention in announcement channel
      let announcementMessage;
      try {
        announcementMessage = await announcementChannel.send({
          content: `@everyone 🌸 Cozy Corner has been gently refreshed for the week. New week, new space.\nWhatever you’re feeling — you’re safe to let it out here`,
          allowedMentions: { parse: ['everyone'] }
        });
      } catch (err) {
        console.error('Announcement send error:', err);
        return interaction.editReply({
          content: `✅ Wiped the channel, but **failed** to post announcement.`,
          ephemeral: true
        });
      }
  
      // 3) Delete announcement after 8 hours
      const eightHoursMs = 8 * 60 * 60 * 1000;
      setTimeout(async () => {
        try {
          await announcementMessage.delete();
          console.log('Deleted announcement after 8 hours.');
        } catch (delErr) {
          console.error('Failed to delete announcement message:', delErr);
        }
      }, eightHoursMs);
  
      // 4) Finish with ephemeral success
      await interaction.editReply({
        content: `✅ **Channel <#${TARGET_CHANNEL_ID}> wiped successfully!**\nDeleted ${totalDeletedCount} messages.`,
        ephemeral: true
      });
    }
  };
  