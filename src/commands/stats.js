// src/commands/stats.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdmin } = require('../functions/adminCheck');
const { buildStatsEmbed } = require('../functions/readingStats');
const { sendLog } = require('../functions/discordLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('See Café Cloud’s reading stats for this month and year, privately (admin only).')
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
      return interaction.editReply({ embeds: [embed] });
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
