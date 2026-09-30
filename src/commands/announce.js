// src/commands/announce.js
const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    PermissionFlagsBits,
    ChannelType,
  } = require('discord.js');
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('announce')
      .setDescription('Create a multi-line announcement via a modal (admin only).')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Channel to send the announcement to')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('everyone')
          .setDescription('Mention @everyone')
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('here')
          .setDescription('Mention @here')
          .setRequired(false)
      )
      .addRoleOption(option =>
        option
          .setName('role1')
          .setDescription('First role to mention')
          .setRequired(false)
      )
      .addRoleOption(option =>
        option
          .setName('role2')
          .setDescription('Second role to mention')
          .setRequired(false)
      )
      .addRoleOption(option =>
        option
          .setName('role3')
          .setDescription('Third role to mention')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('style')
          .setDescription('How the announcement looks (default: embed)')
          .setRequired(false)
          .addChoices(
            { name: 'Embed (boxed card)', value: 'embed' },
            { name: 'Plain text (normal message)', value: 'plain' }
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false),
  
    async execute(interaction) {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const pingEveryone = interaction.options.getBoolean('everyone') || false;
      const pingHere = interaction.options.getBoolean('here') || false;
  
      const role1 = interaction.options.getRole('role1');
      const role2 = interaction.options.getRole('role2');
      const role3 = interaction.options.getRole('role3');
  
      const roleIds = [role1, role2, role3]
        .filter(Boolean)
        .map(role => role.id);

      const isPlain = interaction.options.getString('style') === 'plain';

      // Kept to single characters: custom IDs max out at 100 characters.
      const modal = new ModalBuilder()
        .setCustomId(
          `announceModal|${channel.id}|${pingEveryone ? '1' : '0'}|${pingHere ? '1' : '0'}|${isPlain ? 'p' : 'e'}|${roleIds.join(',')}`
        )
        .setTitle(isPlain ? 'Create Announcement (Plain Text)' : 'Create Announcement');

      // Plain messages cap at 2000 characters total (mentions + title + body);
      // embeds allow a 256-character title and a 4096-character body.
      const titleInput = new TextInputBuilder()
        .setCustomId('announceTitle')
        .setLabel('Announcement title')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(isPlain ? 100 : 256);

      const messageInput = new TextInputBuilder()
        .setCustomId('announceMessage')
        .setLabel('Announcement message')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(isPlain ? 1800 : 4000);
  
      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(messageInput)
      );
  
      await interaction.showModal(modal);
    },
  };