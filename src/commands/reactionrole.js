// src/commands/reactionrole.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  ChannelType,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create a multi-reaction role message (admin only).')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Title for your reaction role embed')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send this embed to')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('role1')
        .setDescription('Role 1')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('emoji1')
        .setDescription('Emoji for Role 1')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('role2')
        .setDescription('Role 2')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('emoji2')
        .setDescription('Emoji for Role 2')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option.setName('role3')
        .setDescription('Role 3')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('emoji3')
        .setDescription('Emoji for Role 3')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option.setName('role4')
        .setDescription('Role 4')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('emoji4')
        .setDescription('Emoji for Role 4')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: '❌ You need Manage Roles permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const title = interaction.options.getString('title', true);
    const channel = interaction.options.getChannel('channel', true);

    const roleEmojiPairs = [];

    for (let i = 1; i <= 4; i++) {
      const role = interaction.options.getRole(`role${i}`);
      const emoji = interaction.options.getString(`emoji${i}`);

      if (role && emoji) {
        roleEmojiPairs.push({
          roleId: role.id,
          roleName: role.name,
          emoji,
        });
      }
    }

    if (roleEmojiPairs.length === 0) {
      return interaction.reply({
        content: '❌ Please provide at least one valid role-emoji pair.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const draftId = `${interaction.user.id}_${Date.now()}`;

    interaction.client.reactionRoleDrafts ||= new Map();
    interaction.client.reactionRoleDrafts.set(draftId, {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: channel.id,
      title,
      roleEmojiPairs,
    });

    const modal = new ModalBuilder()
      .setCustomId(`reactionRoleModal|${draftId}`)
      .setTitle('Create Reaction Role Message');

    const messageInput = new TextInputBuilder()
      .setCustomId('reactionRoleMessage')
      .setLabel('Reaction role message')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('Write the full multi-line message here...')
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(messageInput)
    );

    await interaction.showModal(modal);
  },
};