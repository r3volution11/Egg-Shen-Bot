import { SlashCommandBuilder } from 'discord.js';
import { gameOption, periodOption, privateOption } from '../utils/gameBoards.js';
import { replyWithGameCard } from '../utils/gameCard.js';

/**
 * /scoreboard — one person's game card: points in /potion, /foodfight,
 * /doom and /rescue, their own by default or anyone's. Public unless
 * private:true, like the tournament's personal cards (Doug, 2026-10-02).
 *
 * The card itself, and every refusal (games switched off, bots, "hasn't
 * played yet"), lives in gameCard.js, because the right-click Game card
 * (game-card.js) shows the same card.
 */

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
  await replyWithGameCard(interaction, {
    picked: interaction.options.get('user'),
    period: interaction.options.getString('period') || 'all-time',
    game: interaction.options.getString('game') || 'all',
    // `?? false`: unset is null, and a deliberate false must stay false
    ephemeral: interaction.options.getBoolean('private') ?? false,
  });
}
