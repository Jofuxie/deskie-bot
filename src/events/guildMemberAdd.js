// src/events/guildMemberAdd.js
const { Events } = require('discord.js');
const {
  claimWelcome,
  releaseWelcome,
  pickWelcomeIndex,
} = require('../functions/welcomeStore');
const { sendLog } = require('../functions/discordLogger');

const WELCOME_CHANNEL_ID = '1356174307428008107';

const WELCOME_MESSAGES = [
  '☁️ {user} just floated into Café Cloud! Grab a warm drink and make yourself at home~',
  '☕ Welcome, {user}! There’s a cozy seat saved just for you hehe.',
  '🌸 A new friend has arrived! Hi {user}, we’re so glad you’re here.',
  '📚 {user} has entered the reading nook. Welcome, welcome~',
  '🧸 Hiii {user}! Deskie is happy to see you. Settle in at your own pace, okayyy?',
  '🌿 Welcome to Café Cloud, {user}! Work, read, chat, or just hang out quietly. It’s all good here.',
  '✨ {user} just stepped in! The kettle’s on and the lights are warm. Welcome~',
  '🍰 Look who’s here! Welcome, {user}! Pull up a chair and stay awhile.',
  '🌙 Hi {user}! Welcome to our little corner of calm. No pressure, just good company.',
  '💛 A warm welcome to {user}! We’re really happy you found us.',
  '🫖 {user} has joined the café! Deskie saved you the comfiest spot by the window.',
  '📖 Welcome, {user}! A new chapter starts today, and we’re glad you’re part of it~',
  '🌤 Hey {user}! Welcome in. Take a breath, get comfy, and say hi whenever you’re ready.',
  '🧁 {user} just landed in Café Cloud! Welcome, friend. Make yourself cozy hehe.',
  '☁️ Welcome aboard, {user}! If you ever need me, just type `/help`~',
];

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (member.user.bot) return;

    const guildId = member.guild.id;
    const userId = member.id;
    let claimed = false;

    try {
      claimed = await claimWelcome(guildId, userId);
      if (!claimed) return; // already welcomed before (e.g. they left and rejoined)

      const channel = await member.client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);

      if (!channel || !channel.isTextBased()) {
        throw new Error(`Invalid or inaccessible welcome channel: ${WELCOME_CHANNEL_ID}`);
      }

      const index = await pickWelcomeIndex(WELCOME_MESSAGES.length);
      const content = WELCOME_MESSAGES[index].replace('{user}', `<@${userId}>`);

      await channel.send({
        content,
        allowedMentions: { users: [userId] },
      });
    } catch (error) {
      console.error('Failed to welcome new member:', error);

      if (claimed) {
        await releaseWelcome(guildId, userId).catch(() => null);
      }

      await sendLog(member.client, {
        title: '❌ Welcome Message Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
        fields: [
          {
            name: 'Member',
            value: `${member.user.tag} (${userId})`,
            inline: false,
          },
        ],
      });
    }
  },
};
