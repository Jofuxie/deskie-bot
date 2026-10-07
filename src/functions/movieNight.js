// src/functions/movieNight.js
const { EmbedBuilder } = require('discord.js');
const { TMDB_ATTRIBUTION, formatMovieLabel } = require('./tmdb');
const {
  ensureMovieNightIndexes,
  getAllOpenRounds,
  getRoundVotes,
  tallyVotes,
  closeRound,
  claimReminder,
  scheduleRoundDeletion,
  deleteRoundData,
} = require('./movieNightStore');
const { sendLog } = require('./discordLogger');

const SINEGANG_CHANNEL_ID = '1494002467468349440';
const BOOK_READER_ROLE_ID = '1485994676812251196'; // pinged when voting opens
const DELETE_AFTER_DAYS = 2;
const REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000; // "last call" one day before voting closes
const MOVIE_COLOR = 0x9B59B6;

const activeTimers = new Map(); // roundId -> { close, reminder }

function toUnix(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatRuntime(minutes) {
  if (!minutes) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

function addMovieFields(embed, movie) {
  embed.addFields(
    { name: 'Genres', value: movie.genres.length ? movie.genres.join(', ') : 'Unknown', inline: true },
    { name: 'Runtime', value: formatRuntime(movie.runtime), inline: true },
    { name: 'Rating', value: movie.rating ? `⭐ ${movie.rating}/10` : 'Not rated yet', inline: true }
  );
}

// Shown when someone votes: small poster thumbnail plus the movie's details.
function buildVoteEmbed(movie, tickets) {
  const embed = new EmbedBuilder()
    .setTitle(`🎬 ${formatMovieLabel(movie)}`)
    .setURL(movie.tmdbUrl)
    .setColor(MOVIE_COLOR)
    .setDescription(truncate(movie.overview, 350) || 'No summary available.')
    .setFooter({ text: `🎟️ ${tickets} ${tickets === 1 ? 'ticket' : 'tickets'} in the roulette • ${TMDB_ATTRIBUTION}` });

  if (movie.posterUrl) embed.setThumbnail(movie.posterUrl);
  addMovieFields(embed, movie);
  return embed;
}

function formatRouletteLines(entries, totalTickets, limit = 15) {
  const lines = entries.slice(0, limit).map((entry, index) => {
    const tickets = `${entry.tickets} ${entry.tickets === 1 ? 'ticket' : 'tickets'}`;
    return `**${index + 1}.** ${formatMovieLabel(entry.movie)} — 🎟️ ${tickets} (${percent(entry.tickets, totalTickets)}%)`;
  });

  if (entries.length > limit) lines.push(`*…and ${entries.length - limit} more*`);
  return lines.join('\n');
}

function buildListEmbed(round, entries) {
  const totalTickets = entries.reduce((sum, entry) => sum + entry.tickets, 0);

  const embed = new EmbedBuilder()
    .setTitle('🎡 Movie Night Roulette')
    .setColor(MOVIE_COLOR)
    .setDescription(
      [
        round.theme ? `**Theme:** ${round.theme}` : null,
        `⏰ Voting closes <t:${toUnix(round.endsAt)}:F> (<t:${toUnix(round.endsAt)}:R>)`,
        '',
        entries.length
          ? formatRouletteLines(entries, totalTickets)
          : 'No votes yet. Be the first with `/movie vote`!',
      ]
        .filter(line => line !== null)
        .join('\n')
    )
    .setFooter({ text: `${totalTickets} ${totalTickets === 1 ? 'vote' : 'votes'} so far • ${TMDB_ATTRIBUTION}` });

  return embed;
}

function buildAnnouncement(round) {
  return [
    `<@&${BOOK_READER_ROLE_ID}>`,
    '🎬 **Movie Night voting is open!**',
    round.theme ? `✨ **Theme:** ${round.theme}` : null,
    `⏰ Voting closes <t:${toUnix(round.endsAt)}:F> (<t:${toUnix(round.endsAt)}:R>)`,
    '',
    '**🗳️ How to vote**',
    '1️⃣ Type `/movie vote` in any channel',
    '2️⃣ Start typing the movie’s title in the `title` box',
    '3️⃣ Pick the right movie from the list that pops up (check the year!)',
    '4️⃣ Press Enter, and Deskie will post your vote with the movie’s poster 🎬',
    '',
    '**📌 Good to know**',
    '🎟️ **1 vote per person.** Changed your mind? Just use `/movie vote` again and your vote moves over',
    '🙋 Want the same movie someone else picked? Movies already in the roulette show up first in the list with a 🎟️',
    '🎡 Every vote is a ticket in the roulette, so movies with more votes have better chances of being picked',
    '📋 See what’s in the running anytime with `/movie list`',
    '',
    'Happy voting, and see you at movie night! 🍿',
  ]
    .filter(line => line !== null)
    .join('\n');
}

async function getSinegangChannel(client) {
  const channel = await client.channels.fetch(SINEGANG_CHANNEL_ID).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    throw new Error(`Invalid or inaccessible #sinegang channel: ${SINEGANG_CHANNEL_ID}`);
  }

  return channel;
}

async function postAnnouncement(client, round) {
  const channel = await getSinegangChannel(client);
  await channel.send({ content: buildAnnouncement(round), allowedMentions: { roles: [BOOK_READER_ROLE_ID] } });
}

// Each ticket is equally likely, so a movie with 3 votes has 3x the chance of one with 1.
function pickWeightedWinner(entries) {
  const totalTickets = entries.reduce((sum, entry) => sum + entry.tickets, 0);
  let ticket = Math.random() * totalTickets;

  for (const entry of entries) {
    ticket -= entry.tickets;
    if (ticket < 0) return entry;
  }

  return entries[entries.length - 1];
}

function buildWinnerEmbed(round, winner, entries) {
  const totalTickets = entries.reduce((sum, entry) => sum + entry.tickets, 0);
  const movie = winner.movie;

  const embed = new EmbedBuilder()
    .setTitle(`🍿 ${formatMovieLabel(movie)}`)
    .setURL(movie.tmdbUrl)
    .setColor(MOVIE_COLOR)
    .setDescription(truncate(movie.overview, 1000) || 'No summary available.')
    .setFooter({ text: TMDB_ATTRIBUTION })
    .setTimestamp();

  if (movie.posterUrl) embed.setImage(movie.posterUrl);
  addMovieFields(embed, movie);

  embed.addFields(
    {
      name: '🎟️ Odds',
      value: `${winner.tickets} of ${totalTickets} ${totalTickets === 1 ? 'ticket' : 'tickets'} (${percent(winner.tickets, totalTickets)}% chance)`,
      inline: true,
    },
    {
      name: '🙋 Voted by',
      value: truncate(winner.voterIds.map(id => `<@${id}>`).join(' '), 1024),
      inline: true,
    },
    {
      name: '🎡 The full roulette',
      value: truncate(formatRouletteLines(entries, totalTickets), 1024),
      inline: false,
    }
  );

  return embed;
}

function clearRoundTimers(roundId) {
  const timers = activeTimers.get(roundId);
  if (!timers) return;

  clearTimeout(timers.close);
  clearTimeout(timers.reminder);
  activeTimers.delete(roundId);
}

async function sendReminder(client, round) {
  try {
    const claimed = await claimReminder(round.id);
    if (!claimed) return;

    const entries = tallyVotes(await getRoundVotes(round.id));
    const totalTickets = entries.reduce((sum, entry) => sum + entry.tickets, 0);
    const channel = await getSinegangChannel(client);

    await channel.send({
      content: [
        `⏰ **Last call for Movie Night votes!** Voting closes <t:${toUnix(round.endsAt)}:R>.`,
        round.theme ? `✨ **Theme:** ${round.theme}` : null,
        '',
        entries.length
          ? `**The roulette so far:**\n${formatRouletteLines(entries, totalTickets, 10)}`
          : 'No votes yet! Be the first with `/movie vote` 🍿',
        '',
        'Haven’t voted yet? Use `/movie vote` before it closes~',
      ]
        .filter(line => line !== null)
        .join('\n'),
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error('[Movie Night] Failed to send reminder:', error);

    await sendLog(client, {
      title: '❌ Movie Night Reminder Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  }
}

// Closes the round, spins the roulette, posts the winner in #sinegang,
// and schedules the round's data for deletion two days later.
async function finishRound(client, roundId, source = 'scheduled') {
  clearRoundTimers(roundId);

  // Close first so no new votes can sneak in while the roulette spins.
  const round = await closeRound(roundId, { status: 'closed' });
  if (!round) return { status: 'already_closed' };

  const votes = await getRoundVotes(roundId);
  const entries = tallyVotes(votes);
  const winner = entries.length ? pickWeightedWinner(entries) : null;

  const expireAt = new Date(Date.now() + DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  await scheduleRoundDeletion(roundId, expireAt);

  const channel = await getSinegangChannel(client);

  if (!winner) {
    await channel.send({
      content: '🎬 Movie Night voting has closed, but nobody voted this time, so there’s no pick. Maybe next round! 🍿',
      allowedMentions: { parse: [] },
    });
  } else {
    await channel.send({
      content: [
        '🎡 **The Movie Night roulette has spoken!**',
        round.theme ? `✨ **Theme:** ${round.theme}` : null,
        `Our next movie is **${formatMovieLabel(winner.movie)}**! 🍿`,
      ]
        .filter(line => line !== null)
        .join('\n'),
      embeds: [buildWinnerEmbed(round, winner, entries)],
      allowedMentions: { users: winner.voterIds },
    });
  }

  await sendLog(client, {
    title: '🎬 Movie Night Closed',
    color: 0x57F287,
    description: winner
      ? `Picked **${formatMovieLabel(winner.movie)}** (${winner.tickets}/${votes.length} tickets) via \`${source}\`.`
      : `Closed with no votes via \`${source}\`.`,
  });

  return { status: winner ? 'picked' : 'no_votes', winner, entries };
}

async function cancelRound(client, roundId) {
  clearRoundTimers(roundId);

  const round = await closeRound(roundId, { status: 'cancelled' });
  if (!round) return { status: 'already_closed' };

  await deleteRoundData(roundId);

  const channel = await getSinegangChannel(client);
  await channel.send({
    content: '🎬 This round of Movie Night voting was cancelled. Stay tuned for the next one! 🍿',
    allowedMentions: { parse: [] },
  });

  return { status: 'cancelled' };
}

async function runFinish(client, roundId) {
  try {
    await finishRound(client, roundId, 'scheduled');
  } catch (error) {
    console.error('[Movie Night] Failed to finish round:', error);

    await sendLog(client, {
      title: '❌ Movie Night Close Error',
      color: 0xED4245,
      description: `\`\`\`${error?.stack || error}\`\`\``,
    });
  }
}

// Sets the close timer (and "last call" reminder) for an open round.
// Voting lasts at most 7 days, well within setTimeout's ~24.8-day limit.
function scheduleRoundTimers(client, round) {
  clearRoundTimers(round.id);

  const now = Date.now();
  const endsAt = new Date(round.endsAt).getTime();
  const startedAt = new Date(round.startedAt).getTime();
  const timers = {};

  timers.close = setTimeout(() => runFinish(client, round.id), Math.max(endsAt - now, 0));

  // Only rounds longer than a day get a reminder; if Deskie was offline when
  // it was due, send it late as long as voting is still open for an hour+.
  if (!round.reminderSent && endsAt - startedAt > REMINDER_BEFORE_MS) {
    const untilReminder = endsAt - REMINDER_BEFORE_MS - now;

    if (untilReminder > 0) {
      timers.reminder = setTimeout(() => sendReminder(client, round), untilReminder);
    } else if (endsAt - now > 60 * 60 * 1000) {
      sendReminder(client, round);
    }
  }

  activeTimers.set(round.id, timers);
}

async function startMovieNightScheduler(client) {
  await ensureMovieNightIndexes();

  const openRounds = await getAllOpenRounds();
  for (const round of openRounds) {
    scheduleRoundTimers(client, round);
  }

  console.log(`[Movie Night] Scheduler started, ${openRounds.length} open round(s) recovered.`);
}

module.exports = {
  SINEGANG_CHANNEL_ID,
  DELETE_AFTER_DAYS,
  buildVoteEmbed,
  buildListEmbed,
  postAnnouncement,
  pickWeightedWinner,
  finishRound,
  cancelRound,
  scheduleRoundTimers,
  startMovieNightScheduler,
};
