import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getScoreboard, GAME_NAMES, POINTS } from '../utils/gameScores.js';
import { GAME_EMOJI, gameOption, periodOption, privateOption, periodLabel, enabledGames, pts } from '../utils/gameBoards.js';
import { avatarOf, nameOf } from '../utils/personCard.js';

/**
 * /scoreboard — one person's points in the games (/potion, /foodfight,
 * /doom, /rescue): their own by default, or anyone's. Public unless
 * private:true, like the tournament's personal cards (Doug, 2026-10-02).
 * Games this server has switched off are left out.
 */

/** Each outcome's emoji, for the "8 🎯 · 2 💨" counts */
const OUTCOME_EMOJI = {
  hit: '🎯', miss: '💨', backfire: '🔄',
  tasty: '😋', gross: '🤢', spill: '💦',
  doomed: '💀', escaped: '🏃', backfired: '🔄', blocked: '🛡️',
  rescued: '🛟', caught: '🪤', sacrificed: '🕯️',
  helped: '💚', hurt: '☠️',
};

const counts = (byOutcome, game) => Object.keys(POINTS[game])
  .filter(o => byOutcome?.[o])
  .map(o => `${byOutcome[o]} ${OUTCOME_EMOJI[o]}`)
  .join(' · ');

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const data = new SlashCommandBuilder()
  .setName('scoreboard')
  .setDescription('Points in the games: /potion, /foodfight, /doom, /rescue')
  .addUserOption(option => option
    .setName('user')
    .setDescription('Whose scoreboard (default: yours)')
    .setRequired(false))
  .addStringOption(gameOption)
  .addStringOption(periodOption)
  .addBooleanOption(privateOption);

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
  const shown = game === 'all' ? games : [game];

  // Someone else's board: their server name and avatar, as for your own
  const picked = interaction.options.get('user');
  const user = picked?.user || interaction.user;
  if (user.bot) {
    await interaction.reply({ content: '🤖 Bots don\'t play. They just keep score.', ephemeral: true });
    return;
  }
  const member = picked ? picked.member : interaction.member;
  const name = picked
    ? (member?.displayName || user.globalName || user.username)
    : nameOf(interaction);
  const avatar = picked
    ? (member?.displayAvatarURL?.() || user.displayAvatarURL())
    : avatarOf(interaction);

  const board = getScoreboard(interaction.guildId, user.id, period);
  const total = shown.reduce((n, g) => n + (board.games[g]?.points || 0), 0);
  const played = shown.some(g => board.games[g]);

  const embed = new EmbedBuilder()
    .setColor(0xE67E22)
    .setAuthor({ name, iconURL: avatar })
    .setTitle(`📊 Scoreboard · ${periodLabel(period)}`);

  if (!played) {
    embed.setDescription(user.id === interaction.user.id
      ? 'No points yet. Throw some food, brew a potion, doom someone, or rescue them!'
      : `${name} hasn't played${game === 'all' ? '' : ` ${GAME_NAMES[game]}`} yet.`);
  } else {
    const rank = game === 'all' ? board.rank : board.games[game]?.rank;
    embed.setDescription(`**${pts(total)} points**${rank ? ` · ${ordinal(rank)} on the server` : ''}`);
    for (const g of shown) {
      const s = board.games[g];
      if (!s) continue;
      const lines = [`**${pts(s.points)} pts**${s.rank ? ` · #${s.rank}` : ''} · ${s.plays} play${s.plays === 1 ? '' : 's'}`];
      const did = counts(s.counts, g);
      if (did) lines.push(did);
      const got = counts(s.received, g);
      if (got) lines.push(`Received: ${got}`);
      if (s.bestStreak) lines.push(`Best streak ${s.bestStreak}${s.streak ? ` · 🔥 ${s.streak} now` : ''}`);
      embed.addFields({ name: `${GAME_EMOJI[g]} ${GAME_NAMES[g]}`, value: lines.join('\n').slice(0, 1024), inline: true });
    }
  }

  if (board.shieldedUntil && shown.includes('rescue')) {
    embed.addFields({ name: '🛡️ Shielded', value: `Safe from /doom until <t:${Math.floor(board.shieldedUntil / 1000)}:t>`, inline: false });
  }

  await interaction.reply({ embeds: [embed], ephemeral: isPrivate, allowedMentions: { parse: [] } });
}
