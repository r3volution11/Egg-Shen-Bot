import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getLeaderboard, GAME_NAMES } from '../utils/gameScores.js';
import { gameOption, periodOption, privateOption, periodLabel, enabledGames } from '../utils/gameBoards.js';
import { renderLeaderboard } from '../utils/leaderboardCard.js';

/**
 * /leaderboard — the server's game card: the top 15 players in the games
 * this month, this year or all time, who leads each game, who received the
 * most of what, and the period's numbers. One gold embed (leaderboardCard.js);
 * this command finds who everyone is now and hands their names in.
 */

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('The server\'s top players in /potion, /foodfight, /doom and /rescue')
  .addStringOption(gameOption)
  .addStringOption(periodOption)
  .addBooleanOption(privateOption);

/**
 * Their current server name and avatar, if Discord still knows them. The
 * stored name is the fallback: someone who left keeps their row, by the
 * name they last played under.
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
    await interaction.reply({ content: '🎲 The games are switched off on this server.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (game !== 'all' && !games.includes(game)) {
    await interaction.reply({ content: `🎲 ${GAME_NAMES[game]} is switched off on this server.`, flags: MessageFlags.Ephemeral });
    return;
  }

  // Looking up a couple of dozen members can outlast Discord's 3-second
  // reply window
  await interaction.deferReply(isPrivate ? { flags: MessageFlags.Ephemeral } : {});

  const board = getLeaderboard(interaction.guildId, game, period, { limit: 15, games });

  // Everyone the card names: the rows, each game's leader, the received
  // leaders and the best streak — mostly the same few people, looked up once
  const named = [...board.rows, ...Object.values(board.perGame), ...board.received, board.bestStreak].filter(Boolean);
  const ids = [...new Set(named.map(x => x.userId))];
  const found = await Promise.all(ids.map(id => lookUp(interaction, id)));
  const people = new Map(ids.map((id, i) => [id, found[i]]));
  const withName = (x) => x && { ...x, name: people.get(x.userId)?.name || x.name || 'Someone' };

  const card = renderLeaderboard({
    game,
    games,
    periodLabel: periodLabel(period),
    rows: board.rows.map(r => ({ ...withName(r), avatarUrl: people.get(r.userId)?.icon || null })),
    perGame: Object.fromEntries(Object.entries(board.perGame).map(([g, lead]) => [g, withName(lead)])),
    received: board.received.map(withName),
    bestStreak: withName(board.bestStreak),
    totals: board.totals,
  });

  // Names, not mentions, but a name can still look like one: ping nobody
  await interaction.editReply({ embeds: [card], allowedMentions: { parse: [] } });
}
