// src/commands/goal.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { setGoal, getGoalProgress, getCurrentYear } = require('../functions/goalStore');
const { sendLog } = require('../functions/discordLogger');

function buildProgressBar(percent, size = 10) {
  const safePercent = Math.max(0, Math.min(100, percent ?? 0));
  const filled = Math.round((safePercent / 100) * size);
  return `${'🟫'.repeat(filled)}${'⬜'.repeat(size - filled)}`;
}

function buildGoalEmbed(targetUser, progress) {
  const embed = new EmbedBuilder()
    .setTitle(`🎯 ${targetUser.username}'s ${progress.year} Reading Goal`)
    .setColor(0xA78B6D)
    .setTimestamp();

  if (!progress.targetBooks) {
    embed.setDescription(`No reading goal set for ${progress.year} yet. Use \`/goal set\` to start one!`);
    return embed;
  }

  embed.setDescription(
    [
      `${buildProgressBar(progress.percent)} **${progress.percent}%**`,
      `**${progress.finishedCount} / ${progress.targetBooks}** books finished in ${progress.year}`,
    ].join('\n')
  );

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('goal')
    .setDescription('Set or view your yearly reading goal.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set your reading goal for this year.')
        .addIntegerOption(option =>
          option
            .setName('books')
            .setDescription('How many books do you want to finish this year?')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View a reading goal.')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Whose goal do you want to view?')
            .setRequired(false)
        )
    )
    .setDMPermission(false),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'set') {
      const books = interaction.options.getInteger('books', true);

      try {
        await setGoal(interaction.guildId, interaction.user.id, books);
        const progress = await getGoalProgress(interaction.guildId, interaction.user.id);

        return interaction.reply({
          content: `🎯 Goal set! You're aiming to finish **${books}** book(s) in ${getCurrentYear()}.`,
          embeds: [buildGoalEmbed(interaction.user, progress)],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Goal Set Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.reply({
          content: '❌ Something went wrong while setting your goal.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }

    if (subcommand === 'view') {
      const targetUser = interaction.options.getUser('user') || interaction.user;

      try {
        const progress = await getGoalProgress(interaction.guildId, targetUser.id);

        return interaction.reply({
          embeds: [buildGoalEmbed(targetUser, progress)],
        });
      } catch (error) {
        await sendLog(interaction.client, {
          title: '❌ Goal View Error',
          color: 0xED4245,
          description: `\`\`\`${error?.stack || error}\`\`\``,
        });

        return interaction.reply({
          content: '❌ Something went wrong while loading that goal.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }
  },
};
