// src/commands/pomodoro.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createScheduledMessage } = require('../functions/scheduledMessageStore');
const { scheduleMessage } = require('../functions/scheduledMessageScheduler');
const { checkCooldown } = require('../functions/cooldown');

const FOCUS_ZONE_CHANNEL_ID = '1356146701798342769';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pomodoro')
    .setDescription('Start a Pomodoro focus timer (25min work + 5min break by default)')
    .addIntegerOption(option =>
      option.setName('work')
        .setDescription('Work duration in minutes (default 25)')
        .setMinValue(1)
        .setMaxValue(180)
    )
    .addIntegerOption(option =>
      option.setName('break')
        .setDescription('Break duration in minutes (default 5)')
        .setMinValue(1)
        .setMaxValue(60)
    ),

  async execute(interaction) {
    const remaining = checkCooldown('pomodoro', interaction.user.id, 30);

    if (remaining > 0) {
      return interaction.reply({
        content: `⏳ Please wait ${remaining}s before starting another Pomodoro session.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const workMin = interaction.options.getInteger('work') ?? 25;
    const breakMin = interaction.options.getInteger('break') ?? 5;
    const userId = interaction.user.id;

    const focusChannel = await interaction.client.channels
      .fetch(FOCUS_ZONE_CHANNEL_ID)
      .catch(() => null);

    if (!focusChannel) {
      return interaction.reply({
        content: '❌ I could not find the Focus Zone channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!focusChannel.isTextBased()) {
      return interaction.reply({
        content: '❌ The Focus Zone channel is not text-based.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const workEndAt = new Date(Date.now() + workMin * 60 * 1000).toISOString();
      const breakEndAt = new Date(Date.now() + (workMin + breakMin) * 60 * 1000).toISOString();

      const workDoc = await createScheduledMessage({
        guildId: interaction.guildId,
        channelId: FOCUS_ZONE_CHANNEL_ID,
        userId,
        content: `<@${userId}> 🍅 Your **${workMin}-minute** focus session is over. Time for a break.`,
        fireAt: workEndAt,
        type: 'pomodoro_work_end',
      });

      const breakDoc = await createScheduledMessage({
        guildId: interaction.guildId,
        channelId: FOCUS_ZONE_CHANNEL_ID,
        userId,
        content: `<@${userId}> ☕ Your **${breakMin}-minute** break is over. Back to work!`,
        fireAt: breakEndAt,
        type: 'pomodoro_break_end',
      });

      scheduleMessage(interaction.client, workDoc);
      scheduleMessage(interaction.client, breakDoc);

      await interaction.reply({
        content:
          `🍅 You used the Pomodoro feature.\n` +
          `Kindly wait for my callouts in <#${FOCUS_ZONE_CHANNEL_ID}> for your focus session and break.\n\n` +
          `**Session:** ${workMin} min focus + ${breakMin} min break.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Failed to start Pomodoro session:', error);

      await interaction.reply({
        content: '❌ Something went wrong while starting that Pomodoro session.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }
  },
};
