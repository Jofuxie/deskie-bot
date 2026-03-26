const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { getReaderStatsData } = require('../functions/tbrStore');
const { sendLog } = require('../functions/discordLogger');

const AFFIRMATION_BUCKETS = {
  active_and_finished: [
    '🌿 You’ve been keeping your reading nook warm and steadyyy. Bit by bit, page by page, you’re making your way through stories, and that really counts hehe.',
    '☕ You’re doing such a lovely job balancing current reads and finished books. Slow and steady is still progress, and Deskie is proud of youuu.',
    '🧸 Your shelf feels alive right now — some books are in your hands, some are already behind you, and that’s such a cozy rhythm to have.',
  ],
  many_tbr_few_finished: [
    '📚 Your TBR is full of possibilities hehe — no rush though. Stories wait for us in their own time, and you’re allowed to read gently.',
    '🌸 You’ve got a lot of little adventures waiting on your shelf, and that’s honestly excitinggg. One page at a time is more than enough.',
    '☁️ A tall TBR doesn’t mean pressure, okayyy? It just means your future self has plenty of lovely stories to wander into whenever you’re ready.',
  ],
  finished_a_lot: [
    '✨ You’ve been doing amazinggg. Your little library is growing with stories you’ve actually lived through, not just collected.',
    '🏆 Your reading nook has been busy in the best way. So many books finished, so many worlds visited — that’s such a lovely thing.',
    '🌟 You’ve really been making your way through your shelf, and it showsss. Deskie hopes you’re proud of your cozy little streak.',
  ],
  no_progress_yet: [
    '🧸 Your reading nook is a little quiet right now, and that’s okay. The next book will be there when you’re readyyy.',
    '🌙 Even resting counts. Stories are patient, and your shelf will still be here when you feel like easing back in.',
    '☕ No pressure, no rush — just a soft little reminder that books can wait for you kindly until the right mood comes along.',
  ],
};

function pickRandom(array) {
  if (!array?.length) return '';
  return array[Math.floor(Math.random() * array.length)];
}

function buildStars(rating) {
  const safeRating = Math.max(1, Math.min(5, Number(rating) || 1));
  return '⭐'.repeat(safeRating);
}

function chooseAffirmation(stats) {
  const { currentReads, tbr, finished } = stats;

  if (currentReads === 0 && finished === 0) {
    return pickRandom(AFFIRMATION_BUCKETS.no_progress_yet);
  }

  if (finished >= 5) {
    return pickRandom(AFFIRMATION_BUCKETS.finished_a_lot);
  }

  if (currentReads > 0 && finished > 0) {
    return pickRandom(AFFIRMATION_BUCKETS.active_and_finished);
  }

  if (tbr >= 5 && finished <= 2) {
    return pickRandom(AFFIRMATION_BUCKETS.many_tbr_few_finished);
  }

  return pickRandom(AFFIRMATION_BUCKETS.active_and_finished);
}

function formatCurrentReads(entries) {
  if (!entries.length) return 'No public current reads right now.';
  return entries
    .slice(0, 3)
    .map((entry, index) => `**${index + 1}.** ${entry.book?.title || 'Unknown Title'}`)
    .join('\n');
}

function formatTbrSection(entries, count) {
  if (!entries.length) {
    return 'No TBR books added yet.';
  }

  const preview = entries
    .slice(0, 2)
    .map((entry, index) => {
      const title = entry.book?.title || 'Unknown Title';
      const authors = entry.book?.authors?.join(', ') || 'Unknown Author';
      return `**${index + 1}.** ${title}\nby ${authors}`;
    })
    .join('\n\n');

  return [
    `${count} book${count === 1 ? '' : 's'}`,
    '',
    preview,
  ].join('\n');
}

function formatLatestFinished(entry, finishedCount) {
  if (!entry) return 'No finished books yet.';

  const title = entry.book?.title || 'Unknown Title';
  const rating = entry.rating ? buildStars(entry.rating) : 'No rating yet';

  return [
    `${finishedCount} book${finishedCount === 1 ? '' : 's'}`,
    '',
    `**${title}**`,
    rating,
  ].join('\n');
}

function buildReaderStatsEmbed(targetUser, statsData) {
  const { currentReadsPreview, tbrPreview, latestFinished, counts } = statsData;

  const embed = new EmbedBuilder()
    .setTitle(`📚 ${targetUser.username}'s Library Card ~`)
    .setColor(0xA78B6D)
    .setTimestamp();

  const coverEntry =
    currentReadsPreview[0] ||
    latestFinished ||
    tbrPreview[0] ||
    null;

  if (coverEntry?.book?.coverUrl) {
    embed.setThumbnail(coverEntry.book.coverUrl);
  }

  embed.addFields(
    {
      name: '📖 Current Reads',
      value: formatCurrentReads(currentReadsPreview),
      inline: false,
    },
    {
      name: '🪵 To Be Read',
      value: formatTbrSection(tbrPreview, counts.tbr),
      inline: false,
    },
    {
      name: '✨ Finished Books',
      value: formatLatestFinished(latestFinished, counts.finished),
      inline: false,
    }
  );

  const affirmation = chooseAffirmation(counts);
  embed.setDescription(`*${affirmation}*\n\n- Deskie 🧸💗`);

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('readerstats')
    .setDescription('View a cozy reading snapshot for yourself or another user.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Whose library card do you want to view?')
        .setRequired(false)
    )
    .setDMPermission(false),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    try {
      const statsData = await getReaderStatsData(
        interaction.guildId,
        targetUser.id,
        { includePrivate: false }
      );

      const embed = buildReaderStatsEmbed(targetUser, statsData);

      await interaction.reply({
        embeds: [embed],
      });
    } catch (error) {
      await sendLog(interaction.client, {
        title: '❌ Reader Stats Error',
        color: 0xED4245,
        description: `\`\`\`${error?.stack || error}\`\`\``,
      });

      await interaction.reply({
        content: '❌ Something went wrong while loading reader stats.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
    }
  },
};