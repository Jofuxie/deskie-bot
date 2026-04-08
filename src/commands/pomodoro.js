// src/commands/pomodoro.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const FOCUS_ZONE_CHANNEL_ID = '1356146701798342769';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pomodoro')
    .setDescription('Start a Pomodoro focus timer (25min work + 5min break by default)')
    .addIntegerOption(option =>
      option.setName('work')
        .setDescription('Work duration in minutes (default 25)')
        .setMinValue(1)
    )
    .addIntegerOption(option =>
      option.setName('break')
        .setDescription('Break duration in minutes (default 5)')
        .setMinValue(1)
    ),

  async execute(interaction) {
    const workMin = interaction.options.getInteger('work') ?? 25;
    const breakMin = interaction.options.getInteger('break') ?? 5;
    const workMs = workMin * 60 * 1000;
    const breakMs = breakMin * 60 * 1000;
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

    await interaction.reply({
      content:
        `🍅 You used the Pomodoro feature.\n` +
        `Kindly wait for my callouts in <#${FOCUS_ZONE_CHANNEL_ID}> for your focus session and break.\n\n` +
        `**Session:** ${workMin} min focus + ${breakMin} min break.`,
      flags: MessageFlags.Ephemeral,
    });

    setTimeout(async () => {
      try {
        await focusChannel.send(
          `<@${userId}> 🍅 Your **${workMin}-minute** focus session is over. Time for a break.`
        );
      } catch (error) {
        console.error('Failed to send Pomodoro work-end message:', error);
      }
    }, workMs);

    setTimeout(async () => {
      try {
        await focusChannel.send(
          `<@${userId}> ☕ Your **${breakMin}-minute** break is over. Back to work!`
        );
      } catch (error) {
        console.error('Failed to send Pomodoro break-end message:', error);
      }
    }, workMs + breakMs);
  },
};