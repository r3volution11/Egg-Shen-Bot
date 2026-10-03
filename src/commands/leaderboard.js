import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getLeaderboard, GAME_NAMES } from '../utils/gameScores.js';
import { GAME_EMOJI, gameOption, periodOption, privateOption, periodLabel, enabledGames, pts } from '../utils/gameBoards.js';

/**
 * /leaderboard — the server's top players in the games, this month, this
 * year or all time, and who received the most of what.
 *
 * Doug wanted each player's avatar in their row, but only if it could be
 * small (2026-10-02). An embed's author icon is the smallest image Discord
 * shows (~24px), and a field can't hold an image at all, so each player is
 * their own one-line embed with their avatar as the author icon. A message
 * holds at most 10 embeds, hence the top 10; the heading and the "received"
 * leaders go in the message content.
 */

const MEDALS = ['🥇', '🥈', '🥉'];
const ROW_COLORS = [0xF1C40F, 0xBDC3C7, 0xCD7F32];

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('The server\'s top players in /potion, /foodfight, /doom and /rescue')
  .addStringOption(gameOption)
  .addStringOption(periodOption)
  .addBooleanOption(privateOption);

/**
 * Their current server name and avatar, if Discord still knows them. The
 * stored name is the fallback: someone who left keeps their row, iconless.
 */
async function lookUp(interaction, userId) {
  const member = await interaction.guild?.members?.fetch(userId).catch(() => null);
  if (member) return { name: member.displayName, icon: member.displayAvatarURL?.() || null };
  const user = await interaction.client?.users?.fetch(userId).catch(() => null);
  if (user) return { name: user.globalName || user.username, icon: user.displayAvatarURL?.() || null };
  return { name: null, icon: null };
}

export async function execute(interaction) {
  const isPrivate = interaction.options.getBoolean('private') ?? false;
  const period = interaction.options.getString('period') || 'all-time';
  const game = interaction.options.getString('game') || 'all';

  const games = await enabledGames(interaction);
  if (games.length === 0) {
    await interaction.reply({ content: '🎲 The games are switched off on this server.', ephemeral: true });
    return;
  }
  if (game !== 'all' && !games.includes(game)) {
    await interaction.reply({ content: `🎲 ${GAME_NAMES[game]} is switched off on this server.`, ephemeral: true });
    return;
  }

  // Fetching up to 10 members can outlast Discord's 3-second reply window
  await interaction.deferReply({ ephemeral: isPrivate });

  const board = getLeaderboard(interaction.guildId, game, period, { limit: 10 });
  const which = game === 'all' ? 'All games' : `${GAME_EMOJI[game]} ${GAME_NAMES[game]}`;
  const heading = `## 🏆 Leaderboard · ${which} · ${periodLabel(period)}`;

  if (board.rows.length === 0) {
    await interaction.editReply({ content: `${heading}\nNobody has played yet. Be the first!`, allowedMentions: { parse: [] } });
    return;
  }

  const people = await Promise.all(board.rows.map(r => lookUp(interaction, r.userId)));
  const embeds = board.rows.map((row, i) => {
    const who = people[i];
    const name = who.name || row.name || 'Someone';
    const place = MEDALS[i] || `#${i + 1}`;
    return new EmbedBuilder()
      .setColor(ROW_COLORS[i] ?? 0x2F3136)
      .setAuthor({
        name: `${place}  ${name} · ${pts(row.points)} pts · ${row.plays} play${row.plays === 1 ? '' : 's'}`.slice(0, 256),
        ...(who.icon ? { iconURL: who.icon } : {}),
      });
  });

  // Received leaders and the best streak, by name: mentions would ping
  const nameFor = (userId, stored) => people[board.rows.findIndex(r => r.userId === userId)]?.name || stored || 'Someone';
  const extras = board.received.map(r => `${r.label}: **${nameFor(r.userId, r.name)}** (${r.count})`);
  if (board.bestStreak) {
    const s = board.bestStreak;
    extras.push(`🔥 Best streak: **${nameFor(s.userId, s.name)}** (${s.count} in ${GAME_NAMES[s.game]})`);
  }

  await interaction.editReply({
    content: [heading, ...extras.map(e => `-# ${e}`)].join('\n').slice(0, 2000),
    embeds,
    allowedMentions: { parse: [] },
  });
}
