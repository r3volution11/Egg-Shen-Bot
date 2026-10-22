/**
 * /escape — Escape Velocity, the player side. A multi-day genre trivia event
 * in the style of Who Wants to Be a Millionaire?: climb 15 stages, one launch
 * a day, best run counts. Admins run it with /escape-setup.
 *
 * `play` sorts first in Discord's picker on purpose: subcommands are listed
 * alphabetically, and it's the one people reach for.
 */

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { canUseCommand } from '../utils/guildConfig.js';
import { loadEvent } from '../utils/escapeStore.js';
import { rulesEmbed, standingsEmbed } from '../utils/escapeUI.js';
import { launchFor, notLiveText } from '../handlers/escapeHandler.js';

export const data = new SlashCommandBuilder()
  .setName('escape')
  .setDescription('🚀 Escape Velocity: climb 15 stages of genre trivia to reach orbit')
  .addSubcommand(sub => sub
    .setName('play')
    .setDescription('Launch today\'s run, or pick up where you left off'))
  .addSubcommand(sub => sub
    .setName('rules')
    .setDescription('How Escape Velocity works'))
  .addSubcommand(sub => sub
    .setName('standings')
    .setDescription('Who\'s closest to orbit')
    .addBooleanOption(o => o
      .setName('private')
      .setDescription('Only show the standings to you (default: false)')));

export async function execute(interaction) {
  if (!(await canUseCommand(interaction.guildId, interaction.member, 'escape'))) {
    await interaction.reply({ content: '❌ Escape Velocity is turned off on this server.', flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'rules') {
    await interaction.reply({ embeds: [rulesEmbed()], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'standings') {
    const data = loadEvent(interaction.guildId);
    if (!data || !['live', 'finished'].includes(data.event.status)) {
      await interaction.reply({ content: notLiveText(data), flags: MessageFlags.Ephemeral });
      return;
    }
    const isPrivate = interaction.options.getBoolean('private') ?? false;
    await interaction.reply({
      embeds: [standingsEmbed(data)],
      allowedMentions: { parse: [] },
      ...(isPrivate ? { flags: MessageFlags.Ephemeral } : {}),
    });
    return;
  }

  // play
  await interaction.reply({ ...launchFor(interaction), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}
