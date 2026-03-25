// src/commands/dailyquote.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { sendDailyQuote } = require('../functions/dailyQuoteScheduler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dailyquote')
    .setDescription('Manually send the daily quote (admin only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    try {
      await sendDailyQuote(interaction.client);

      await interaction.reply({
        content: '✅ Daily quote sent successfully.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('dailyquote command error:', error);

      await interaction.reply({
        content: '❌ Failed to send the daily quote.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};