import { SlashCommandBuilder } from 'discord.js';
import { TOPICS, replyWithHowToPlay } from '../utils/howToPlay.js';

/**
 * /how-to-play — quick help for the games (/potion, /foodfight, /doom,
 * /rescue, /siege and everything they add up to): one short card per
 * topic, with a menu and ◀ Previous / Next ▶ to the others. The cards, the
 * numbers (read from the code and this server's settings) and the buttons'
 * handler are in src/utils/howToPlay.js.
 *
 * Private by default, unlike most commands: help is usually just for the
 * asker, and `private:false` shows it to the channel (to explain the games
 * to everyone). Read with `?? true`, as /timer status reads `public` —
 * getBoolean is null when unset, and `||` would swallow a deliberate false.
 *
 * Not behind a command switch, like /eggshen-help: with every game off it
 * says so.
 */

export const data = new SlashCommandBuilder()
  .setName('how-to-play')
  .setDescription('How the games work: items, prizes, titles, nights, twists, happenings, sieges')
  .addStringOption(option => option
    .setName('topic')
    .setDescription('What to explain (default: the basics)')
    .setRequired(false)
    .addChoices(...TOPICS.map(t => ({ name: t.name, value: t.key }))))
  .addBooleanOption(option => option
    .setName('private')
    .setDescription('Only you see it (default: true). false shows it to the channel')
    .setRequired(false));

export async function execute(interaction) {
  await replyWithHowToPlay(interaction, {
    topic: interaction.options.getString('topic') || 'basics',
    isPrivate: interaction.options.getBoolean('private') ?? true,
  });
}
