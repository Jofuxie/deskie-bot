// src/events/messageReactionAdd.js
const { Events } = require('discord.js');
module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    // Ignore bot's own reactions or reactions in DMs
    if (user.bot || !reaction.message.guild) return;

    // Fetch partials if needed
    if (reaction.partial) {
      try { await reaction.fetch(); } catch (err) { return console.error('Failed to fetch reaction:', err); }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch (err) { return console.error('Failed to fetch message:', err); }
    }

    const guild = reaction.message.guild;
    const messageId = reaction.message.id;
    const emoji = reaction.emoji.id || reaction.emoji.name;  // use ID for custom, name for default

    // Check if this message is one of the stored reaction-role messages
    const rrMap = reaction.message.client.reactionRoles;
    if (!rrMap || !rrMap.has(messageId)) return;  // no reaction-role mapping for this message

    const roleMappings = rrMap.get(messageId);
    const roleId = roleMappings[emoji];
    if (!roleId) return;  // emoji not part of this reaction-role message

    // Give the role to the user
    try {
      const member = await guild.members.fetch(user.id);
      await member.roles.add(roleId);
      console.log(`Gave role ${roleId} to user ${user.tag} for reacting with ${emoji}`);
    } catch (err) {
      console.error(`Failed to add role on reaction:`, err);
    }
  }
};
