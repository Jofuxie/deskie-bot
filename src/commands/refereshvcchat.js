// src/commands/refreshvcchat.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const VC_CHAT_CHANNEL_ID = '1485991365686067453';

const STARTER_MESSAGE =
  '🌿 **VC side chat refreshed.**\n' +
  'A fresh space for today’s reading session, coworking, or side chatter.\n' +
  'Feel free to drop your thoughts here again hehe. ☕📚';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refreshvcchat')
    .setDescription('Manually refresh the VC side chat (admin only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = await interaction.client.channels.fetch(VC_CHAT_CHANNEL_ID).catch(() => null);

    if (!channel) {
      return interaction.editReply({
        content: `❌ Could not find VC side chat channel: ${VC_CHAT_CHANNEL_ID}`,
      });
    }

    if (!channel.isTextBased()) {
      return interaction.editReply({
        content: '❌ That channel is not text-based, so I cannot refresh it.',
      });
    }

    if (!channel.messages || typeof channel.messages.fetch !== 'function') {
      return interaction.editReply({
        content: '❌ That channel does not support message history fetching in the expected way.',
      });
    }

    let totalDeletedCount = 0;

    try {
      while (true) {
        const fetched = await channel.messages.fetch({ limit: 100 });

        const toDelete = fetched.filter(
          (msg) => !msg.author.bot && !msg.pinned
        );

        if (toDelete.size === 0) break;

        const now = Date.now();
        const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

        const within14Days = toDelete.filter(
          (msg) => now - msg.createdTimestamp < fourteenDaysMs
        );

        const olderThan14Days = toDelete.filter(
          (msg) => now - msg.createdTimestamp >= fourteenDaysMs
        );

        if (within14Days.size > 0) {
          try {
            await channel.bulkDelete(within14Days, true);
            totalDeletedCount += within14Days.size;
          } catch (error) {
            console.error('[refreshvcchat] bulkDelete failed:', error);
          }
        }

        for (const [, msg] of olderThan14Days) {
          try {
            await msg.delete();
            totalDeletedCount++;
          } catch (error) {
            console.error('[refreshvcchat] single delete failed:', error);
          }
        }

        if (fetched.size < 100) break;
      }

      await channel.send(STARTER_MESSAGE);

      return interaction.editReply({
        content:
          `✅ VC side chat refreshed successfully.\n` +
          `Deleted **${totalDeletedCount}** user message(s) and posted a fresh starter message.`,
      });
    } catch (error) {
      console.error('[refreshvcchat] refresh failed:', error);

      return interaction.editReply({
        content: '❌ Failed to refresh the VC side chat. Check bot permissions and channel access.',
      });
    }
  },
};