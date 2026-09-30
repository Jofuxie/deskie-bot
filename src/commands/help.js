// src/commands/help.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const CATEGORIES = [
  {
    name: '📚 Reading Companion',
    commands: ['tbr', 'reading', 'bookreview', 'bookpick', 'librarycard', 'leaderboard', 'goal'],
  },
  {
    name: '🧸 Focus & Utility',
    commands: ['pomodoro', 'remindme', 'help'],
  },
  {
    name: '🛠️ Admin Tools',
    commands: ['announce', 'bookclubwelcome', 'dailyquote', 'digest', 'reactionrole', 'refreshvcchat', 'say', 'saymodal', 'wipechannel'],
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('See everything Deskie can do.'),

  async execute(interaction) {
    const commands = interaction.client.commands;

    const embed = new EmbedBuilder()
      .setTitle('🧸 Deskie — Command Guide')
      .setColor(0xA78B6D)
      .setDescription('Here’s everything I can help you with around here~')
      .setTimestamp();

    const seen = new Set();

    for (const category of CATEGORIES) {
      const lines = category.commands
        .map(name => {
          const command = commands.get(name);
          if (!command) return null;
          seen.add(name);
          return `**/${command.data.name}** — ${command.data.description}`;
        })
        .filter(Boolean);

      if (lines.length) {
        embed.addFields({ name: category.name, value: lines.join('\n'), inline: false });
      }
    }

    const uncategorized = [...commands.values()].filter(
      command => !seen.has(command.data.name)
    );

    if (uncategorized.length) {
      embed.addFields({
        name: '✨ More',
        value: uncategorized
          .map(command => `**/${command.data.name}** — ${command.data.description}`)
          .join('\n'),
        inline: false,
      });
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
