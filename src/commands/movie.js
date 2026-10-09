// src/commands/movie.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isTmdbConfigured, resolveMovie, formatMovieLabel } = require('../functions/tmdb');
const { getOpenRound, castVote, getRoundVotes, tallyVotes } = require('../functions/movieNightStore');
const { SINEGANG_CHANNEL_ID, buildVoteEmbed, buildListEmbed } = require('../functions/movieNight');
const { checkCooldown } = require('../functions/cooldown');
const { sendLog } = require('../functions/discordLogger');

const NO_OPEN_ROUND = '🎬 There’s no Movie Night vote open right now. An admin can start one with `/movienight start`.';

// Votes are kept to #sinegang (or a thread inside it) so other channels stay calm.
function isInSinegang(interaction) {
  return interaction.channelId === SINEGANG_CHANNEL_ID
    || interaction.channel?.parentId === SINEGANG_CHANNEL_ID;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('movie')
    .setDescription('Vote for the next Movie Night pick.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('vote')
        .setDescription('Vote for a movie in #sinegang (1 vote per person, you can change it anytime).')
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Start typing a movie title and pick it from the list')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('See the movies in the roulette and their chances.')
    )
    .setDMPermission(false),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const round = await getOpenRound(interaction.guildId);

      if (!round) {
        return interaction.reply({ content: NO_OPEN_ROUND, flags: MessageFlags.Ephemeral });
      }

      const entries = tallyVotes(await getRoundVotes(round.id));

      // Public in #sinegang; private everywhere else so it doesn't clutter other channels.
      return interaction.reply({
        embeds: [buildListEmbed(round, entries)],
        flags: isInSinegang(interaction) ? undefined : MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'vote') {
      if (!isInSinegang(interaction)) {
        return interaction.reply({
          content: `🎬 Movie Night votes go in <#${SINEGANG_CHANNEL_ID}> so other channels stay cozy and calm. Head over there and use \`/movie vote\` again~`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!isTmdbConfigured()) {
        return interaction.reply({
          content: '❌ Movie search isn’t set up yet (missing `TMDB_API_KEY`). Please let an admin know!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const round = await getOpenRound(interaction.guildId);

      if (!round) {
        return interaction.reply({ content: NO_OPEN_ROUND, flags: MessageFlags.Ephemeral });
      }

      // Checked after the round so a refused attempt doesn't start the cooldown.
      const remaining = checkCooldown('movievote', interaction.user.id, 10);

      if (remaining > 0) {
        return interaction.reply({
          content: `⏳ Please wait ${remaining}s before voting again.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const movie = await resolveMovie(interaction.options.getString('title', true));

        if (!movie) {
          return interaction.editReply({
            content: '❌ I couldn’t find that movie. Try typing the title and picking it from the suggestions.',
          });
        }

        const previous = await castVote({
          round,
          userId: interaction.user.id,
          username: interaction.user.username,
          movie,
        });

        if (previous?.tmdbId === movie.tmdbId) {
          return interaction.editReply({
            content: `🎟️ You’ve already voted for **${formatMovieLabel(movie)}**!`,
          });
        }

        const entries = tallyVotes(await getRoundVotes(round.id));
        const tickets = entries.find(entry => entry.tmdbId === movie.tmdbId)?.tickets ?? 1;

        // Sent as a normal channel message: after an ephemeral deferReply, Discord turns
        // the first followUp into that private reply instead of a new public message.
        const channel = interaction.channel
          ?? await interaction.client.channels.fetch(interaction.channelId);

        await channel.send({
          content: previous
            ? `🔄 ${interaction.user} changed their vote from **${formatMovieLabel(previous.movie)}** to **${formatMovieLabel(movie)}**!`
            : `🎬 ${interaction.user} voted for **${formatMovieLabel(movie)}**!`,
          embeds: [buildVoteEmbed(movie, tickets)],
          allowedMentions: { parse: [] },
        });

        return interaction.editReply({
          content: previous
            ? '✅ Your vote has been changed.'
            : '✅ Your vote is in! You can change it anytime with `/movie vote`.',
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Movie Vote Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.editReply({
          content: '❌ Something went wrong while saving your vote.',
        }).catch(() => null);
      }
    }
  },
};
