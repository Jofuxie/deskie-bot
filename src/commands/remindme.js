// src/commands/remindme.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createScheduledMessage } = require('../functions/scheduledMessageStore');
const { scheduleMessage } = require('../functions/scheduledMessageScheduler');
const { checkCooldown } = require('../functions/cooldown');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remindme')
    .setDescription('Set a reminder for yourself.')
    .addIntegerOption(option =>
        option.setName('minutes')
              .setDescription('How many minutes until the reminder')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(10080) // 7 days
    )
    .addStringOption(option =>
        option.setName('message')
              .setDescription('What you want to be reminded about')
              .setRequired(true)
    ),

  async execute(interaction) {
    const remaining = checkCooldown('remindme', interaction.user.id, 10);

    if (remaining > 0) {
      return interaction.reply({
        content: `⏳ Please wait ${remaining}s before setting another reminder.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const minutes = interaction.options.getInteger('minutes');
    const reminderText = interaction.options.getString('message');
    const userId = interaction.user.id;
    const fireAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

    try {
      const doc = await createScheduledMessage({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId,
        content: `<@${userId}> ⏰ **Reminder:** ${reminderText}`,
        fireAt,
        type: 'reminder',
      });

      scheduleMessage(interaction.client, doc);

      await interaction.reply({
        content: `✅ Okay <@${userId}>, I'll remind you in **${minutes}** minute(s). This will survive a bot restart.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Failed to set reminder:', error);

      await interaction.reply({
        content: '❌ Something went wrong while setting that reminder.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }
  }
};
