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
 *
 * `/watchparty ready` (2.63.0) is its own feature: a ready check — see
 * readyCheckManager.js.
 */

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isAdmin } from '../utils/guildConfig.js';
import { runRemind } from './timer.js';
import { findEventForChannel, fetchInterestedUserIds } from '../utils/scheduledEventLookup.js';
import { openCheck, setMessage, buildReadyCard, redrawCard, getCheck, closeCheck, countOf } from '../utils/readyCheckManager.js';

// "Around now" for matching a scheduled party that hasn't started yet
const EVENT_WINDOW_MS = 2 * 60 * 60 * 1000;

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
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('ready')
      .setDescription('✅ Ask who is ready to start, and tally the answers')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Optional message (e.g., "Starting in 5!")')
          .setRequired(false)
          .setMaxLength(200)
      )
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Optional role to ping')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('ready-close')
      .setDescription('🔒 Stop taking answers on this channel\'s ready check')
  );

/**
 * Close the channel's ready check early. Whoever posted it, or a mod — the
 * same people who can stop a timer they didn't start.
 */
async function runReadyClose(interaction) {
  const check = getCheck(interaction.channelId);
  if (!check || check.closed) {
    await interaction.reply({ content: '❌ There\'s no open ready check in this channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (check.hostId !== interaction.user.id && !isAdmin(interaction.member)) {
    await interaction.reply({ content: `❌ Only <@${check.hostId}>, who posted it, or a moderator can close this ready check.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const closed = closeCheck(interaction.channelId, 'host');
  await redrawCard(interaction.client, closed);
  await interaction.reply({ content: `🔒 Ready check closed: ${countOf(closed, 'ready')} ready, ${countOf(closed, 'minute')} needed a minute.`, flags: MessageFlags.Ephemeral });
}

/**
 * Post a ready check. If a watch party is scheduled for this channel around
 * now (or running), the card also compares answers with who marked the
 * event Interested; otherwise it's a plain tally.
 */
async function runReady(interaction) {
  await interaction.deferReply();

  const event = interaction.guild
    ? await findEventForChannel(interaction.guild, interaction.channelId, { includeScheduled: true, startsWithinMs: EVENT_WINDOW_MS, logPrefix: 'Ready Check' })
    : null;
  const interested = event ? await fetchInterestedUserIds(event) : null;

  const { check, replaced } = openCheck({
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    hostId: interaction.user.id,
    message: interaction.options.getString('message'),
    event,
    interested,
  });
  if (replaced) await redrawCard(interaction.client, { ...replaced, closed: { reason: 'replaced', at: Date.now() } });

  // The role ping goes in content: mentions inside an embed never ping
  const role = interaction.options.getRole('role');
  const reply = await interaction.editReply({
    content: role ? `${role} Are you ready?` : undefined,
    ...buildReadyCard(check),
    allowedMentions: role ? { roles: [role.id] } : { parse: [] },
  });
  setMessage(interaction.channelId, check.id, reply.channelId || interaction.channelId, reply.id);
}

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'remind') {
    await runRemind(interaction, 'Watch Party');
    return;
  }

  if (subcommand === 'ready') {
    await runReady(interaction);
    return;
  }

  if (subcommand === 'ready-close') {
    await runReadyClose(interaction);
    return;
  }

  await interaction.reply({
    content: '❌ Unknown subcommand.',
    ephemeral: true,
  });
}
