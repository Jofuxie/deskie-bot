// src/commands/stats.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdmin } = require('../functions/adminCheck');
const { buildStatsEmbed, resolveStatsPeriod } = require('../functions/readingStats');
const { sendLog } = require('../functions/discordLogger');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('See Café Cloud’s reading stats for a month and year, privately (admin only).')
    .addIntegerOption(option =>
      option
        .setName('month')
        .setDescription('Which month (defaults to this month)')
        .addChoices(...MONTHS.map((name, index) => ({ name, value: index + 1 })))
    )
    .addIntegerOption(option =>
      option
        .setName('year')
        .setDescription('Which year (defaults to this year)')
        .setMinValue(2020)
        .setMaxValue(2100)
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Only admins can view the reading stats.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const month = interaction.options.getInteger('month');
    const period = {
      year: interaction.options.getInteger('year'),
      monthIndex: month ? month - 1 : null,
    };

    const { notStarted, monthRange, yearRange } = resolveStatsPeriod(period);
    if (notStarted) {
      return interaction.reply({
        content: `📭 **${(monthRange || yearRange).label}** hasn’t started yet, so there are no stats to show.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const embed = await buildStatsEmbed(interaction.guildId, period);
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
