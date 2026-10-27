// src/commands/stats.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdmin } = require('../functions/adminCheck');
const { buildStatsEmbed } = require('../functions/readingStats');
const { sendLog } = require('../functions/discordLogger');

const DMS_CLOSED = 50007; // Discord error: "Cannot send messages to this user"

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Get Café Cloud’s reading stats for this month and year in your DMs (admin only).')
    .setDMPermission(false),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Only admins can view the reading stats.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const embed = await buildStatsEmbed(interaction.guildId);

      try {
        await interaction.user.send({ embeds: [embed] });
        return interaction.editReply({ content: '📬 Sent the reading stats to your DMs!' });
      } catch (error) {
        if (error?.code !== DMS_CLOSED) throw error;

        // DMs are closed: show the stats privately here instead.
        return interaction.editReply({
          content: '📭 I couldn’t DM you (your DMs from server members may be off), so here they are privately instead:',
          embeds: [embed],
        });
      }
    } catch (error) {
      console.error('stats command error:', error);

      await sendLog(interaction.client, {
        title: '❌ Stats Command Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });

      return interaction.editReply({ content: '❌ Something went wrong while building the stats.' }).catch(() => null);
    }
  },
};
