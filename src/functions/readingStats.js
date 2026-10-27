// src/functions/readingStats.js
const { EmbedBuilder } = require('discord.js');
const { getTbrCollection, getReadingProgressLogCollection } = require('./mongo');
const { getSessionTotals, getTrackingStartDate, formatDuration } = require('./readingSessions');

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila is UTC+8 (no daylight saving)
const RECENT_REVIEW_COUNT = 5;

// Start of the current month and year in Manila time, as real instants.
function getPeriodStarts(now = new Date()) {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS);
  const year = manila.getUTCFullYear();
  const month = manila.getUTCMonth();

  return {
    monthStart: new Date(Date.UTC(year, month, 1) - MANILA_OFFSET_MS),
    yearStart: new Date(Date.UTC(year, 0, 1) - MANILA_OFFSET_MS),
    monthLabel: new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
    yearLabel: String(year),
  };
}

// Finished books (private ones included in the numbers only).
async function getFinishedTotals(guildId, since) {
  const tbr = await getTbrCollection();
  const finished = await tbr
    .find({ guildId, state: 'finished', finishedAt: { $gte: since.toISOString() } })
    .toArray();

  // Unrated books have rating: null, which Number() would turn into a 0-star rating.
  const ratings = finished
    .filter(entry => entry.rating !== null && entry.rating !== undefined)
    .map(entry => Number(entry.rating))
    .filter(Number.isFinite);
  const pageCounts = finished.map(entry => entry.totalPages ?? entry.book?.totalPages ?? null);

  return {
    booksFinished: finished.length,
    readers: new Set(finished.map(entry => entry.userId)).size,
    pagesInFinished: pageCounts.filter(Number.isFinite).reduce((sum, pages) => sum + pages, 0),
    missingPageCounts: pageCounts.filter(pages => !Number.isFinite(pages)).length,
    averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    ratingCount: ratings.length,
  };
}

async function getPagesTurned(guildId, since) {
  const log = await getReadingProgressLogCollection();
  const [result] = await log
    .aggregate([
      { $match: { guildId, at: { $gte: since } } },
      { $group: { _id: null, pages: { $sum: '$pages' } } },
    ])
    .toArray();

  return result?.pages || 0;
}

async function getPeriodStats(guildId, since) {
  const [finished, pagesTurned, sessions] = await Promise.all([
    getFinishedTotals(guildId, since),
    getPagesTurned(guildId, since),
    getSessionTotals(guildId, since),
  ]);

  return { ...finished, pagesTurned, ...sessions };
}

// Most recent public ratings/reviews. Private books are never shown.
async function getRecentReviews(guildId, limit = RECENT_REVIEW_COUNT) {
  const tbr = await getTbrCollection();
  return tbr
    .find({ guildId, state: 'finished', visibility: 'public', rating: { $ne: null } })
    .sort({ finishedAt: -1 })
    .limit(limit)
    .toArray();
}

async function getTrackingSince(guildId) {
  const log = await getReadingProgressLogCollection();
  const [firstLog] = await log.find({ guildId }).sort({ at: 1 }).limit(1).toArray();
  const firstSession = await getTrackingStartDate(guildId);

  const dates = [firstLog?.at, firstSession].filter(Boolean).map(date => new Date(date));
  return dates.length ? new Date(Math.min(...dates)) : null;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatPeriod(stats) {
  const lines = [
    `📚 **${formatNumber(stats.booksFinished)}** ${stats.booksFinished === 1 ? 'book' : 'books'} finished by **${formatNumber(stats.readers)}** ${stats.readers === 1 ? 'reader' : 'readers'}`,
    `📄 **${formatNumber(stats.pagesTurned)}** pages turned`,
    `📖 **${formatNumber(stats.pagesInFinished)}** pages in finished books` +
      (stats.missingPageCounts ? ` *(${stats.missingPageCounts} without a page count)*` : ''),
    stats.averageRating !== null
      ? `⭐ **${stats.averageRating.toFixed(1)}** average rating *(${stats.ratingCount} ${stats.ratingCount === 1 ? 'rating' : 'ratings'})*`
      : '⭐ No ratings yet',
    `🎧 **${formatDuration(stats.occupiedMs)}** spent reading together *(${stats.sessionCount} ${stats.sessionCount === 1 ? 'session' : 'sessions'})*`,
  ];

  return lines.join('\n');
}

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatReviews(entries) {
  if (!entries.length) return 'No public ratings yet.';

  const text = entries
    .map(entry => {
      const title = entry.book?.title || 'Unknown Title';
      const author = entry.book?.authors?.[0] || 'Unknown Author';
      const header = `⭐ **${entry.rating}/5** · **${truncate(title, 60)}** by ${truncate(author, 40)} · <@${entry.userId}>`;
      return entry.reviewText ? `${header}\n> ${truncate(entry.reviewText.replace(/\s+/g, ' '), 110)}` : header;
    })
    .join('\n');

  return truncate(text, 1024);
}

async function buildStatsEmbed(guildId) {
  const { monthStart, yearStart, monthLabel, yearLabel } = getPeriodStarts();

  const [month, year, reviews, trackingSince] = await Promise.all([
    getPeriodStats(guildId, monthStart),
    getPeriodStats(guildId, yearStart),
    getRecentReviews(guildId),
    getTrackingSince(guildId),
  ]);

  const trackedNote = trackingSince
    ? `Pages turned and reading-session time are tracked since ${trackingSince.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}.`
    : 'Pages turned and reading-session time start counting from the first progress update or reading session.';

  return new EmbedBuilder()
    .setTitle('📊 Café Cloud Reading Stats')
    .setColor(0xA78B6D)
    .setDescription(`Here’s how Café Cloud has been reading~ (as of <t:${Math.floor(Date.now() / 1000)}:F>)`)
    .addFields(
      { name: `🗓️ This Month (${monthLabel})`, value: formatPeriod(month), inline: false },
      { name: `📅 This Year (${yearLabel})`, value: formatPeriod(year), inline: false },
      { name: '📝 Recent Ratings & Reviews', value: formatReviews(reviews), inline: false }
    )
    .setFooter({ text: `Private books count toward the totals but are never shown. ${trackedNote}` })
    .setTimestamp();
}

module.exports = {
  getPeriodStarts,
  getPeriodStats,
  getRecentReviews,
  buildStatsEmbed,
};
