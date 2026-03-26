// src/functions/discordLogger.js
const { EmbedBuilder } = require('discord.js');

function truncate(text, max = 3900) {
  if (text === null || text === undefined) return 'No details provided.';
  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

async function sendLog(client, {
  title = 'Deskie Log',
  description = 'No details provided.',
  color = 0x5865F2,
  fields = [],
} = {}) {
  try {
    const channelId = process.env.LOG_CHANNEL_ID;
    if (!channelId || !client) {
      console.error('Discord logger missing LOG_CHANNEL_ID or client.');
      return;
    }

    const channel = await client.channels.fetch(channelId).catch((err) => {
      console.error('Failed to fetch log channel:', err);
      return null;
    });

    if (!channel) {
      console.error(`Log channel not found: ${channelId}`);
      return;
    }

    if (!channel.isTextBased()) {
      console.error(`Log channel is not text-based: ${channelId}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(truncate(title, 256))
      .setDescription(truncate(description))
      .setColor(color)
      .setTimestamp();

    if (Array.isArray(fields) && fields.length) {
      const cleanedFields = fields
        .filter(field => field && field.name && field.value)
        .slice(0, 25)
        .map(field => ({
          name: truncate(field.name, 256),
          value: truncate(field.value, 1024),
          inline: Boolean(field.inline),
        }));

      if (cleanedFields.length) {
        embed.addFields(cleanedFields);
      }
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send Discord log:', error);
  }
}

module.exports = { sendLog };