// src/functions/discordLogger.js
const { EmbedBuilder } = require('discord.js');

function truncate(text, max = 3900) {
  if (!text) return 'No details provided.';
  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

async function sendLog(client, {
  title = 'Deskie Log',
  description = 'No details provided.',
  color = 0xED4245,
  fields = [],
} = {}) {
  try {
    const channelId = process.env.LOG_CHANNEL_ID;
    if (!channelId || !client) return;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(truncate(description))
      .setColor(color)
      .setTimestamp();

    if (Array.isArray(fields) && fields.length) {
      embed.addFields(
        fields
          .filter(field => field?.name && field?.value)
          .slice(0, 25)
          .map(field => ({
            name: truncate(field.name, 256),
            value: truncate(field.value, 1024),
            inline: Boolean(field.inline),
          }))
      );
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send Discord log:', error);
  }
}

module.exports = { sendLog };