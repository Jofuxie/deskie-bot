const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { getBestBookMatch } = require('../functions/bookData');
const {
  logFinishedBook,
  updateFinishedReviewByTitle,
} = require('../functions/tbrStore');
const { sendLog } = require('../functions/discordLogger');

function buildRatingDisplay(rating) {
  const numeric = Number(rating) || 0;
  const fullStars = Math.floor(numeric);
  const starText = '⭐'.repeat(Math.max(0, fullStars));
  return `${starText || '⭐'} · **${numeric}/5**`;
}

function buildFinishedEmbed(entry, titlePrefix = '🎉 Finished') {
  const authors = entry.book?.authors?.join(', ') || 'Unknown Author';

  const embed = new EmbedBuilder()
    .setTitle(`${titlePrefix}: ${entry.book?.title || 'Unknown Title'}`)
    .setColor(0x57F287)
    .setDescription(`by ${authors}`)
    .addFields(
      {
        name: 'Rating',
        value: entry.rating ? buildRatingDisplay(entry.rating) : 'No rating yet',
        inline: true,
      },
      {
        name: 'Completed',
        value: entry.finishedAt
          ? `<t:${Math.floor(new Date(entry.finishedAt).getTime() / 1000)}:D>`
          : 'Unknown',
        inline: true,
      }
    )
    .setTimestamp();

  if (entry.book?.coverUrl) {
    embed.setThumbnail(entry.book.coverUrl);
  }

  if (entry.reviewText) {
    embed.addFields({
      name: 'Review',
      value: entry.reviewText,
      inline: false,
    });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bookreview')
    .setDescription('Log or edit finished-book reviews.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('complete')
        .setDescription('Mark a book as finished and log your rating.')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Book title you want to log as finished')
            .setRequired(true)
        )
        .addNumberOption(option =>
          option
            .setName('rating')
            .setDescription('Your rating from 0.5 to 5.0')
            .setRequired(true)
            .addChoices(
              { name: '⭐ 0.5', value: 0.5 },
              { name: '⭐ 1', value: 1 },
              { name: '⭐ 1.5', value: 1.5 },
              { name: '⭐⭐ 2', value: 2 },
              { name: '⭐⭐ 2.5', value: 2.5 },
              { name: '⭐⭐⭐ 3', value: 3 },
              { name: '⭐⭐⭐ 3.5', value: 3.5 },
              { name: '⭐⭐⭐⭐ 4', value: 4 },
              { name: '⭐⭐⭐⭐ 4.5', value: 4.5 },
              { name: '⭐⭐⭐⭐⭐ 5', value: 5 }
            )
        )
        .addStringOption(option =>
          option
            .setName('date')
            .setDescription('Optional completion date in MM-DD-YYYY format')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('review')
            .setDescription('Optional short review')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit your finished-book rating, date, or short review.')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Finished book title to edit')
            .setRequired(true)
        )
        .addNumberOption(option =>
          option
            .setName('rating')
            .setDescription('New rating from 0.5 to 5.0')
            .setRequired(false)
            .addChoices(
              { name: '⭐ 0.5', value: 0.5 },
              { name: '⭐ 1', value: 1 },
              { name: '⭐ 1.5', value: 1.5 },
              { name: '⭐⭐ 2', value: 2 },
              { name: '⭐⭐ 2.5', value: 2.5 },
              { name: '⭐⭐⭐ 3', value: 3 },
              { name: '⭐⭐⭐ 3.5', value: 3.5 },
              { name: '⭐⭐⭐⭐ 4', value: 4 },
              { name: '⭐⭐⭐⭐ 4.5', value: 4.5 },
              { name: '⭐⭐⭐⭐⭐ 5', value: 5 }
            )
        )
        .addStringOption(option =>
          option
            .setName('date')
            .setDescription('Optional new completion date in MM-DD-YYYY format')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('review')
            .setDescription('Optional new short review')
            .setRequired(false)
        )
    )
    .setDMPermission(false),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'complete') {
      const query = interaction.options.getString('query', true);
      const rating = interaction.options.getNumber('rating', true);
      const date = interaction.options.getString('date');
      const review = interaction.options.getString('review');

      await interaction.deferReply();

      try {
        let result = await logFinishedBook({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          username: interaction.user.username,
          query,
          rating,
          visibility: 'public',
          finishedDateInput: date,
          reviewText: review,
        });

        if (result.status === 'not_found') {
          const book = await getBestBookMatch(query);

          if (!book) {
            return interaction.editReply({
              content: '❌ I could not find a matching book to log as finished.',
            });
          }

          result = await logFinishedBook({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            username: interaction.user.username,
            query,
            rating,
            visibility: 'public',
            book,
            finishedDateInput: date,
            reviewText: review,
          });
        }

        if (result.status === 'multiple_matches') {
          const matchList = result.matches
            .slice(0, 10)
            .map((entry, index) => `**${index + 1}.** ${entry.book.title} by ${entry.book.authors?.join(', ') || 'Unknown Author'}`)
            .join('\n');

          return interaction.editReply({
            content: `⚠️ I found multiple matching books for \`${query}\`.\nPlease be more specific:\n\n${matchList}`,
          });
        }

        if (result.status === 'invalid_rating') {
          return interaction.editReply({
            content: '❌ Rating must be from 0.5 to 5 in 0.5 steps.',
          });
        }

        if (result.status === 'invalid_finished_date') {
          return interaction.editReply({
            content: '❌ Please use a valid date in `MM-DD-YYYY` format.',
          });
        }

        if (result.status === 'already_finished') {
          return interaction.editReply({
            content: `⚠️ **${result.entry.book.title}** is already in your finished books. Use \`/bookreview edit\` if you want to change the rating or review.`,
          });
        }

        return interaction.editReply({
          embeds: [buildFinishedEmbed(result.entry)],
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Book Review Complete Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.editReply({
          content: '❌ Something went wrong while completing that book review.',
        }).catch(() => null);
      }
    }

    if (subcommand === 'edit') {
      const query = interaction.options.getString('query', true);
      const rating = interaction.options.getNumber('rating');
      const date = interaction.options.getString('date');
      const review = interaction.options.getString('review');

      if (rating === null && !date && review === null) {
        return interaction.reply({
          content: '❌ Please provide at least one thing to edit: rating, date, or review.',
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        const result = await updateFinishedReviewByTitle(
          interaction.guildId,
          interaction.user.id,
          query,
          {
            rating: rating === null ? undefined : rating,
            finishedDateInput: date || null,
            reviewText: review === null ? undefined : review,
          }
        );

        if (result.status === 'not_found') {
          return interaction.reply({
            content: '❌ I could not find that book in your finished books.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'multiple_matches') {
          const matchList = result.matches
            .slice(0, 10)
            .map((entry, index) => `**${index + 1}.** ${entry.book.title} by ${entry.book.authors?.join(', ') || 'Unknown Author'}`)
            .join('\n');

          return interaction.reply({
            content: `⚠️ I found multiple finished-book matches for \`${query}\`.\nPlease be more specific:\n\n${matchList}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'invalid_rating') {
          return interaction.reply({
            content: '❌ Rating must be from 0.5 to 5 in 0.5 steps.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'invalid_finished_date') {
          return interaction.reply({
            content: '❌ Please use a valid date in `MM-DD-YYYY` format.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'no_changes') {
          return interaction.reply({
            content: 'ℹ️ Nothing changed for that finished book.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return interaction.reply({
          embeds: [buildFinishedEmbed(result.entry, '📝 Updated Review')],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Book Review Edit Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.reply({
          content: '❌ Something went wrong while editing that book review.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }
  },
};
