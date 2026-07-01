// src/commands/digest.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const { sendMonthlyDigest } = require('../functions/monthlyDigestScheduler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('digest')
    .setDescription("Manually send last month's reading digest (admin only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    try {
      await sendMonthlyDigest(interaction.client);

      await interaction.reply({
        content: '✅ Monthly digest sent successfully.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('digest command error:', error);

      await interaction.reply({
        content: '❌ Failed to send the monthly digest.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
