// src/commands/reading.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const {
  startReadingEntry,
  getUserReadingEntries,
  updateReadingProgress,
  finishReadingEntry,
} = require('../functions/tbrStore');
const { sendLog } = require('../functions/discordLogger');

function buildProgressBar(currentPage, totalPages, size = 10) {
  if (!totalPages || totalPages <= 0) {
    return [
      '🧸 Reading Progress ~',
      '⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ --%',
      `Page ${currentPage ?? 0} / Unknown`,
    ].join('\n');
  }

  const safeCurrent = Math.max(0, Math.min(currentPage ?? 0, totalPages));
  const percent = Math.round((safeCurrent / totalPages) * 100);
  const filled = Math.round((safeCurrent / totalPages) * size);
  const empty = size - filled;

  return [
    '🧸 Reading Progress ~',
    `${'🟫'.repeat(filled)}${'⬜'.repeat(empty)} ${percent}%`,
    `Page ${safeCurrent} / ${totalPages}`,
  ].join('\n');
}

function buildStars(rating) {
  const safeRating = Math.max(1, Math.min(5, Number(rating) || 1));
  return '⭐'.repeat(safeRating);
}

function buildReadingEntryText(entry, index) {
  const authors = entry.book?.authors?.join(', ') || 'Unknown Author';
  const title = entry.book?.title || 'Unknown Title';
  const progressBar = buildProgressBar(entry.currentPage ?? 0, entry.totalPages);

  return [
    `**${index}. ${title}**\nby ${authors}`,
    progressBar,
  ].join('\n');
}

function buildReadingViewEmbed(user, entries, isSelf) {
  const embed = new EmbedBuilder()
    .setTitle(`📚 ${user.username}'s Current Reads`)
    .setColor(0xA78B6D)
    .setTimestamp();

  if (!entries.length) {
    embed.setDescription('No active reads found for this user.'
    );
    return embed;
  }

  embed.setDescription(
    entries
      .slice(0, 3)
      .map((entry, index) => buildReadingEntryText(entry, index + 1))
      .join('\n\n')
  );

  embed.setFooter({ text: `${entries.length} / 3 active reads` });
  return embed;
}

function buildStartedEmbed(entry) {
  const authors = entry.book?.authors?.join(', ') || 'Unknown Author';

  return new EmbedBuilder()
    .setTitle(`📖 Started Reading: ${entry.book?.title || 'Unknown Title'}`)
    .setColor(0xA78B6D)
    .setDescription(`by ${authors}`)
    .addFields({
      name: 'Progress',
      value: buildProgressBar(entry.currentPage ?? 0, entry.totalPages),
      inline: false,
    })
    .setThumbnail(entry.book?.coverUrl || null)
    .setTimestamp();
}

function buildProgressUpdatedEmbed(entry) {
  const authors = entry.book?.authors?.join(', ') || 'Unknown Author';

  return new EmbedBuilder()
    .setTitle(`📘 Progress Updated: ${entry.book?.title || 'Unknown Title'}`)
    .setColor(0xA78B6D)
    .setDescription(`by ${authors}`)
    .addFields({
      name: 'Progress',
      value: buildProgressBar(entry.currentPage ?? 0, entry.totalPages),
      inline: false,
    })
    .setThumbnail(entry.book?.coverUrl || null)
    .setTimestamp();
}

function buildFinishedEmbed(entry) {
  const authors = entry.book?.authors?.join(', ') || 'Unknown Author';

  return new EmbedBuilder()
    .setTitle(`🎉 Finished: ${entry.book?.title || 'Unknown Title'}`)
    .setColor(0x57F287)
    .setDescription(`by ${authors}`)
    .addFields(
      {
        name: 'Rating',
        value: buildStars(entry.rating),
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
    .setThumbnail(entry.book?.coverUrl || null)
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reading')
    .setDescription('Manage your current reads.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Move a book from your TBR to your current reads.')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Book title from your TBR')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current reads.')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Whose current reads do you want to view?')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('progress')
        .setDescription('Update progress on one of your current reads.')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Book title from your current reads')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('page')
            .setDescription('Current page number')
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('finish')
        .setDescription('Mark one of your current reads as finished.')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Book title from your current reads')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('rating')
            .setDescription('Your rating from 1 to 5')
            .setRequired(true)
            .addChoices(
              { name: '⭐ 1', value: 1 },
              { name: '⭐⭐ 2', value: 2 },
              { name: '⭐⭐⭐ 3', value: 3 },
              { name: '⭐⭐⭐⭐ 4', value: 4 },
              { name: '⭐⭐⭐⭐⭐ 5', value: 5 }
            )
        )
    )
    .setDMPermission(false),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
      const query = interaction.options.getString('query', true);

      try {
        const result = await startReadingEntry(
          interaction.guildId,
          interaction.user.id,
          query
        );

        if (result.status === 'not_found') {
          return interaction.reply({
            content: '❌ I could not find that book in your TBR.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'multiple_matches') {
          const matchList = result.matches
            .slice(0, 10)
            .map((entry, index) => `**${index + 1}.** ${entry.book.title} by ${entry.book.authors?.join(', ') || 'Unknown Author'}`)
            .join('\n');

          return interaction.reply({
            content:
              `⚠️ I found multiple TBR matches for \`${query}\`.\nPlease be more specific:\n\n${matchList}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'limit_reached') {
          return interaction.reply({
            content: '⚠️ You already have 3 active reads. Finish one before starting another.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return interaction.reply({
          embeds: [buildStartedEmbed(result.entry)],
          flags: result.entry.visibility === 'private' ? MessageFlags.Ephemeral : undefined,
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Reading Start Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.reply({
          content: '❌ Something went wrong while starting that book.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }

    if (subcommand === 'view') {
      const targetUser = interaction.options.getUser('user') || interaction.user;

      try {
        const entries = await getUserReadingEntries(
          interaction.guildId,
          targetUser.id,
          { includePrivate: false }
        );

        return interaction.reply({
          embeds: [buildReadingViewEmbed(targetUser, entries, isSelf)],
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Reading View Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.reply({
          content: '❌ Something went wrong while loading current reads.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }

    if (subcommand === 'progress') {
      const query = interaction.options.getString('query', true);
      const page = interaction.options.getInteger('page', true);

      try {
        const result = await updateReadingProgress(
          interaction.guildId,
          interaction.user.id,
          query,
          page
        );

        if (result.status === 'not_found') {
          return interaction.reply({
            content: '❌ I could not find that book in your current reads.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'multiple_matches') {
          const matchList = result.matches
            .slice(0, 10)
            .map((entry, index) => `**${index + 1}.** ${entry.book.title} by ${entry.book.authors?.join(', ') || 'Unknown Author'}`)
            .join('\n');

          return interaction.reply({
            content:
              `⚠️ I found multiple current-read matches for \`${query}\`.\nPlease be more specific:\n\n${matchList}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'invalid_page') {
          return interaction.reply({
            content: '❌ That page number is invalid.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'page_exceeds_total') {
          return interaction.reply({
            content: `❌ That page number is higher than the known total pages (${result.totalPages}).`,
            flags: MessageFlags.Ephemeral,
          });
        }

        return interaction.reply({
          embeds: [buildProgressUpdatedEmbed(result.entry)],
          flags: result.entry.visibility === 'private' ? MessageFlags.Ephemeral : undefined,
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Reading Progress Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.reply({
          content: '❌ Something went wrong while updating progress.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }

    if (subcommand === 'finish') {
      const query = interaction.options.getString('query', true);
      const rating = interaction.options.getInteger('rating', true);

      try {
        const result = await finishReadingEntry(
          interaction.guildId,
          interaction.user.id,
          query,
          rating
        );

        if (result.status === 'not_found') {
          return interaction.reply({
            content: '❌ I could not find that book in your current reads.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'multiple_matches') {
          const matchList = result.matches
            .slice(0, 10)
            .map((entry, index) => `**${index + 1}.** ${entry.book.title} by ${entry.book.authors?.join(', ') || 'Unknown Author'}`)
            .join('\n');

          return interaction.reply({
            content:
              `⚠️ I found multiple current-read matches for \`${query}\`.\nPlease be more specific:\n\n${matchList}`,
            flags: MessageFlags.Ephemeral,
          });
        }

        if (result.status === 'invalid_rating') {
          return interaction.reply({
            content: '❌ Rating must be between 1 and 5.',
            flags: MessageFlags.Ephemeral,
          });
        }

        return interaction.reply({
          embeds: [buildFinishedEmbed(result.entry)],
          flags: result.entry.visibility === 'private' ? MessageFlags.Ephemeral : undefined,
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Reading Finish Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.reply({
          content: '❌ Something went wrong while finishing that book.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }
  },
};