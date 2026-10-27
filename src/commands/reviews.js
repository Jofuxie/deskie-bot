// src/commands/reviews.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getMonthRange, getFinishedInMonth, getPeriodStarts } = require('../functions/readingStats');
const { startReactionPager, PREVIOUS, NEXT } = require('../functions/reactionPager');
const { sendLog } = require('../functions/discordLogger');

const BOOKS_PER_PAGE = 5;
const REVIEW_MAX_LENGTH = 600;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatEntry(entry, number) {
  const title = truncate(entry.book?.title || 'Unknown Title', 80);
  const author = truncate(entry.book?.authors?.[0] || 'Unknown Author', 50);
  const hasRating = entry.rating !== null && entry.rating !== undefined;
  const rating = hasRating ? `⭐ **${entry.rating}/5**` : '⭐ No rating';
  const day = new Date(entry.finishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });

  const lines = [
    `**${number}. ${title}** by ${author}`,
    `${rating} · <@${entry.userId}> · finished ${day}`,
  ];

  if (entry.reviewText) {
    lines.push(`> ${truncate(entry.reviewText.replace(/\s+/g, ' '), REVIEW_MAX_LENGTH)}`);
  }

  return lines.join('\n');
}

function buildPages(entries, label) {
  const ratings = entries
    .filter(entry => entry.rating !== null && entry.rating !== undefined)
    .map(entry => Number(entry.rating))
    .filter(Number.isFinite);
  const average = ratings.length ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1) : null;
  const summary = `📚 **${entries.length}** ${entries.length === 1 ? 'book' : 'books'} finished` +
    (average ? ` · ⭐ **${average}** average` : '');

  const totalPages = Math.ceil(entries.length / BOOKS_PER_PAGE);
  const pages = [];

  for (let i = 0; i < totalPages; i++) {
    const slice = entries.slice(i * BOOKS_PER_PAGE, (i + 1) * BOOKS_PER_PAGE);
    const body = slice.map((entry, index) => formatEntry(entry, i * BOOKS_PER_PAGE + index + 1)).join('\n\n');
    const cover = slice.find(entry => entry.book?.coverUrl)?.book.coverUrl;

    const embed = new EmbedBuilder()
      .setTitle(`📝 Café Cloud Reviews — ${label}`)
      .setColor(0xA78B6D)
      .setDescription(`${summary}\n\n${body}`)
      .setFooter({
        text: totalPages > 1
          ? `Page ${i + 1} of ${totalPages} · React ${PREVIOUS} ${NEXT} to flip pages · Private books are not shown`
          : 'Private books are not shown',
      });

    if (cover) embed.setThumbnail(cover);
    pages.push(embed);
  }

  return pages;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reviews')
    .setDescription('Browse the ratings and reviews of books finished in a given month.')
    .addIntegerOption(option =>
      option
        .setName('month')
        .setDescription('Which month')
        .setRequired(true)
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
    const monthIndex = interaction.options.getInteger('month') - 1;
    const year = interaction.options.getInteger('year') ?? Number(getPeriodStarts().yearLabel);
    const { label } = getMonthRange(year, monthIndex);

    try {
      const entries = await getFinishedInMonth(interaction.guildId, year, monthIndex);

      if (!entries.length) {
        return interaction.reply({
          content: `📭 No public books were finished in **${label}**.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const pages = buildPages(entries, label);

      await interaction.reply({ embeds: [pages[0]], allowedMentions: { parse: [] } });
      const message = await interaction.fetchReply();

      // Anyone in the channel can flip the pages.
      await startReactionPager(message, pages);
    } catch (error) {
      console.error('reviews command error:', error);

      await sendLog(interaction.client, {
        title: '❌ Reviews Command Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });

      const reply = { content: '❌ Something went wrong while loading the reviews.', flags: MessageFlags.Ephemeral };
      return (interaction.replied ? interaction.followUp(reply) : interaction.reply(reply)).catch(() => null);
    }
  },
};
