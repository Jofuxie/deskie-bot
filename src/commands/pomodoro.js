// src/commands/pomodoro.js
const { SlashCommandBuilder } = require('discord.js');

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
    const workMs = workMin * 60 * 1000;   // convert minutes to milliseconds
    const breakMs = breakMin * 60 * 1000;
    const userId = interaction.user.id;

    // Acknowledge the command and inform the user
    await interaction.reply({ 
      content: `Pomodoro started: **${workMin} minutes** focus time. I will remind you when time is up!`, 
      ephemeral: true 
    });

    // Notify when work timer is over
    setTimeout(() => {
      try {
        interaction.channel.send(`<@${userId}>, your **${workMin}-minute** focus session is over! Time for a break.`);
      } catch (error) {
        console.error('Failed to send Pomodoro work-end message:', error);
      }
    }, workMs);

    // Notify when break timer is over (if break > 0)
    setTimeout(() => {
      try {
        interaction.channel.send(`<@${userId}>, your **${breakMin}-minute** break is over. Back to work!`);
      } catch (error) {
        console.error('Failed to send Pomodoro break-end message:', error);
      }
    }, workMs + breakMs);
  }
};
