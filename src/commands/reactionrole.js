// src/commands/reactionrole.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create a multi-reaction role message (admin only).')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Title for your reaction role embed')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('message')
        .setDescription('A short description or instruction for users')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send this embed to')
        .setRequired(true)
    )
    // Support multiple role-emoji pairs
    .addRoleOption(option => option.setName('role1').setDescription('Role 1').setRequired(true))
    .addStringOption(option => option.setName('emoji1').setDescription('Emoji for Role 1').setRequired(true))
    .addRoleOption(option => option.setName('role2').setDescription('Role 2').setRequired(false))
    .addStringOption(option => option.setName('emoji2').setDescription('Emoji for Role 2').setRequired(false))
    .addRoleOption(option => option.setName('role3').setDescription('Role 3').setRequired(false))
    .addStringOption(option => option.setName('emoji3').setDescription('Emoji for Role 3').setRequired(false))
    .addRoleOption(option => option.setName('role4').setDescription('Role 4').setRequired(false))
    .addStringOption(option => option.setName('emoji4').setDescription('Emoji for Role 4').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ 
        content: '❌ You need Manage Roles permission to use this command.', 
        ephemeral: true 
      });
    }

    const title = interaction.options.getString('title');
    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel');

    const roleEmojiPairs = [];

    // Get role and emoji pairs
    for (let i = 1; i <= 4; i++) {
      const role = interaction.options.getRole(`role${i}`);
      const emoji = interaction.options.getString(`emoji${i}`);
      if (role && emoji) {
        roleEmojiPairs.push({ role, emoji });
      }
    }

    if (roleEmojiPairs.length === 0) {
      return interaction.reply({ 
        content: '❌ Please provide at least one valid role-emoji pair.', 
        ephemeral: true 
      });
    }

    // Construct embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(message + '\n\n' + roleEmojiPairs.map(pair => `${pair.emoji} : **${pair.role.name}**`).join('\n'))
      .setColor(Colors.Blue)
      .setTimestamp();

    // Send embed message
    let reactionMessage;
    try {
      reactionMessage = await channel.send({ embeds: [embed] });

      // React with provided emojis
      for (const pair of roleEmojiPairs) {
        await reactionMessage.react(pair.emoji);
      }

    } catch (err) {
      console.error('Failed to send embed or add reactions:', err);
      return interaction.reply({ 
        content: '❌ Could not create reaction role message. Check bot permissions and emojis validity.', 
        ephemeral: true 
      });
    }

    // Save mapping
    interaction.client.reactionRoles ||= new Map();
    interaction.client.reactionRoles.set(reactionMessage.id, Object.fromEntries(
      roleEmojiPairs.map(pair => {
        const emojiKey = pair.emoji.id || pair.emoji;
        return [emojiKey, pair.role.id];
      })
    ));

    // Confirm
    await interaction.reply({ 
      content: `✅ Multi-reaction role message created successfully in ${channel}.`, 
      ephemeral: true 
    });
  }
};
