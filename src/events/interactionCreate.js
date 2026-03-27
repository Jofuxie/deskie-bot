const {
  Events,
  InteractionType,
  EmbedBuilder,
  Colors,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const {
  markReadingEntryFinishedNowById,
  updateFinishedReviewById,
} = require('../functions/tbrStore');
const { sendLog } = require('../functions/discordLogger');

function buildRatingDisplay(rating) {
  const numeric = Number(rating) || 0;
  const fullStars = Math.floor(numeric);
  const starText = '⭐'.repeat(Math.max(0, fullStars));
  return `${starText || '⭐'} · **${numeric}/5**`;
}

function buildFinishedEmbed(entry, titlePrefix = '🎉 Finished') {
  const authors = entry.book?.authors?.join(', ') || 'Unknown Author';

  const embed = new EmbedBuilder()
    .setTitle(`${titlePrefix}: ${entry.book?.title || 'Unknown Title'}`)
    .setColor(0x57F287)
    .setDescription(`by ${authors}`)
    .addFields(
      {
        name: 'Rating',
        value: entry.rating ? buildRatingDisplay(entry.rating) : 'No rating yet',
        inline: true,
      },
      {
        name: 'Date Finished',
        value: entry.finishedAt
          ? `<t:${Math.floor(new Date(entry.finishedAt).getTime() / 1000)}:D>`
          : 'Unknown',
        inline: true,
      }
    )
    .setTimestamp();

  if (entry.book?.coverUrl) {
    embed.setThumbnail(entry.book.coverUrl);
  }

  if (entry.reviewText) {
    embed.addFields({
      name: 'Review',
      value: entry.reviewText,
      inline: false,
    });
  }

  return embed;
}

function buildReviewModal(entryId, userId) {
  const ratingInput = new TextInputBuilder()
    .setCustomId('bookReviewRating')
    .setLabel('Rating (0.5 to 5.0)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Example: 4.5');

  const reviewInput = new TextInputBuilder()
    .setCustomId('bookReviewText')
    .setLabel('Short review (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('A short thought about the book...');

  return new ModalBuilder()
    .setCustomId(`bookReviewModal|${entryId}|${userId}`)
    .setTitle('Book Review')
    .addComponents(
      new ActionRowBuilder().addComponents(ratingInput),
      new ActionRowBuilder().addComponents(reviewInput)
    );
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command handler found for ${interaction.commandName}`);
        await sendLog(interaction.client, {
          title: '⚠️ Missing Command Handler',
          color: 0xFEE75C,
          description: `No handler found for \`/${interaction.commandName}\``,
          fields: [
            {
              name: 'User',
              value: `${interaction.user.tag} (${interaction.user.id})`,
              inline: false,
            },
            {
              name: 'Guild',
              value: interaction.guild
                ? `${interaction.guild.name} (${interaction.guild.id})`
                : 'DM / Unknown',
              inline: false,
            },
          ],
        });
        return;
      }

      const startedAt = Date.now();

      await sendLog(interaction.client, {
        title: '📥 Command Used',
        color: 0x5865F2,
        description: `Running \`/${interaction.commandName}\``,
        fields: [
          {
            name: 'User',
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: false,
          },
          {
            name: 'Guild',
            value: interaction.guild
              ? `${interaction.guild.name} (${interaction.guild.id})`
              : 'DM / Unknown',
            inline: false,
          },
        ],
      });

      try {
        await command.execute(interaction);

        const duration = Date.now() - startedAt;

        await sendLog(interaction.client, {
          title: '✅ Command Succeeded',
          color: 0x57F287,
          description: `Finished \`/${interaction.commandName}\` successfully.`,
          fields: [
            {
              name: 'User',
              value: `${interaction.user.tag} (${interaction.user.id})`,
              inline: false,
            },
            {
              name: 'Guild',
              value: interaction.guild
                ? `${interaction.guild.name} (${interaction.guild.id})`
                : 'DM / Unknown',
              inline: false,
            },
            {
              name: 'Duration',
              value: `${duration}ms`,
              inline: true,
            },
          ],
        });
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);

        const duration = Date.now() - startedAt;

        await sendLog(interaction.client, {
          title: '❌ Command Error',
          color: 0xED4245,
          description: `Error while running \`/${interaction.commandName}\``,
          fields: [
            {
              name: 'User',
              value: `${interaction.user.tag} (${interaction.user.id})`,
              inline: false,
            },
            {
              name: 'Guild',
              value: interaction.guild
                ? `${interaction.guild.name} (${interaction.guild.id})`
                : 'DM / Unknown',
              inline: false,
            },
            {
              name: 'Duration',
              value: `${duration}ms`,
              inline: true,
            },
            {
              name: 'Error',
              value: `\`\`\`${error?.stack || error}\`\`\``,
              inline: false,
            },
          ],
        });

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'There was an error executing that command.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        } else {
          await interaction.reply({
            content: 'There was an error executing that command.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('bookreview_complete_now|')) {
        const [, entryId, ownerId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
          return interaction.reply({
            content: '❌ This button is only for the reader who reached the end of the book.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          const result = await markReadingEntryFinishedNowById(
            interaction.guildId,
            interaction.user.id,
            entryId
          );

          if (result.status === 'not_found') {
            return interaction.reply({
              content: '❌ I could not find that active read anymore.',
              flags: MessageFlags.Ephemeral,
            });
          }

          if (result.status === 'not_reading') {
            return interaction.reply({
              content: '❌ That book is no longer in your current reads.',
              flags: MessageFlags.Ephemeral,
            });
          }

          const modal = buildReviewModal(result.entry.id, interaction.user.id);
          return interaction.showModal(modal);
        } catch (error) {
          await sendLog(interaction.client, {
            title: '❌ Review Button Error',
            color: 0xED4245,
            description: `\`\`\`${error?.stack || error}\`\`\``,
          });

          return interaction.reply({
            content: '❌ Something went wrong while starting the review flow.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
      }

      if (interaction.customId.startsWith('bookreview_review_later|')) {
        const [, entryId, ownerId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
          return interaction.reply({
            content: '❌ This button is only for the reader who reached the end of the book.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          const result = await markReadingEntryFinishedNowById(
            interaction.guildId,
            interaction.user.id,
            entryId
          );

          if (result.status === 'not_found') {
            return interaction.reply({
              content: '❌ I could not find that active read anymore.',
              flags: MessageFlags.Ephemeral,
            });
          }

          if (result.status === 'not_reading' && result.status !== 'already_finished') {
            return interaction.reply({
              content: '❌ That book is no longer in your current reads.',
              flags: MessageFlags.Ephemeral,
            });
          }

          const entry = result.entry;

          return interaction.reply({
            content: `✅ Marked **${entry.book?.title || 'that book'}** as finished. Use \`/bookreview edit query:${entry.book?.title || ''}\` when you're ready to add your rating and thoughts.`,
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          await sendLog(interaction.client, {
            title: '❌ Review Later Button Error',
            color: 0xED4245,
            description: `\`\`\`${error?.stack || error}\`\`\``,
          });

          return interaction.reply({
            content: '❌ Something went wrong while marking that book as finished.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
      }

      return;
    }

    if (interaction.type === InteractionType.ModalSubmit) {
      if (interaction.customId.startsWith('sayModal|')) {
        try {
          const channelId = interaction.customId.split('|')[1];
          const channel = await interaction.client.channels.fetch(channelId);

          const userText = interaction.fields.getTextInputValue('sayModalInput');

          await channel.send({
            content: userText,
            allowedMentions: {
              parse: ['roles', 'users', 'everyone'],
            },
          });

          await sendLog(interaction.client, {
            title: '✅ sayModal Posted',
            color: 0x57F287,
            description: 'A sayModal message was posted successfully.',
            fields: [
              {
                name: 'User',
                value: `${interaction.user.tag} (${interaction.user.id})`,
                inline: false,
              },
              {
                name: 'Channel ID',
                value: channelId,
                inline: false,
              },
            ],
          });

          await interaction.reply({
            content: '✅ Message posted!',
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          console.error('sayModal handling error:', err);

          await sendLog(interaction.client, {
            title: '❌ sayModal Error',
            color: 0xED4245,
            description: 'Error while handling sayModal submission.',
            fields: [
              {
                name: 'User',
                value: `${interaction.user.tag} (${interaction.user.id})`,
                inline: false,
              },
              {
                name: 'Custom ID',
                value: interaction.customId,
                inline: false,
              },
              {
                name: 'Error',
                value: `\`\`\`${err?.stack || err}\`\`\``,
                inline: false,
              },
            ],
          });

          await interaction.reply({
            content: '❌ Failed to send message.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }

        return;
      }

      if (interaction.customId.startsWith('announceModal|')) {
        try {
          const [, channelId, everyoneFlag, hereFlag, roleIdsRaw] =
            interaction.customId.split('|');

          const channel = await interaction.client.channels.fetch(channelId);

          const title = interaction.fields.getTextInputValue('announceTitle');
          const message = interaction.fields.getTextInputValue('announceMessage');

          const pingEveryone = everyoneFlag === '1';
          const pingHere = hereFlag === '1';
          const roleIds = roleIdsRaw ? roleIdsRaw.split(',').filter(Boolean) : [];

          const mentionParts = [];

          if (pingEveryone) mentionParts.push('@everyone');
          if (pingHere) mentionParts.push('@here');

          for (const roleId of roleIds) {
            mentionParts.push(`<@&${roleId}>`);
          }

          const embed = new EmbedBuilder()
            .setDescription(message)
            .setColor(Colors.Blue)
            .setTimestamp();

          if (title && title.trim()) {
            embed.setTitle(title.trim());
          }

          await channel.send({
            content: mentionParts.length ? mentionParts.join(' ') : undefined,
            embeds: [embed],
            allowedMentions: {
              parse: [...(pingEveryone || pingHere ? ['everyone'] : []), 'users'],
              roles: roleIds,
            },
          });

          await sendLog(interaction.client, {
            title: '✅ Announcement Posted',
            color: 0x57F287,
            description: 'An announcement modal was posted successfully.',
            fields: [
              {
                name: 'User',
                value: `${interaction.user.tag} (${interaction.user.id})`,
                inline: false,
              },
              {
                name: 'Channel ID',
                value: channelId,
                inline: false,
              },
            ],
          });

          await interaction.reply({
            content: '✅ Announcement posted!',
            flags: MessageFlags.Ephemeral,
          });
        } catch (err) {
          console.error('announceModal handling error:', err);

          await sendLog(interaction.client, {
            title: '❌ announceModal Error',
            color: 0xED4245,
            description: 'Error while handling announceModal submission.',
            fields: [
              {
                name: 'User',
                value: `${interaction.user.tag} (${interaction.user.id})`,
                inline: false,
              },
              {
                name: 'Custom ID',
                value: interaction.customId,
                inline: false,
              },
              {
                name: 'Error',
                value: `\`\`\`${err?.stack || err}\`\`\``,
                inline: false,
              },
            ],
          });

          await interaction.reply({
            content: '❌ Failed to send announcement.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }

        return;
      }

      if (interaction.customId.startsWith('bookReviewModal|')) {
        const [, entryId, ownerId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
          return interaction.reply({
            content: '❌ This review modal is only for the original reader.',
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          const ratingRaw = interaction.fields.getTextInputValue('bookReviewRating');
          const reviewText = interaction.fields.getTextInputValue('bookReviewText');
          const rating = Number(ratingRaw.trim());

          const result = await updateFinishedReviewById(
            interaction.guildId,
            interaction.user.id,
            entryId,
            {
              rating,
              reviewText,
            }
          );

          if (result.status === 'not_found') {
            return interaction.reply({
              content: '❌ I could not find that finished book anymore.',
              flags: MessageFlags.Ephemeral,
            });
          }

          if (result.status === 'invalid_rating') {
            return interaction.reply({
              content: '❌ Please enter a rating from 0.5 to 5 in 0.5 steps.',
              flags: MessageFlags.Ephemeral,
            });
          }

          const embed = buildFinishedEmbed(result.entry, '📝 Updated Review');

          if (result.entry.visibility === 'private') {
            return interaction.reply({
              embeds: [embed],
              flags: MessageFlags.Ephemeral,
            });
          }

          return interaction.reply({
            content: `${interaction.user} updated their review of: **${result.entry.book?.title || 'that book'}**`,
            embeds: [embed],
          });
        } catch (error) {
          await sendLog(interaction.client, {
            title: '❌ Book Review Modal Error',
            color: 0xED4245,
            description: `\`\`\`${error?.stack || error}\`\`\``,
          });

          return interaction.reply({
            content: '❌ Something went wrong while saving that review.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }
      }
    }
  },
};
