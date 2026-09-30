// src/functions/channelLinks.js
const { ChannelType } = require('discord.js');

// Lowercase and drop emojis/symbols, so "👋hey-there" and "hey-there" compare equal.
function normalizeChannelName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/^[-_]+|[-_]+$/g, '');
}

// A "#" at the start of the text or after a space/bracket/quote/markdown mark
// (so URL fragments like page#section are left alone), optionally followed by
// emojis, then the channel name itself.
const CHANNEL_NAME_PATTERN =
  /(?<=^|[\s(\[{*_~"'“‘])#([\p{Extended_Pictographic}️‍]*[\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

// Inline code and code blocks are left as typed.
const CODE_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/;

function findChannelByName(guild, typedName) {
  const target = normalizeChannelName(typedName);
  if (!target) return null;

  const matches = [...guild.channels.cache.values()].filter(
    channel =>
      channel.type !== ChannelType.GuildCategory &&
      normalizeChannelName(channel.name) === target
  );

  if (matches.length <= 1) return matches[0] || null;

  // Several channels share the name (e.g. a text and a voice channel):
  // prefer the single text-based one, otherwise it's ambiguous.
  const textMatches = matches.filter(channel => channel.isTextBased());
  return textMatches.length === 1 ? textMatches[0] : null;
}

// Turns typed "#channel-name" references into real clickable <#id> mentions.
function linkChannelNames(text, guild) {
  const linked = new Set();
  const unresolved = new Set();

  if (!text || !guild) {
    return { text, linked: [], unresolved: [] };
  }

  const result = text
    .split(CODE_PATTERN)
    .map((segment, index) => {
      if (index % 2 === 1) return segment; // code segment

      return segment.replace(CHANNEL_NAME_PATTERN, (match, typedName) => {
        const channel = findChannelByName(guild, typedName);

        if (!channel) {
          unresolved.add(`#${typedName}`);
          return match;
        }

        linked.add(`#${channel.name}`);
        return `<#${channel.id}>`;
      });
    })
    .join('');

  return {
    text: result,
    linked: [...linked],
    unresolved: [...unresolved],
  };
}

// Short note for the admin's ephemeral confirmation, e.g. to catch typos.
function describeChannelLinks({ linked, unresolved }) {
  const notes = [];
  if (linked.length) notes.push(`🔗 Linked: ${linked.join(', ')}`);
  if (unresolved.length) notes.push(`⚠️ No channel found for: ${unresolved.join(', ')} (left as plain text)`);
  return notes.length ? `\n${notes.join('\n')}` : '';
}

module.exports = {
  linkChannelNames,
  describeChannelLinks,
};
