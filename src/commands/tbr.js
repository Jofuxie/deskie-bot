// src/commands/tbr.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const { getBestBookMatch } = require('../functions/bookData');
const {
  addTbrEntry,
  getUserEntries,
  removeUserEntry,
} = require('../functions/tbrStore');

function buildTbrEntryEmbed(entry, titlePrefix = '📚 TBR Entry') {
  const book = entry.book;

  const embed = new EmbedBuilder()
    .setTitle(`${titlePrefix}: ${book.title}`)
    .setColor(entry.visibility === 'public' ? 0x57F287 : 0xFEE75C)
    .setDescription(book.description || 'No description available.')
    .addFields(
      { name: 'Author(s)', value: book.authors.join(', '), inline: true },
      { name: 'Visibility', value: entry.visibility, inline: true },
      { name: 'Added By', value: `<@${entry.userId}>`, inline: true }
    )
    .setFooter({ text: `Entry ID: ${entry.id}` })
    .setTimestamp(new Date(entry.addedAt));

  if (book.coverUrl) {
    embed.setThumbnail(book.coverUrl);
  }

  if (book.publishedYear) {
    embed.addFields({
      name: 'First Published',
      value: book.publishedYear,
      inline: true,
    });
  }

  if (book.publisher && book.publisher !== 'Unknown') {
    embed.addFields({
      name: 'Publisher',
      value: book.publisher,
      inline: true,
    });
  }

  if (book.ratingsAverage !== null) {
    embed.addFields({
      name: 'Open Library Rating',
      value: `${book.ratingsAverage}/5${book.ratingsCount ? ` (${book.ratingsCount} ratings)` : ''}`,
      inline: true,
    });
  }

  return embed;
}

function buildBookButtons(book) {
  const buttons = [];

  if (book.openLibraryLink) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Open Library')
        .setStyle(ButtonStyle.Link)
        .setURL(book.openLibraryLink)
    );
  }

  if (book.goodreadsLink) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Goodreads Search')
        .setStyle(ButtonStyle.Link)
        .setURL(book.goodreadsLink)
    );
  }

  if (!buttons.length) return [];

  return [new ActionRowBuilder().addComponents(buttons.slice(0, 5))];
}

function buildTbrListEmbed(user, entries, includePrivate) {
  const embed = new EmbedBuilder()
    .setTitle(`📚 ${user.username}'s TBR`)
    .setColor(includePrivate ? 0xFEE75C : 0x57F287)
    .setTimestamp();

  if (!entries.length) {
    embed.setDescription(
      includePrivate
        ? 'No books saved to your TBR yet.'
        : 'No public TBR books found for this user.'
    );
    return embed;
  }

  const lines = entries.slice(0, 10).map((entry, index) => {
    const authorText = entry.book.authors?.join(', ') || 'Unknown Author';
    return `**${index + 1}. ${entry.book.title}**\n` +
      `by ${authorText}\n` +
      `Visibility: \`${entry.visibility}\`\n` +
      `Entry ID: \`${entry.id}\``;
  });

  embed.setDescription(lines.join('\n\n'));

  if (entries.length > 10) {
    embed.setFooter({ text: `Showing 10 of ${entries.length} entries` });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tbr')
    .setDescription('Manage your TBR list.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a book to your TBR.')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Book title, author, or ISBN')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('visibility')
            .setDescription('Choose whether this entry is public or private')
            .setRequired(true)
            .addChoices(
              { name: 'Public', value: 'public' },
              { name: 'Private', value: 'private' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View a TBR list.')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Whose TBR do you want to view?')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove one of your TBR entries by Entry ID.')
        .addStringOption(option =>
          option
            .setName('entry_id')
            .setDescription('The Entry ID shown in /tbr view')
            .setRequired(true)
        )
    )
    .setDMPermission(false),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const query = interaction.options.getString('query', true);
      const visibility = interaction.options.getString('visibility', true);

      await interaction.deferReply({
        flags: visibility === 'private' ? MessageFlags.Ephemeral : undefined,
      });

      try {
        const book = await getBestBookMatch(query);

        if (!book) {
          return interaction.editReply({
            content: '❌ I could not find a matching book to add to your TBR.',
          });
        }

        const entry = addTbrEntry({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          username: interaction.user.username,
          visibility,
          book,
        });

        const embed = buildTbrEntryEmbed(
          entry,
          visibility === 'public'
            ? '📚 Added to Public TBR'
            : '🔒 Added to Private TBR'
        );

        const components = buildBookButtons(book);

        await interaction.editReply({
          content: visibility === 'public'
            ? `✨ ${interaction.user} added a new book to their public TBR!`
            : '✅ Book added to your private TBR.',
          embeds: [embed],
          components,
        });
      } catch (error) {
        console.error('tbr add error:', error);

        await interaction.editReply({
          content: '❌ Something went wrong while adding that book to your TBR.',
        });
      }

      return;
    }

    if (subcommand === 'view') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const isSelf = targetUser.id === interaction.user.id;

      const entries = getUserEntries(
        interaction.guildId,
        targetUser.id,
        { includePrivate: isSelf }
      );

      const embed = buildTbrListEmbed(targetUser, entries, isSelf);

      return interaction.reply({
        embeds: [embed],
        flags: isSelf ? MessageFlags.Ephemeral : undefined,
      });
    }

    if (subcommand === 'remove') {
      const entryId = interaction.options.getString('entry_id', true);

      const removed = removeUserEntry(
        interaction.guildId,
        interaction.user.id,
        entryId
      );

      if (!removed) {
        return interaction.reply({
          content: '❌ I could not find that Entry ID in your TBR.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: `✅ Removed TBR entry \`${entryId}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};