// src/events/messageReactionRemove.js
const { Events } = require('discord.js');
module.exports = {
  name: Events.MessageReactionRemove,
  async execute(reaction, user) {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) {
      try { await reaction.fetch(); } catch (err) { return console.error('Failed to fetch reaction:', err); }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch (err) { return console.error('Failed to fetch message:', err); }
    }

    const guild = reaction.message.guild;
    const messageId = reaction.message.id;
    const emoji = reaction.emoji.id || reaction.emoji.name;
    const rrMap = reaction.message.client.reactionRoles;
    if (!rrMap || !rrMap.has(messageId)) return;
    const roleMappings = rrMap.get(messageId);
    const roleId = roleMappings[emoji];
    if (!roleId) return;

    // Remove the role from the user
    try {
      const member = await guild.members.fetch(user.id);
      await member.roles.remove(roleId);
      console.log(`Removed role ${roleId} from user ${user.tag} after reaction removal`);
    } catch (err) {
      console.error(`Failed to remove role on reaction removal:`, err);
    }
  }
};
