// src/events/interactionCreate.js
const {
  Events,
  InteractionType,
  EmbedBuilder,
  Colors,
  MessageFlags,
} = require('discord.js');
const { sendLog } = require('../functions/discordLogger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // 1) Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`No command handler found for ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);

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
    }

    // 2) Handle Modal Submissions
    else if (interaction.type === InteractionType.ModalSubmit) {
      // Existing sayModal
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
      }

      // Existing announce modal
      else if (interaction.customId.startsWith('announceModal|')) {
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
      }
    }

    // 3) Potentially handle other interactions
    else {
      // do nothing
    }
  }
};