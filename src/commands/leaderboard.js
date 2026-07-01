// src/commands/leaderboard.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getGuildLeaderboard } = require('../functions/tbrStore');
const { sendLog } = require('../functions/discordLogger');

const MEDALS = ['🥇', '🥈', '🥉'];

const PERIOD_LABELS = {
  all: 'All-Time',
  year: 'This Year',
  month: 'This Month',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('See who has finished the most public books in this server.')
    .addStringOption(option =>
      option
        .setName('period')
        .setDescription('Time range for the leaderboard')
        .addChoices(
          { name: 'All-time', value: 'all' },
          { name: 'This year', value: 'year' },
          { name: 'This month', value: 'month' }
        )
    )
    .setDMPermission(false),

  async execute(interaction) {
    const period = interaction.options.getString('period') || 'all';

    try {
      const rows = await getGuildLeaderboard(interaction.guildId, { period });

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Reading Leaderboard — ${PERIOD_LABELS[period]}`)
        .setColor(0xF1C40F)
        .setTimestamp();

      if (!rows.length) {
        embed.setDescription(
          'No finished public books to rank yet. Log one with `/bookreview complete`!'
        );
      } else {
        embed.setDescription(
          rows
            .map((row, index) => {
              const medal = MEDALS[index] || `**${index + 1}.**`;
              const books = row.count === 1 ? 'book' : 'books';
              return `${medal} <@${row.userId}> — **${row.count}** ${books} finished`;
            })
            .join('\n')
        );
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await sendLog(interaction.client, {
        title: '❌ Leaderboard Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });

      await interaction.reply({
        content: '❌ Something went wrong while building the leaderboard.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }
  },
};
