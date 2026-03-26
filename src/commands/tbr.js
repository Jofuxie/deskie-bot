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
  removeUserEntryByTitle,
} = require('../functions/tbrStore');
const { sendLog } = require('../functions/discordLogger');

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

function formatEntryLine(entry, index) {
  const authorText = entry.book.authors?.join(', ') || 'Unknown Author';
  const published = entry.book.publishedYear ? ` (${entry.book.publishedYear})` : '';
  return `**${index}. ${entry.book.title}**${published}\nby ${authorText}`;
}

function buildOwnTbrEmbed(user, entries) {
  const embed = new EmbedBuilder()
    .setTitle(`📚 ${user.username}'s TBR`)
    .setColor(0xFEE75C)
    .setTimestamp();

  const publicEntries = entries.filter(entry => entry.visibility === 'public');
  const privateEntries = entries.filter(entry => entry.visibility === 'private');

  if (!publicEntries.length && !privateEntries.length) {
    embed.setDescription('No books saved to your TBR yet.');
    return embed;
  }

  embed.addFields(
    {
      name: '🌍 Public',
      value: publicEntries.length
        ? publicEntries.slice(0, 10).map((entry, index) => formatEntryLine(entry, index + 1)).join('\n\n')
        : 'No public books yet.',
      inline: false,
    },
    {
      name: '🔒 Private',
      value: privateEntries.length
        ? privateEntries.slice(0, 10).map((entry, index) => formatEntryLine(entry, index + 1)).join('\n\n')
        : 'No private books yet.',
      inline: false,
    }
  );

  return embed;
}

function buildOtherUserTbrEmbed(user, entries) {
  const embed = new EmbedBuilder()
    .setTitle(`📚 ${user.username}'s Public TBR`)
    .setColor(0x57F287)
    .setTimestamp();

  if (!entries.length) {
    embed.setDescription('No public TBR books found for this user.');
    return embed;
  }

  embed.setDescription(
    entries.slice(0, 15).map((entry, index) => formatEntryLine(entry, index + 1)).join('\n\n')
  );

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
            .setDescription('Book title, author, or both')
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
        .setDescription('Remove one of your TBR books by title.')
        .addStringOption(option =>
          option
            .setName('query')
            .setDescription('Type the title of the book you want to remove')
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

        const entry = await addTbrEntry({
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
        await sendLog(interaction.client, {
          title: '❌ TBR Add Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        await interaction.editReply({
          content: '❌ Something went wrong while adding that book to your TBR.',
        });
      }

      return;
    }

    if (subcommand === 'view') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const isSelf = targetUser.id === interaction.user.id;

      const entries = await getUserEntries(
        interaction.guildId,
        targetUser.id,
        { includePrivate: isSelf }
      );

      const embed = isSelf
        ? buildOwnTbrEmbed(targetUser, entries)
        : buildOtherUserTbrEmbed(targetUser, entries);

      return interaction.reply({
        embeds: [embed],
        flags: isSelf ? MessageFlags.Ephemeral : undefined,
      });
    }

    if (subcommand === 'remove') {
      const query = interaction.options.getString('query', true);

      const result = await removeUserEntryByTitle(
        interaction.guildId,
        interaction.user.id,
        query
      );

      if (result.status === 'not_found') {
        return interaction.reply({
          content: '❌ I could not find a matching book in your TBR.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (result.status === 'multiple_matches') {
        const matchList = result.matches
          .slice(0, 10)
          .map((entry, index) => `**${index + 1}.** ${entry.book.title} by ${entry.book.authors?.join(', ') || 'Unknown Author'}`)
          .join('\n');

        return interaction.reply({
          content: `⚠️ I found multiple matches for \`${query}\` in your TBR.\nPlease be more specific:\n\n${matchList}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: `✅ Removed **${result.entry.book.title}** from your TBR.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
};