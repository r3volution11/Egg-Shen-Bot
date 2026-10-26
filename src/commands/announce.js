import { SlashCommandBuilder, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { isAdmin, loadGuildConfig, getAiTextEnabled, getStartingSoonEnabled } from '../utils/guildConfig.js';
import { resolveSegment, composePartyPost, channelProblem, buildPingContent, fitTitle } from '../utils/announcementCompose.js';
import { scheduleAnnouncement, listAnnouncements, dueAt } from '../utils/announcementStore.js';
import { fetchUpcomingEvents, eventChoice } from '../utils/upcomingEvents.js';
import { parseEventEpisodeRange, stripTrailingYear } from '../utils/episodeRangeParser.js';

/**
 * /announce posts the two announcements a watch party needs, at the two
 * moments it needs them:
 *
 *   party     — the advance notice, usually an hour or more ahead. Full detail:
 *               title(s), start time, where to stream it, optional AI flavor.
 *   schedule  — the same card, posted automatically a set time before one of
 *               the server's scheduled events (announcementScheduler.js).
 *               `scheduled` lists what's queued, with Cancel buttons.
 *   starting  — the short nudge minutes before the timer starts. (Scheduled
 *               events also get one automatically, 10 minutes ahead.)
 *
 * Both POST publicly. An earlier version handed back an ephemeral code block
 * for a moderator to copy and paste, which meant the bot's nicest output
 * depended on someone doing clerical work first.
 *
 * A manually written `message` is the primary path — it posts verbatim with no
 * AI call at all. AI is optional flair that only runs when the server has it
 * enabled AND no message was supplied.
 */

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Announce a watch party to the channel (Admin/Moderator only)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('party')
      .setDescription('Announce an upcoming watch party (an hour or more ahead)')
      .addStringOption(option =>
        option
          .setName('title1')
          .setDescription('First movie or TV show title')
          .setRequired(true)
          .setMaxLength(200)
      )
      .addStringOption(option =>
        option
          .setName('time')
          .setDescription('Start time to include in the announcement (e.g. "8:00 PM EST")')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Your own announcement text — posted exactly as written, instead of AI')
          .setRequired(false)
          .setMaxLength(1500)
      )
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Where to post it (default: this channel)')
          .setRequired(false)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Role to ping — pinged in the message itself, so it actually notifies')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('episodes1')
          .setDescription('Episode(s) for title1 if it\'s a TV show (e.g. "S3E9-E12")')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('title2')
          .setDescription('Second movie or TV show title, if watching two things back-to-back')
          .setRequired(false)
          .setMaxLength(200)
      )
      .addStringOption(option =>
        option
          .setName('episodes2')
          .setDescription('Episode(s) for title2 if it\'s a TV show')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('host')
          .setDescription('Who\'s hosting (a name, persona, or @mention)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('tone')
          .setDescription('Tone for AI-written text (ignored if you supply your own message)')
          .setRequired(false)
          .addChoices(
            { name: 'Funny', value: 'funny' },
            { name: 'Scary', value: 'scary' },
            { name: 'Dramatic', value: 'dramatic' },
            { name: 'Wholesome', value: 'wholesome' },
            { name: 'Mysterious', value: 'mysterious' }
          )
      )
      .addStringOption(option =>
        option
          .setName('custom-tone')
          .setDescription('Custom tone instead of the presets (e.g. "like a noir detective")')
          .setRequired(false)
          .setMaxLength(200)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('starting')
      .setDescription('Announce that the watch party is about to start')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('e.g. "Starting in 10 minutes" or "Starting at 9:35 pm"')
          .setRequired(true)
          .setMaxLength(500)
      )
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('What\'s being watched — adds the artwork')
          .setRequired(false)
          .setMaxLength(200)
      )
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Where to post it (default: this channel)')
          .setRequired(false)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Role to ping — pinged in the message itself, so it actually notifies')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('schedule')
      .setDescription('Post the watch-party card automatically, a set time before a scheduled event')
      .addStringOption(option =>
        option
          .setName('event')
          .setDescription('The upcoming event (start typing to search)')
          .setRequired(true)
          .setMaxLength(100)
          .setAutocomplete(true)
      )
      .addIntegerOption(option =>
        option
          .setName('hours')
          .setDescription('Hours before the event starts')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(336)
      )
      .addIntegerOption(option =>
        option
          .setName('minutes')
          .setDescription('Plus minutes (default 0)')
          .setMinValue(0)
          .setMaxValue(59)
      )
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Where to post it (default: this channel)')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
      .addRoleOption(option =>
        option.setName('role').setDescription('Role to ping when it posts')
      )
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Your own announcement text, instead of AI')
          .setMaxLength(1500)
      )
      .addStringOption(option =>
        option
          .setName('title1')
          .setDescription('What\'s being watched, if the event name isn\'t the title')
          .setMaxLength(200)
      )
      .addStringOption(option =>
        option.setName('episodes1').setDescription('Episode(s) for title1, e.g. "S3E9-E12"').setMaxLength(100)
      )
      .addStringOption(option =>
        option.setName('title2').setDescription('A second title, if watching two back-to-back').setMaxLength(200)
      )
      .addStringOption(option =>
        option.setName('host').setDescription('Who\'s hosting').setMaxLength(100)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('scheduled')
      .setDescription('See and cancel announcements waiting to post')
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      content: '❌ You need Administrator, Manage Server, or Moderator permissions to use `/announce`.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'starting') {
    return handleStarting(interaction);
  }
  if (subcommand === 'schedule') {
    return handleSchedule(interaction);
  }
  if (subcommand === 'scheduled') {
    return interaction.reply({ ...scheduledView(interaction.guildId), ephemeral: true });
  }
  return handleParty(interaction);
}

/** The channel to post in, or an error line. */
function resolveTargetChannel(interaction) {
  const target = interaction.options.getChannel('channel') || interaction.channel;
  const problem = channelProblem(target, interaction.guild?.members?.me);
  return problem ? { error: problem } : { channel: target };
}

/**
 * The advance notice: what's on, when, where to stream it.
 */
async function handleParty(interaction) {
  // Ephemeral: the confirmation is for the moderator, the announcement itself
  // is the public post.
  await interaction.deferReply({ ephemeral: true });

  const title1 = interaction.options.getString('title1');
  const episodes1 = interaction.options.getString('episodes1');
  const title2 = interaction.options.getString('title2');
  const episodes2 = interaction.options.getString('episodes2');
  const timeText = interaction.options.getString('time');
  const host = interaction.options.getString('host');
  const tone = interaction.options.getString('tone');
  const customTone = interaction.options.getString('custom-tone');
  const manualMessage = interaction.options.getString('message');
  const role = interaction.options.getRole('role');

  const target = resolveTargetChannel(interaction);
  if (target.error) {
    await interaction.editReply({ content: target.error });
    return;
  }

  try {
    const guildConfig = await loadGuildConfig(interaction.guildId);

    const segments = [{ title: title1, episodes: episodes1 }];
    if (title2) {
      segments.push({ title: title2, episodes: episodes2 });
    }

    const built = await composePartyPost({
      segments, timeText, host, tone, customTone, manualMessage, role, guildConfig,
    });

    if (built.notFound) {
      await interaction.editReply({
        content: `❌ Couldn't find: ${built.notFound.map(t => `**${t}**`).join(', ')}. Check the spelling and try again.`,
      });
      return;
    }
    const usedAi = built.usedAi;

    await target.channel.send(built.payload);

    // Say which text was used when it wasn't what they asked for, so nobody is
    // left wondering why an announcement reads generically.
    let note = '';
    if (!manualMessage && !usedAi) {
      note = getAiTextEnabled(guildConfig)
        ? '\n\nℹ️ AI text wasn\'t available, so this used the plain template. Supply `message` to write your own.'
        : '\n\nℹ️ AI text is turned off on this server, so this used the plain template.';
    }

    await interaction.editReply({
      content: `✅ Announcement posted in ${target.channel}.${note}`,
    });
  } catch (error) {
    console.error('[Announce] party failed:', error);
    await interaction.editReply({
      content: '❌ An error occurred while posting the announcement. Please try again later.',
    });
  }
}

/**
 * The short nudge minutes before the timer starts.
 *
 * `message` is required here and always posts as written — there is nothing for
 * AI to add to "Starting in 10 minutes", and a timing claim is the one thing
 * that must never be paraphrased. `title` is optional and only adds artwork.
 */
async function handleStarting(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const message = interaction.options.getString('message');
  const title = interaction.options.getString('title');
  const role = interaction.options.getRole('role');

  const target = resolveTargetChannel(interaction);
  if (target.error) {
    await interaction.editReply({ content: target.error });
    return;
  }

  try {
    let artUrl = null;
    let resolvedTitle = title;

    if (title) {
      const guildConfig = await loadGuildConfig(interaction.guildId);
      const segment = await resolveSegment(title, null, guildConfig.region || 'US');
      // An unrecognised title is not worth failing over — the timing is the
      // message, the artwork is decoration. Post it with what was typed.
      if (segment) {
        artUrl = segment.artUrl;
        resolvedTitle = segment.title;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(resolvedTitle ? fitTitle('🎬 Starting soon: ', resolvedTitle) : '🎬 Starting soon')
      .setDescription(message)
      .setFooter({ text: `Posted by ${interaction.user.username}` })
      .setTimestamp();

    if (artUrl) embed.setImage(artUrl);

    const headline = resolvedTitle
      ? `🎬 **${resolvedTitle}** — ${message}`
      : `🎬 ${message}`;

    await target.channel.send({
      content: buildPingContent(role, headline),
      embeds: [embed],
    });

    await interaction.editReply({ content: `✅ Posted in ${target.channel}.` });
  } catch (error) {
    console.error('[Announce] starting failed:', error);
    await interaction.editReply({
      content: '❌ An error occurred while posting. Please try again later.',
    });
  }
}

// ── scheduled announcements ─────────────────────────────────────────────

/** "1h 30m" from minutes. */
function leadText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m';
}

/**
 * What an event is showing, from its name and description: "Severance" with
 * "S2E1-E3" when the event spells out episodes, and never the year a host
 * added to tell films apart (TMDB searches it literally and finds nothing).
 */
function segmentFromEvent(event) {
  const range = parseEventEpisodeRange(event.name, event.description);
  if (range) {
    const eps = range.episodeEnd > range.episodeStart
      ? `S${range.season}E${range.episodeStart}-E${range.episodeEnd}`
      : `S${range.season}E${range.episodeStart}`;
    return { title: stripTrailingYear(range.showName).title || range.showName, episodes: eps };
  }
  return { title: stripTrailingYear(event.name).title || event.name, episodes: null };
}

/**
 * The event a moderator picked. Autocomplete sends its id; someone who typed
 * a name and pressed Enter without picking sends the text, so a name that
 * matches exactly one upcoming event is accepted too.
 */
function findEvent(events, picked) {
  const byId = events.find(e => e.id === picked);
  if (byId) return byId;
  const wanted = String(picked || '').trim().toLowerCase();
  const exact = events.filter(e => e.name.toLowerCase() === wanted);
  if (exact.length === 1) return exact[0];
  const partial = events.filter(e => e.name.toLowerCase().includes(wanted));
  return partial.length === 1 ? partial[0] : null;
}

/**
 * Queue the full watch-party card for a set time before a scheduled event.
 * The titles are checked now, so a typo surfaces while the moderator is
 * here rather than as a silent failure hours later.
 */
async function handleSchedule(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const now = Date.now();

  const events = await fetchUpcomingEvents(interaction.guild, now, { fresh: true }).catch(() => null);
  if (!events) {
    await interaction.editReply({ content: '❌ I couldn\'t load this server\'s scheduled events. Check I can see them, then try again.' });
    return;
  }
  const event = findEvent(events, interaction.options.getString('event'));
  if (!event) {
    await interaction.editReply({
      content: events.length
        ? '❌ Pick an event from the list that appears as you type in `event`.'
        : '❌ There are no upcoming scheduled events. Create one in Discord first (Events → Create Event).',
    });
    return;
  }

  const lead = (interaction.options.getInteger('hours') || 0) * 60 + (interaction.options.getInteger('minutes') || 0);
  const startsAt = event.scheduledStartTimestamp;
  const unixStart = Math.floor(startsAt / 1000);
  if (lead === 0) {
    await interaction.editReply({ content: '❌ Set `hours` and/or `minutes` — how long before the start the card should post.' });
    return;
  }
  const due = startsAt - lead * 60_000;
  if (due <= now) {
    await interaction.editReply({
      content: `❌ **${event.name}** starts <t:${unixStart}:R>, so ${leadText(lead)} before it has already passed. Pick a shorter time, or post it now with \`/announce party\`.`,
    });
    return;
  }

  const target = resolveTargetChannel(interaction);
  if (target.error) {
    await interaction.editReply({ content: target.error });
    return;
  }

  const title1 = interaction.options.getString('title1');
  const title2 = interaction.options.getString('title2');
  const segments = title1
    ? [{ title: title1, episodes: interaction.options.getString('episodes1') }]
    : [segmentFromEvent(event)];
  if (title2) segments.push({ title: title2, episodes: null });

  const guildConfig = await loadGuildConfig(interaction.guildId);
  const resolved = await Promise.all(segments.map(seg => resolveSegment(seg.title, seg.episodes, guildConfig.region || 'US').catch(() => null)));
  const missing = segments.filter((seg, i) => !resolved[i]).map(seg => seg.title);
  if (missing.length) {
    await interaction.editReply({
      content: `❌ Couldn't find ${missing.map(t => `**${t}**`).join(', ')} on TMDB.` +
        (title1 ? ' Check the spelling.' : ' If the event name isn\'t the title, say what\'s showing with `title1`.'),
    });
    return;
  }

  const role = interaction.options.getRole('role');
  scheduleAnnouncement({
    guildId: interaction.guildId,
    eventId: event.id,
    eventName: event.name,
    startsAt,
    offsetMs: lead * 60_000,
    channelId: target.channel.id,
    createdBy: interaction.user.id,
    post: {
      segments,
      host: interaction.options.getString('host'),
      manualMessage: interaction.options.getString('message'),
      roleId: role?.id || null,
    },
  }, now);

  const unixDue = Math.floor(due / 1000);
  const soon = getStartingSoonEnabled(guildConfig)
    ? '\n\n🎬 A short "starting soon" card also goes in the event\'s channel 10 minutes before it starts.'
    : '';
  await interaction.editReply({
    content:
      `✅ Scheduled: the watch-party card for **${resolved.map(r => r.title).join(' + ')}** posts in ${target.channel} ` +
      `<t:${unixDue}:F> (<t:${unixDue}:R>), ${leadText(lead)} before **${event.name}** starts.\n` +
      `If the event is moved, the announcement moves with it; if it's cancelled, so is this. See or cancel it with \`/announce scheduled\`.${soon}`,
  });
}

const STATUS_LINE = {
  posted: '✅ posted',
  failed: '❌ failed',
  cancelled: '🚫 cancelled',
  missed: '⏭️ skipped',
  posting: '⏳ posting',
};

/**
 * What's queued (with Cancel buttons) and what happened recently. Ephemeral,
 * but the buttons check for a moderator anyway (CLAUDE.md).
 */
export function scheduledView(guildId, { note = null } = {}) {
  const all = listAnnouncements(guildId);
  const pending = all.filter(a => a.status === 'pending').slice(0, 20);
  const recent = all
    .filter(a => a.status !== 'pending')
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
    .slice(0, 5);

  const lines = pending.map((a, i) => {
    const unix = Math.floor(dueAt(a) / 1000);
    return `**${i + 1}.** **${a.eventName}** → <#${a.channelId}> · <t:${unix}:f> (<t:${unix}:R>), ${leadText(a.offsetMs / 60_000)} before it starts`;
  });
  const history = recent.map(a => `${STATUS_LINE[a.status] || a.status} · **${a.eventName}** → <#${a.channelId}>${a.reason ? ` — ${a.reason}` : ''}`);

  const embed = new EmbedBuilder()
    .setColor(0xFF6B9D)
    .setTitle('📅 Scheduled announcements')
    .setDescription(
      (note ? `${note}\n\n` : '') +
      (lines.length ? lines.join('\n') : '*Nothing waiting to post. Queue one with `/announce schedule`.*') +
      (history.length ? `\n\n**Recently**\n${history.join('\n')}` : '')
    );

  const rows = [];
  for (let i = 0; i < pending.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      pending.slice(i, i + 5).map((a, j) => new ButtonBuilder()
        .setCustomId(`ann_cancel_${a.id}`)
        .setLabel(`Cancel ${i + j + 1}`)
        .setStyle(ButtonStyle.Danger))
    ));
  }
  return { content: '', embeds: [embed], components: rows.slice(0, 4) };
}

/** A Cancel button from /announce scheduled. */
export async function handleCancelButton(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ content: '❌ Only admins and moderators can cancel scheduled announcements.', ephemeral: true });
    return;
  }
  const { cancelAnnouncement } = await import('../utils/announcementStore.js');
  const id = interaction.customId.slice('ann_cancel_'.length);
  const result = cancelAnnouncement(interaction.guildId, id);
  const note = result.error === 'not-pending'
    ? `ℹ️ **${result.announcement.eventName}** had already ${result.announcement.status === 'posted' ? 'posted' : 'finished'}.`
    : result.error
      ? 'ℹ️ That announcement no longer exists.'
      : `🚫 Cancelled the announcement for **${result.announcement.eventName}**.`;
  await interaction.update(scheduledView(interaction.guildId, { note }));
}

/** `event`: upcoming scheduled events, soonest first, filtered by what's typed. */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'event' || !isAdmin(interaction.member)) {
    await interaction.respond([]);
    return;
  }
  const now = Date.now();
  const events = await fetchUpcomingEvents(interaction.guild, now).catch(() => []);
  const typed = String(focused.value || '').toLowerCase();
  const choices = events
    .filter(e => !typed || e.name.toLowerCase().includes(typed))
    .slice(0, 25)
    .map(e => eventChoice(e, now));
  await interaction.respond(choices);
}

