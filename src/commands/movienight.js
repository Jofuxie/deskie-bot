// src/commands/movienight.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const { isTmdbConfigured, formatMovieLabel } = require('../functions/tmdb');
const { getOpenRound, createRound } = require('../functions/movieNightStore');
const {
  SINEGANG_CHANNEL_ID,
  DELETE_AFTER_DAYS,
  postAnnouncement,
  finishRound,
  cancelRound,
  scheduleRoundTimers,
} = require('../functions/movieNight');
const { sendLog } = require('../functions/discordLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('movienight')
    .setDescription('Run Movie Night voting (admin only).')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Open Movie Night voting and announce it in #sinegang.')
        .addIntegerOption(option =>
          option
            .setName('days')
            .setDescription('How many days voting stays open (default 7)')
            .setMinValue(1)
            .setMaxValue(7)
        )
        .addStringOption(option =>
          option
            .setName('theme')
            .setDescription('Optional theme, e.g. "Spooky October 🎃"')
            .setMaxLength(100)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('end')
        .setDescription('Close voting now and spin the roulette.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel the current vote without picking a movie.')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const openRound = await getOpenRound(interaction.guildId);

      if (subcommand === 'start') {
        if (!isTmdbConfigured()) {
          return interaction.editReply({
            content: '❌ Add `TMDB_API_KEY` to Deskie’s environment variables first, otherwise nobody can search for movies to vote on.',
          });
        }

        if (openRound) {
          return interaction.editReply({
            content: `⚠️ A Movie Night vote is already open until <t:${Math.floor(new Date(openRound.endsAt).getTime() / 1000)}:F>. Use \`/movienight end\` or \`/movienight cancel\` first.`,
          });
        }

        const days = interaction.options.getInteger('days') ?? 7;
        const theme = interaction.options.getString('theme')?.trim() || null;

        const round = await createRound({
          guildId: interaction.guildId,
          theme,
          startedBy: interaction.user.id,
          endsAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        });

        scheduleRoundTimers(interaction.client, round);
        await postAnnouncement(interaction.client, round);

        await sendLog(interaction.client, {
          title: '🎬 Movie Night Started',
          color: 0x9B59B6,
          description: `${interaction.user.tag} opened voting for ${days} day(s)${theme ? ` with the theme "${theme}"` : ''}.`,
        });

        return interaction.editReply({
          content: `✅ Movie Night voting is open for **${days}** day(s) and announced in <#${SINEGANG_CHANNEL_ID}>.`,
        });
      }

      if (!openRound) {
        return interaction.editReply({ content: 'ℹ️ There’s no Movie Night vote open right now.' });
      }

      if (subcommand === 'end') {
        const result = await finishRound(interaction.client, openRound.id, 'manual');

        if (result.status === 'already_closed') {
          return interaction.editReply({ content: 'ℹ️ That vote was already closed.' });
        }

        return interaction.editReply({
          content: result.status === 'picked'
            ? `✅ Voting closed! The roulette picked **${formatMovieLabel(result.winner.movie)}**, posted in <#${SINEGANG_CHANNEL_ID}>. This round’s data will be deleted in ${DELETE_AFTER_DAYS} days.`
            : `✅ Voting closed. Nobody voted, so there’s no pick this time.`,
        });
      }

      if (subcommand === 'cancel') {
        const result = await cancelRound(interaction.client, openRound.id);

        return interaction.editReply({
          content: result.status === 'cancelled'
            ? '✅ Voting cancelled and this round’s votes were deleted.'
            : 'ℹ️ That vote was already closed.',
        });
      }
    } catch (error) {
      console.error('movienight command error:', error);

      await sendLog(interaction.client, {
        title: '❌ Movie Night Command Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });

      return interaction.editReply({ content: '❌ Something went wrong with Movie Night.' }).catch(() => null);
    }
  },
};
