// src/functions/readingSessions.js
// Tracks book reading sessions in the Reading Book Nook voice channel without
// joining it: Discord tells Deskie whenever someone joins or leaves.
// "Hours reading together" = the time during a session that the channel had
// at least one reader in it (not each person's time added up).
const { getReadingSessionsCollection } = require('./mongo');
const { sendLog } = require('./discordLogger');

const READING_VC_ID = '1485991365686067453';
const HEARTBEAT_MS = 5 * 60 * 1000;
const AUTO_END_EMPTY_MS = 60 * 60 * 1000; // a session left empty for an hour ends itself
const KEEP_DAYS = 400; // sessions only need to cover the current year's stats

let heartbeat = null;
let queue = Promise.resolve();

// Voice events can arrive in bursts; handling them one at a time keeps the
// session's running total consistent.
function serialize(task) {
  const run = queue.then(task);
  queue = run.catch(error => console.error('[Reading Sessions] Update failed:', error));
  return run;
}

async function ensureIndexes() {
  const sessions = await getReadingSessionsCollection();
  await sessions.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
}

async function getActiveSession(guildId) {
  const sessions = await getReadingSessionsCollection();
  return sessions.findOne({ guildId, status: 'active' });
}

async function getReadersInChannel(client) {
  const channel = await client.channels.fetch(READING_VC_ID).catch(() => null);
  if (!channel || !channel.isVoiceBased()) return null;
  return channel.members.filter(member => !member.user.bot);
}

// Time counted so far, including the stretch happening right now.
function getOccupiedMs(session, now = Date.now()) {
  const current = session.occupiedSince ? now - new Date(session.occupiedSince).getTime() : 0;
  return (session.occupiedMs || 0) + Math.max(current, 0);
}

// Opens or closes the current "readers are here" stretch based on who's in the channel.
function occupancyChanges(session, readerCount, now) {
  if (readerCount > 0 && !session.occupiedSince) {
    return { occupiedSince: now, emptySince: null };
  }

  if (readerCount === 0 && session.occupiedSince) {
    return {
      occupiedMs: getOccupiedMs(session, now.getTime()),
      occupiedSince: null,
      emptySince: now,
    };
  }

  return {};
}

function closedSessionFields(session, endedAt) {
  return {
    status: 'ended',
    endedAt,
    occupiedMs: getOccupiedMs(session, endedAt.getTime()),
    occupiedSince: null,
    expireAt: new Date(endedAt.getTime() + KEEP_DAYS * 24 * 60 * 60 * 1000),
  };
}

function summarize(session, now = Date.now()) {
  const endedAt = session.endedAt ? new Date(session.endedAt).getTime() : now;

  return {
    startedAt: session.startedAt,
    durationMs: endedAt - new Date(session.startedAt).getTime(),
    occupiedMs: getOccupiedMs(session, endedAt),
    readerCount: (session.participantIds || []).length,
  };
}

function startSession(client, { guildId, startedBy }) {
  return serialize(async () => {
    if (await getActiveSession(guildId)) return { status: 'already_active' };

    const readers = await getReadersInChannel(client);
    if (!readers) return { status: 'no_channel' };

    const now = new Date();
    const session = {
      id: `session_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      guildId,
      channelId: READING_VC_ID,
      status: 'active',
      startedBy,
      startedAt: now,
      occupiedMs: 0,
      occupiedSince: readers.size ? now : null,
      emptySince: readers.size ? null : now,
      lastCheckedAt: now,
      participantIds: [...readers.keys()],
    };

    const sessions = await getReadingSessionsCollection();
    await sessions.insertOne(session);
    return { status: 'started', session, readersNow: readers.size };
  });
}

function endSession(guildId) {
  return serialize(async () => {
    const session = await getActiveSession(guildId);
    if (!session) return { status: 'no_session' };

    const sessions = await getReadingSessionsCollection();
    const fields = closedSessionFields(session, new Date());
    await sessions.updateOne({ id: session.id, status: 'active' }, { $set: fields });

    return { status: 'ended', summary: summarize({ ...session, ...fields }) };
  });
}

async function getSessionStatus(guildId) {
  const session = await getActiveSession(guildId);
  return session ? { status: 'active', summary: summarize(session) } : { status: 'no_session' };
}

// Called for every voice update; only the Reading Book Nook matters.
function handleVoiceStateUpdate(oldState, newState) {
  if (oldState.channelId !== READING_VC_ID && newState.channelId !== READING_VC_ID) return null;
  if (oldState.channelId === newState.channelId) return null; // mute/deafen etc.

  return serialize(async () => {
    const session = await getActiveSession(newState.guild.id);
    if (!session) return;

    const readers = await getReadersInChannel(newState.client);
    if (!readers) return;

    const now = new Date();
    const update = { $set: { ...occupancyChanges(session, readers.size, now), lastCheckedAt: now } };

    const joiner = newState.member;
    if (newState.channelId === READING_VC_ID && joiner && !joiner.user.bot) {
      update.$addToSet = { participantIds: joiner.id };
    }

    const sessions = await getReadingSessionsCollection();
    await sessions.updateOne({ id: session.id, status: 'active' }, update);
  });
}

// Every few minutes: catch anything a missed event left behind, keep a
// "last seen" time for restart recovery, and auto-end long-empty sessions.
function runHeartbeat(client) {
  return serialize(async () => {
    const sessions = await getReadingSessionsCollection();
    const active = await sessions.find({ status: 'active' }).toArray();

    for (const session of active) {
      const readers = await getReadersInChannel(client);
      if (!readers) continue;

      const now = new Date();
      const changes = occupancyChanges(session, readers.size, now);
      const emptySince = 'emptySince' in changes ? changes.emptySince : session.emptySince;

      if (readers.size === 0 && emptySince && now - new Date(emptySince) >= AUTO_END_EMPTY_MS) {
        const merged = { ...session, ...changes };
        const fields = closedSessionFields(merged, new Date(emptySince));
        await sessions.updateOne({ id: session.id, status: 'active' }, { $set: fields });

        const summary = summarize({ ...merged, ...fields });
        await sendLog(client, {
          title: '📖 Reading Session Auto-Ended',
          color: 0x5865F2,
          description: `The Reading Book Nook was empty for an hour, so the session ended on its own. Time with readers: **${formatDuration(summary.occupiedMs)}**, ${summary.readerCount} reader(s).`,
        });
        continue;
      }

      const update = { $set: { ...changes, lastCheckedAt: now } };
      if (readers.size) update.$addToSet = { participantIds: { $each: [...readers.keys()] } };
      await sessions.updateOne({ id: session.id, status: 'active' }, update);
    }
  });
}

// After a restart: if the channel emptied while Deskie was offline, count the
// time only up to when Deskie last saw readers there.
function recoverActiveSessions(client) {
  return serialize(async () => {
    const sessions = await getReadingSessionsCollection();
    const active = await sessions.find({ status: 'active' }).toArray();

    for (const session of active) {
      const readers = await getReadersInChannel(client);
      if (!readers) continue;

      const now = new Date();
      let changes = {};

      if (session.occupiedSince && readers.size === 0) {
        const lastSeen = new Date(session.lastCheckedAt || session.occupiedSince);
        changes = {
          occupiedMs: getOccupiedMs(session, lastSeen.getTime()),
          occupiedSince: null,
          emptySince: lastSeen,
        };
      } else {
        changes = occupancyChanges(session, readers.size, now);
      }

      const update = { $set: { ...changes, lastCheckedAt: now } };
      if (readers.size) update.$addToSet = { participantIds: { $each: [...readers.keys()] } };
      await sessions.updateOne({ id: session.id, status: 'active' }, update);
    }

    return active.length;
  });
}

async function startReadingSessionTracker(client) {
  await ensureIndexes();
  const recovered = await recoverActiveSessions(client);

  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => runHeartbeat(client), HEARTBEAT_MS);

  console.log(`[Reading Sessions] Tracker started, ${recovered} active session(s) recovered.`);
}

// Total "hours reading together" for sessions that started on/after `since`.
async function getSessionTotals(guildId, since) {
  const sessions = await getReadingSessionsCollection();
  const found = await sessions.find({ guildId, startedAt: { $gte: since } }).toArray();
  const now = Date.now();

  return {
    sessionCount: found.length,
    occupiedMs: found.reduce((sum, session) => sum + summarize(session, now).occupiedMs, 0),
  };
}

async function getTrackingStartDate(guildId) {
  const sessions = await getReadingSessionsCollection();
  const [first] = await sessions.find({ guildId }).sort({ startedAt: 1 }).limit(1).toArray();
  return first?.startedAt || null;
}

function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

module.exports = {
  READING_VC_ID,
  AUTO_END_EMPTY_MS,
  startSession,
  endSession,
  getSessionStatus,
  handleVoiceStateUpdate,
  runHeartbeat,
  recoverActiveSessions,
  startReadingSessionTracker,
  getSessionTotals,
  getTrackingStartDate,
  formatDuration,
};
