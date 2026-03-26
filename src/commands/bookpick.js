// src/commands/bookpick.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { getRandomPublicEntry } = require('../functions/tbrStore');

function buildButtons(book) {
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bookpick')
    .setDescription('Pick a random book from the server’s public TBR entries.')
    .setDMPermission(false),

  async execute(interaction) {
    const entry = await getRandomPublicEntry(interaction.guildId);

    if (!entry) {
      return interaction.reply({
        content: '❌ There are no public TBR entries in this server yet.',
      });
    }

    const book = entry.book;

    const embed = new EmbedBuilder()
      .setTitle(`🎲 Random Book Pick: ${book.title}`)
      .setColor(0x57F287)
      .setDescription(book.description || 'No description available.')
      .addFields(
        { name: 'Author(s)', value: book.authors.join(', '), inline: true },
        { name: 'Added By', value: `<@${entry.userId}>`, inline: true },
        { name: 'First Published', value: book.publishedYear || 'Unknown', inline: true }
      )
      .setTimestamp();

    if (book.coverUrl) {
      embed.setThumbnail(book.coverUrl);
    }

    const components = buildButtons(book);

    await interaction.reply({
      content: '📖 Deskie picked a random book from the public TBR shelf!',
      embeds: [embed],
      components,
    });
  },
};