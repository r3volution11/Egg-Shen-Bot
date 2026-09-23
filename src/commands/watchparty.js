/**
 * /watchparty — an alias kept for the name people already reach for.
 *
 * `/watchparty remind` and `/timer remind` are the same feature. This file
 * used to carry its own byte-for-byte copy of the event lookup, the TMDB
 * search and the announcement builder — roughly 300 lines duplicated from
 * timer.js — which meant a fix landing in one silently skipped the other.
 * That is exactly what happened with the year-suffix handling: an event
 * named "The Covenant (2006)" searched TMDB literally, found nothing, and
 * the announcement lost its poster, runtime and overview in both places.
 *
 * Now it delegates. The command stays registered because it is documented
 * and people use it.
 */

import { SlashCommandBuilder } from 'discord.js';
import { runRemind } from './timer.js';

export const data = new SlashCommandBuilder()
  .setName('watchparty')
  .setDescription('Watch party timer announcements')
  .addSubcommand(subcommand =>
    subcommand
      .setName('remind')
      .setDescription('🎬 Announce that the timer is about to start')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Optional custom message (e.g., "Everyone ready?")')
          .setRequired(false)
          .setMaxLength(200)
      )
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Optional role to ping')
          .setRequired(false)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'remind') {
    await runRemind(interaction, 'Watch Party');
    return;
  }

  await interaction.reply({
    content: '❌ Unknown subcommand.',
    ephemeral: true,
  });
}
