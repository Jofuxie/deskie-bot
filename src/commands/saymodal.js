// src/commands/saymodal.js
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('saymodal')
    .setDescription('Send a multi-line message via a modal (admin only).')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send the message (defaults to current)')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    // get channel so we know where to post
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    // build the modal
    const modal = new ModalBuilder()
      .setCustomId(`sayModal|${channel.id}`) 
      .setTitle('Say something (multi-line)!');

    // create a big text area
    const textInput = new TextInputBuilder()
      .setCustomId('sayModalInput')
      .setLabel('Enter your message:')
      .setStyle(TextInputStyle.Paragraph) // multi-line
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(textInput);
    modal.addComponents(row);

    await interaction.showModal(modal); 
  }
};
