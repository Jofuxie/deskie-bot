// src/commands/readingsession.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdmin } = require('../functions/adminCheck');
const {
  READING_VC_ID,
  startSession,
  endSession,
  getSessionStatus,
  formatDuration,
} = require('../functions/readingSessions');
const { sendLog } = require('../functions/discordLogger');

function describeSummary(summary) {
  return [
    `🎧 Time with readers in <#${READING_VC_ID}>: **${formatDuration(summary.occupiedMs)}**`,
    `⏱️ Session length: ${formatDuration(summary.durationMs)}`,
    `🙋 Readers who joined: **${summary.readerCount}**`,
  ].join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('readingsession')
    .setDescription('Track a book reading session in the Reading Book Nook (admin only).')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Start counting reading time in the Reading Book Nook.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('end')
        .setDescription('Stop counting and add this session to the stats.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('See how the current reading session is going.')
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Only admins can manage reading sessions.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (subcommand === 'start') {
        const result = await startSession(interaction.client, {
          guildId: interaction.guildId,
          startedBy: interaction.user.id,
        });

        if (result.status === 'already_active') {
          return interaction.editReply({ content: '⚠️ A reading session is already running. Use `/readingsession end` first.' });
        }

        if (result.status === 'no_channel') {
          return interaction.editReply({ content: `❌ I couldn’t find the Reading Book Nook voice channel (${READING_VC_ID}).` });
        }

        await sendLog(interaction.client, {
          title: '📖 Reading Session Started',
          color: 0x5865F2,
          description: `${interaction.user.tag} started a reading session (${result.readersNow} reader(s) in the channel).`,
        });

        return interaction.editReply({
          content: `📖 Reading session started! I’m counting the time <#${READING_VC_ID}> has readers in it ` +
            `(**${result.readersNow}** there right now). Run \`/readingsession end\` when you’re done.\n` +
            '-# If everyone leaves and the channel stays empty for an hour, the session ends on its own.',
        });
      }

      if (subcommand === 'end') {
        const result = await endSession(interaction.guildId);

        if (result.status === 'no_session') {
          return interaction.editReply({ content: 'ℹ️ There’s no reading session running right now.' });
        }

        await sendLog(interaction.client, {
          title: '📖 Reading Session Ended',
          color: 0x57F287,
          description: describeSummary(result.summary),
        });

        return interaction.editReply({
          content: `✅ **Reading session wrapped!**\n${describeSummary(result.summary)}\n-# Added to \`/stats\`.`,
        });
      }

      if (subcommand === 'status') {
        const result = await getSessionStatus(interaction.guildId);

        if (result.status === 'no_session') {
          return interaction.editReply({ content: 'ℹ️ There’s no reading session running right now. Start one with `/readingsession start`.' });
        }

        return interaction.editReply({
          content: `📖 **Reading session in progress** (started <t:${Math.floor(new Date(result.summary.startedAt).getTime() / 1000)}:R>)\n` +
            describeSummary(result.summary),
        });
      }
    } catch (error) {
      console.error('readingsession command error:', error);

      await sendLog(interaction.client, {
        title: '❌ Reading Session Command Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });

      return interaction.editReply({ content: '❌ Something went wrong with the reading session.' }).catch(() => null);
    }
  },
};
