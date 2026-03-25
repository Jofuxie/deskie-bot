// src/commands/remindme.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remindme')
    .setDescription('Set a reminder for yourself.')
    .addIntegerOption(option =>
        option.setName('minutes')
              .setDescription('How many minutes until the reminder')
              .setRequired(true)
              .setMinValue(1)
    )
    .addStringOption(option =>
        option.setName('message')
              .setDescription('What you want to be reminded about')
              .setRequired(true)
    ),

  async execute(interaction) {
    const minutes = interaction.options.getInteger('minutes');
    const reminderText = interaction.options.getString('message');
    const userId = interaction.user.id;
    const delay = minutes * 60 * 1000;  // convert to milliseconds

    // Confirm to the user that the reminder is set
    await interaction.reply({ 
      content: `✅ Okay <@${userId}>, I'll remind you in **${minutes}** minute(s).`, 
      ephemeral: true 
    });

    setTimeout(() => {
      try {
        interaction.channel.send(`<@${userId}> ⏰ **Reminder:** ${reminderText}`);
      } catch (error) {
        console.error('Failed to send reminder:', error);
      }
    }, delay);
  }
};
