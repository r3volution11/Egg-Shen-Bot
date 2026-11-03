import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { gameOption, periodOption, privateOption } from '../utils/gameBoards.js';
import { replyWithGameCard } from '../utils/gameCard.js';
import { setShownTitle } from '../utils/gameScores.js';
import { titleChoices } from '../utils/gameCardData.js';
import { TITLE_REFUSALS } from '../data/gameRewardLines.js';
import { TITLES } from '../data/gameRewards.js';
import { resolveTyped, typedForm } from '../utils/gameRules.js';

const TITLE_BY_KEY = Object.fromEntries(TITLES.map(t => [t.key, t]));

/**
 * /scoreboard — one person's game card: points in /potion, /foodfight,
 * /doom, /rescue and /siege, their own by default or anyone's. Public unless
 * private:true, like the tournament's personal cards (Doug, 2026-10-02).
 *
 * The card itself, and every refusal (games switched off, bots, "hasn't
 * played yet"), lives in gameCard.js, because the right-click Game card
 * (game-card.js) shows the same card.
 *
 * `title:` (R3) picks which of your earned titles shows with your name, on
 * your card and the leaderboard — then shows the card, so you see it
 * there. Only for your own card: picking someone else's title would be a
 * prank, not a choice.
 */

export const data = new SlashCommandBuilder()
  .setName('scoreboard')
  .setDescription('Points in the games: /potion, /foodfight, /doom, /rescue, /siege')
  .addUserOption(option => option
    .setName('user')
    .setDescription('Whose scoreboard (default: yours)')
    .setRequired(false))
  .addStringOption(gameOption)
  .addStringOption(periodOption)
  .addBooleanOption(privateOption)
  .addStringOption(option => option
    .setName('title')
    .setDescription('Pick the title shown with your name')
    .setRequired(false)
    .setAutocomplete(true));

/** `title` suggestions: your earned titles, then "No title" */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  await interaction.respond(titleChoices(interaction.guildId, interaction.user.id, focused?.value));
}

export async function execute(interaction) {
  const title = interaction.options.getString('title');
  if (title) {
    const picked = interaction.options.get('user');
    if (picked?.user && picked.user.id !== interaction.user.id) {
      await interaction.reply({ content: TITLE_REFUSALS.notYours, flags: MessageFlags.Ephemeral });
      return;
    }
    // Picked from the list the value is the title's key; typed, it's the
    // title's name ("Red Shirt") or "No title"
    const off = title === 'none' || ['none', 'notitle'].includes(typedForm(title));
    const key = off ? null : (resolveTyped(title, TITLE_BY_KEY, (t) => t.title) ?? title);
    const set = setShownTitle(interaction.guildId, interaction.user.id, key);
    if (!set.ok) {
      await interaction.reply({ content: TITLE_REFUSALS[set.reason], flags: MessageFlags.Ephemeral });
      return;
    }
  }

  await replyWithGameCard(interaction, {
    picked: interaction.options.get('user'),
    period: interaction.options.getString('period') || 'all-time',
    game: interaction.options.getString('game') || 'all',
    // `?? false`: unset is null, and a deliberate false must stay false
    ephemeral: interaction.options.getBoolean('private') ?? false,
  });
}
