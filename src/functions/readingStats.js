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

// Start and end of a given calendar month in Manila time (monthIndex is 0-11).
function getMonthRange(year, monthIndex) {
  return {
    start: new Date(Date.UTC(year, monthIndex, 1) - MANILA_OFFSET_MS),
    end: new Date(Date.UTC(year, monthIndex + 1, 1) - MANILA_OFFSET_MS),
    label: new Date(Date.UTC(year, monthIndex, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

// Public books finished in a given month, oldest first. Private books are never shown.
async function getFinishedInMonth(guildId, year, monthIndex) {
  const { start, end } = getMonthRange(year, monthIndex);
  const tbr = await getTbrCollection();
  return tbr
    .find({
      guildId,
      state: 'finished',
      visibility: 'public',
      finishedAt: { $gte: start.toISOString(), $lt: end.toISOString() },
    })
    .sort({ finishedAt: 1 })
    .toArray();
}

// Start and end of a calendar year in Manila time.
function getYearRange(year) {
  return {
    start: new Date(Date.UTC(year, 0, 1) - MANILA_OFFSET_MS),
    end: new Date(Date.UTC(year + 1, 0, 1) - MANILA_OFFSET_MS),
    label: String(year),
  };
}

// Builds a Mongo range filter; `until` is optional (open-ended up to now).
function dateRange(since, until, toValue = date => date) {
  return until ? { $gte: toValue(since), $lt: toValue(until) } : { $gte: toValue(since) };
}

const toIso = date => date.toISOString();

// Finished books (private ones included in the numbers only).
async function getFinishedTotals(guildId, since, until = null) {
  const tbr = await getTbrCollection();
  const finished = await tbr
    .find({ guildId, state: 'finished', finishedAt: dateRange(since, until, toIso) })
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

async function getPagesTurned(guildId, since, until = null) {
  const log = await getReadingProgressLogCollection();
  const [result] = await log
    .aggregate([
      { $match: { guildId, at: dateRange(since, until) } },
      { $group: { _id: null, pages: { $sum: '$pages' } } },
    ])
    .toArray();

  return result?.pages || 0;
}

async function getPeriodStats(guildId, since, until = null) {
  const [finished, pagesTurned, sessions] = await Promise.all([
    getFinishedTotals(guildId, since, until),
    getPagesTurned(guildId, since, until),
    getSessionTotals(guildId, since, until),
  ]);

  return { ...finished, pagesTurned, ...sessions };
}

// Most recent public ratings/reviews within a period. Private books are never shown.
async function getRecentReviews(guildId, { since, until = null }, limit = RECENT_REVIEW_COUNT) {
  const tbr = await getTbrCollection();
  return tbr
    .find({
      guildId,
      state: 'finished',
      visibility: 'public',
      rating: { $ne: null },
      finishedAt: dateRange(since, until, toIso),
    })
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

function getCurrentManilaMonth(now = new Date()) {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS);
  return { year: manila.getUTCFullYear(), monthIndex: manila.getUTCMonth() };
}

// Works out which month/year sections /stats shows.
//  - nothing given: the current month and the current year
//  - month (with or without year): that month, plus that whole year
//  - year only: just that year
function resolveStatsPeriod({ year = null, monthIndex = null } = {}, now = new Date()) {
  const current = getCurrentManilaMonth(now);
  const onlyYear = year !== null && monthIndex === null;
  const targetYear = year ?? current.year;
  const targetMonth = onlyYear ? null : (monthIndex ?? current.monthIndex);

  const yearRange = getYearRange(targetYear);
  const monthRange = targetMonth === null ? null : getMonthRange(targetYear, targetMonth);
  const isCurrentYear = targetYear === current.year;
  const isCurrentMonth = isCurrentYear && targetMonth === current.monthIndex;
  const notStarted = (monthRange || yearRange).start > now;

  return { yearRange, monthRange, isCurrentYear, isCurrentMonth, notStarted };
}

async function buildStatsEmbed(guildId, period = {}) {
  const { yearRange, monthRange, isCurrentYear, isCurrentMonth } = resolveStatsPeriod(period);
  // The newest section decides which reviews are shown.
  const reviewRange = monthRange || yearRange;

  const [month, year, reviews, trackingSince] = await Promise.all([
    monthRange ? getPeriodStats(guildId, monthRange.start, monthRange.end) : null,
    getPeriodStats(guildId, yearRange.start, yearRange.end),
    getRecentReviews(guildId, { since: reviewRange.start, until: reviewRange.end }),
    getTrackingSince(guildId),
  ]);

  const fields = [];

  if (month) {
    fields.push({
      name: isCurrentMonth ? `🗓️ This Month (${monthRange.label})` : `🗓️ ${monthRange.label}`,
      value: formatPeriod(month),
      inline: false,
    });
  }

  fields.push(
    {
      name: isCurrentYear ? `📅 This Year (${yearRange.label})` : `📅 ${yearRange.label}`,
      value: formatPeriod(year),
      inline: false,
    },
    {
      name: `📝 Recent Ratings & Reviews (${reviewRange.label})`,
      value: formatReviews(reviews),
      inline: false,
    }
  );

  const description = isCurrentMonth || (!monthRange && isCurrentYear)
    ? `Here’s how Café Cloud has been reading~ (as of <t:${Math.floor(Date.now() / 1000)}:F>)`
    : `Here’s how Café Cloud read in **${reviewRange.label}**~ Use \`/reviews\` to see every review from a month.`;

  const trackedNote = trackingSince
    ? `Pages turned and reading-session time are tracked since ${trackingSince.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}.`
    : 'Pages turned and reading-session time start counting from the first progress update or reading session.';

  return new EmbedBuilder()
    .setTitle('📊 Café Cloud Reading Stats')
    .setColor(0xA78B6D)
    .setDescription(description)
    .addFields(fields)
    .setFooter({ text: `Private books count toward the totals but are never shown. ${trackedNote}` })
    .setTimestamp();
}

module.exports = {
  getPeriodStarts,
  getMonthRange,
  getYearRange,
  resolveStatsPeriod,
  getFinishedInMonth,
  getPeriodStats,
  getRecentReviews,
  buildStatsEmbed,
};
