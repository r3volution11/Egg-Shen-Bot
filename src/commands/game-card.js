import { ContextMenuCommandBuilder, ApplicationCommandType, InteractionContextType } from 'discord.js';
import { replyWithGameCard } from '../utils/gameCard.js';

// Right-click a member → Apps → "Game card". The same card /scoreboard shows,
// one click from anyone you see in a channel. Guild-only: scores belong to a
// server, so there is nothing to show in a DM.
export const data = new ContextMenuCommandBuilder()
  .setName('Game card')
  .setType(ApplicationCommandType.User)
  .setContexts(InteractionContextType.Guild);

export async function execute(interaction) {
  // Ephemeral always: a right-click is a lookup, and a public card for every
  // peek at someone's score would clutter the channel (and a member who hasn't
  // played would be announced as such). /scoreboard is the public way. The
  // clicked member arrives as the `user` option, the same shape /scoreboard's
  // own option has, so one card builder serves both. Games being switched off,
  // bots and "hasn't played yet" are the card's to handle, not this command's.
  await replyWithGameCard(interaction, { picked: interaction.options.get('user'), ephemeral: true });
}
