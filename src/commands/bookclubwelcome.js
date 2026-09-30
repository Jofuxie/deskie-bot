// src/commands/bookclubwelcome.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const {
  sendBookClubWelcome,
  getMembersToWelcome,
  buildWelcomePayload,
  findWelcomeImage,
  ANNOUNCEMENT_CHANNEL_ID,
  NEW_MEMBER_WINDOW_DAYS,
} = require('../functions/bookClubWelcome');
const { sendLog } = require('../functions/discordLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bookclubwelcome')
    .setDescription('Welcome new Book Readers to the book club (admin only).')
    .addSubcommand(subcommand =>
      subcommand
        .setName('preview')
        .setDescription('Privately preview the welcome and who it would mention. Posts nothing.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('send')
        .setDescription('Post the welcome now for everyone waiting, instead of waiting for Wednesday.')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (subcommand === 'preview') {
        const members = await getMembersToWelcome(interaction.guild);
        const memberIds = members.length ? members.map(member => member.id) : [interaction.user.id];

        const notes = [
          members.length
            ? `👀 **Preview:** this would welcome **${members.length}** book reader(s) in <#${ANNOUNCEMENT_CHANNEL_ID}>. Nothing has been posted.`
            : `👀 **Preview:** no new Book Readers are waiting right now (joined in the last ${NEW_MEMBER_WINDOW_DAYS} days and not welcomed yet), so this example mentions you. Nothing has been posted.`,
        ];

        if (!findWelcomeImage()) {
          notes.push('🖼️ No image yet. It will appear here once `assets/bookclub-welcome.png` is added.');
        }

        await interaction.editReply({ content: notes.join('\n') });

        return interaction.followUp({
          ...buildWelcomePayload(memberIds),
          allowedMentions: { parse: [] }, // previews never ping anyone
          flags: MessageFlags.Ephemeral,
        });
      }

      if (subcommand === 'send') {
        const result = await sendBookClubWelcome(interaction.client, 'manual');

        if (result.status === 'busy') {
          return interaction.editReply({ content: '⏳ A book club welcome is already being sent. Try again in a moment.' });
        }

        if (result.status === 'nobody') {
          return interaction.editReply({
            content: `ℹ️ No new Book Readers to welcome right now. Deskie welcomes members who have the Book Reader role, joined in the last ${NEW_MEMBER_WINDOW_DAYS} days, and haven't been welcomed yet.`,
          });
        }

        return interaction.editReply({
          content: `✅ Welcomed **${result.count}** new book reader(s) in <#${ANNOUNCEMENT_CHANNEL_ID}>.`,
        });
      }
    } catch (error) {
      console.error('bookclubwelcome command error:', error);

      await sendLog(interaction.client, {
        title: '❌ Book Club Welcome Command Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });

      return interaction.editReply({ content: '❌ Something went wrong with the book club welcome.' }).catch(() => null);
    }
  },
};
