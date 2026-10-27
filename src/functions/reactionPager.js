// src/functions/reactionPager.js
const { PermissionFlagsBits } = require('discord.js');

const PREVIOUS = '⬅️';
const NEXT = '➡️';
const IDLE_MS = 3 * 60 * 1000; // stop listening after 3 minutes without a flip

// Lets one person flip through embed pages by reacting ⬅️ / ➡️ on a message.
// If Deskie can't remove reactions (no Manage Messages), un-reacting also
// flips the page, so the person never has to wait or switch emojis.
async function startReactionPager(message, pages, { userId }) {
  if (pages.length <= 1) return;

  const me = message.guild?.members.me;
  const canManage = Boolean(me && message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages));

  try {
    await message.react(PREVIOUS);
    await message.react(NEXT);
  } catch (error) {
    console.error('Reaction pager: could not add reactions:', error);
    return;
  }

  let page = 0;

  const collector = message.createReactionCollector({
    filter: (reaction, user) => user.id === userId && [PREVIOUS, NEXT].includes(reaction.emoji.name),
    idle: IDLE_MS,
    dispose: !canManage,
  });

  const flip = async reaction => {
    page = reaction.emoji.name === NEXT
      ? (page + 1) % pages.length
      : (page - 1 + pages.length) % pages.length;

    await message.edit({ embeds: [pages[page]] }).catch(() => null);
  };

  collector.on('collect', async (reaction, user) => {
    await flip(reaction);
    if (canManage) await reaction.users.remove(user.id).catch(() => null);
  });

  collector.on('remove', flip);

  collector.on('end', async () => {
    if (canManage) {
      await message.reactions.removeAll().catch(() => null);
      return;
    }

    for (const emoji of [PREVIOUS, NEXT]) {
      await message.reactions.cache.get(emoji)?.users.remove(message.client.user.id).catch(() => null);
    }
  });
}

module.exports = { startReactionPager, PREVIOUS, NEXT };
