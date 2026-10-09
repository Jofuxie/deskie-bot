// src/commands/prompt.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const {
  BOOKISH_BANTER_CHANNEL_ID,
  PROMPT_ADMIN_ROLE_ID,
  peekNextPrompt,
  consumePrompt,
  getPoolStatus,
  addCustomPrompt,
  buildPromptMessage,
  postNextPrompt,
} = require('../functions/bookPrompts');
const { sendLog } = require('../functions/discordLogger');

function isPromptAdmin(member) {
  return Boolean(
    member?.roles?.cache?.has(PROMPT_ADMIN_ROLE_ID) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

function describeSource(prompt) {
  return prompt.source === 'custom' ? 'added by an admin' : 'from Deskie’s list';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prompt')
    .setDescription('Manage the Mon/Wed/Fri #bookish-banter questions (admin only).')
    .addSubcommand(subcommand =>
      subcommand
        .setName('send')
        .setDescription('Post the next question in #bookish-banter right now.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('preview')
        .setDescription('Privately see the next question before it’s posted.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('skip')
        .setDescription('Throw away the next question without posting it.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add your own question. Added questions are posted before Deskie’s list.')
        .addStringOption(option =>
          option
            .setName('question')
            .setDescription('The question to ask, e.g. "What book made you cry the hardest?"')
            .setRequired(true)
            .setMaxLength(300)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('See how many questions are left.')
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!isPromptAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Only admins can manage the Bookish Banter questions.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (subcommand === 'send') {
        const result = await postNextPrompt(interaction.client, 'manual');

        if (result.status === 'busy') {
          return interaction.editReply({ content: '⏳ A question is already being posted. Try again in a moment.' });
        }

        if (result.status === 'empty') {
          return interaction.editReply({ content: '📭 There are no questions left. Add some with `/prompt add`!' });
        }

        return interaction.editReply({
          content: `✅ Posted in <#${BOOKISH_BANTER_CHANNEL_ID}>: **${result.prompt.text}**\n` +
            `This counts as today’s question, so the 9 AM post won’t repeat it today. ${result.remaining} question(s) left.`,
        });
      }

      if (subcommand === 'preview') {
        const prompt = await peekNextPrompt();

        if (!prompt) {
          return interaction.editReply({ content: '📭 There are no questions left. Add some with `/prompt add`!' });
        }

        return interaction.editReply({
          content: `👀 **Next question** (${describeSource(prompt)}). This is how it will look; the line under the question changes each time:\n\n` +
            buildPromptMessage(prompt.text),
          allowedMentions: { parse: [] },
        });
      }

      if (subcommand === 'skip') {
        const skipped = await peekNextPrompt();

        if (!skipped) {
          return interaction.editReply({ content: '📭 There are no questions left to skip.' });
        }

        await consumePrompt(skipped);
        const next = await peekNextPrompt();

        await sendLog(interaction.client, {
          title: '⏭️ Bookish Banter Question Skipped',
          color: 0x5865F2,
          description: `${interaction.user.tag} skipped: ${skipped.text}`,
        });

        return interaction.editReply({
          content: `⏭️ Skipped: ~~${skipped.text}~~\n` +
            (next ? `Next up (${describeSource(next)}): **${next.text}**` : '📭 That was the last question. Add more with `/prompt add`!'),
        });
      }

      if (subcommand === 'add') {
        const result = await addCustomPrompt(
          interaction.options.getString('question', true),
          interaction.user.id
        );

        if (result.status === 'too_short') {
          return interaction.editReply({ content: '❌ That question is a bit too short. Try writing a full question!' });
        }

        if (result.status === 'duplicate') {
          return interaction.editReply({ content: '⚠️ That question is already in the pool, so it wasn’t added again.' });
        }

        return interaction.editReply({
          content: result.position === 1
            ? '✅ Added! It will be the **next** question posted.'
            : `✅ Added! It’s **#${result.position}** in line among the questions admins have added.`,
        });
      }

      if (subcommand === 'status') {
        const status = await getPoolStatus();
        const weeks = Math.floor(status.totalLeft / 3);

        return interaction.editReply({
          content: [
            '📊 **Bookish Banter questions**',
            `• Added by admins, waiting to be posted: **${status.customQueued}**`,
            `• Left in Deskie’s list: **${status.builtInLeft}** of ${status.builtInTotal}`,
            `• That’s about **${weeks}** week(s) of Mon/Wed/Fri posts`,
            `• Last posted: ${status.lastPostedDate || 'not yet'}`,
          ].join('\n'),
        });
      }
    } catch (error) {
      console.error('prompt command error:', error);

      await sendLog(interaction.client, {
        title: '❌ Prompt Command Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });

      return interaction.editReply({ content: '❌ Something went wrong with the Bookish Banter questions.' }).catch(() => null);
    }
  },
};
