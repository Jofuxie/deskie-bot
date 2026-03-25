// src/commands/say.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Relay a message as the bot (admin only).')
    .addStringOption(option =>
        option.setName('message')
              .setDescription('The exact message to send (formatting and mentions supported)')
              .setRequired(true)
    )
    .addChannelOption(option =>
        option.setName('channel')
              .setDescription('The channel to send the message in (defaults to current)')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)  // only admins can use this command
    .setDMPermission(false),  // guild only
  async execute(interaction) {
    // This command is restricted to admins by default_member_permissions above.
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const text = interaction.options.getString('message');
    // convert typed "\n" into real newlines
    const finalText = text.replace(/\\n/g, '\n');

    // Double-check user permissions (in case command was not properly restricted)
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
    }

    // Acknowledge the command first (ephemeral to only show the admin)
    await interaction.reply({ content: 'Sending your message...', ephemeral: true });

    // Send the actual message in the target channel
    try {
      await targetChannel.send(finalText);
    } catch (error) {
      console.error('Say command failed to send message:', error);
      return interaction.editReply({ content: '❌ Failed to send the message. Check bot permissions.', ephemeral: true });
    }

    // Optionally, confirm success to the admin (we can edit the ephemeral reply)
    await interaction.editReply({ content: '✅ Message sent.', ephemeral: true });
  }
};
