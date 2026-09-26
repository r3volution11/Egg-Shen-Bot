import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField } from 'discord.js';
import {
  searchMovies,
  searchTVShows,
  getMovieDetails,
  getTVShowDetails,
  getUnifiedMovieWatchProviders,
  getUnifiedTVWatchProviders,
  getBackdropUrl,
  getPosterUrl,
} from '../services/tmdbService.js';
import { hybridSearch, generateAnnouncementText } from '../services/aiService.js';
import { normalizeProviders } from '../utils/embedBuilder.js';
import { isAdmin, loadGuildConfig, getAiTextEnabled } from '../utils/guildConfig.js';

/**
 * /announce posts the two announcements a watch party needs, at the two
 * moments it needs them:
 *
 *   party    — the advance notice, usually an hour or more ahead. Full detail:
 *              title(s), start time, where to stream it, optional AI flavor.
 *   starting — the short nudge minutes before the timer starts.
 *
 * Both POST publicly. An earlier version handed back an ephemeral code block
 * for a moderator to copy and paste, which meant the bot's nicest output
 * depended on someone doing clerical work first.
 *
 * A manually written `message` is the primary path — it posts verbatim with no
 * AI call at all. AI is optional flair that only runs when the server has it
 * enabled AND no message was supplied.
 */

/** Discord's embed title cap, which discord.js throws past. */
const MAX_EMBED_TITLE = 256;

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
  );

/**
 * Resolve a title to its TMDB details + streaming availability, or null if
 * nothing was found. Always uses the top search result — /announce posts in one
 * shot, so there's no picker step for ambiguous titles.
 */
async function resolveSegment(title, episodes, region) {
  const [movieResults, tvResults] = await Promise.all([
    hybridSearch(title, searchMovies, 'movie'),
    hybridSearch(title, searchTVShows, 'tv'),
  ]);

  // If episodes were given, prefer a TV match (that's clearly the intent);
  // otherwise prefer whichever type matched first/best.
  const preferTV = !!episodes;
  const tvMatch = tvResults?.[0];
  const movieMatch = movieResults?.[0];
  const type = preferTV && tvMatch ? 'tv' : (movieMatch ? 'movie' : (tvMatch ? 'tv' : null));

  if (!type) {
    return null;
  }

  if (type === 'movie') {
    const details = await getMovieDetails(movieMatch.id);
    const imdbId = details.external_ids?.imdb_id;
    const watchProviders = await getUnifiedMovieWatchProviders(movieMatch.id, imdbId, region);
    return {
      type: 'movie',
      title: details.title,
      overview: details.overview,
      episodes: null,
      artUrl: pickArtUrl(details),
      streamingText: buildStreamingLine(watchProviders),
    };
  }

  const details = await getTVShowDetails(tvMatch.id);
  const imdbId = details.external_ids?.imdb_id;
  const watchProviders = await getUnifiedTVWatchProviders(tvMatch.id, imdbId, region);
  return {
    type: 'tv',
    title: details.name,
    overview: details.overview,
    episodes: episodes || null,
    artUrl: pickArtUrl(details),
    streamingText: buildStreamingLine(watchProviders),
  };
}

/**
 * The image for an announcement card, preferring the 16:9 backdrop.
 *
 * Discord gives no control over an embed image's display size — setImage
 * always fills the card width — so aspect ratio is the only lever on how much
 * channel the card occupies. At a fixed width a backdrop is roughly half the
 * height of a 2:3 poster. Falls back to the poster, since plenty of older or
 * obscure titles have no backdrop and losing the art would be worse than a
 * taller card.
 */
function pickArtUrl(details) {
  if (details?.backdrop_path) return getBackdropUrl(details.backdrop_path, 'w780');
  if (details?.poster_path) return getPosterUrl(details.poster_path, 'w342');
  return null;
}

/**
 * Build a single "Available to stream on X, Y" line from unified watch
 * provider data — a shorter, single-line variant of embedBuilder.js's
 * buildStreamingText (which includes rent/buy/link sections not wanted here).
 */
function buildStreamingLine(watchProviders) {
  if (!watchProviders?.flatrate || watchProviders.flatrate.length === 0) {
    return null;
  }
  // Cap at 4 services for a clean single line — TMDB/Watchmode often list many
  // near-duplicate storefronts (e.g. "Amazon Prime Video" vs "Prime Video");
  // showing all of them would read as noise rather than a helpful summary.
  const services = normalizeProviders(watchProviders.flatrate).slice(0, 4).join(' and ');
  return `Available to stream on ${services}`;
}

/**
 * Plain, non-AI template. Used whenever AI text isn't in play: the server
 * disabled it, the operator set no API key, or the call failed.
 */
function buildFallbackText(segments, timeText, host) {
  const titles = segments.map(s => s.episodes ? `*${s.title}* (${s.episodes})` : `*${s.title}*`).join(' and ');
  const hostLine = host ? ` Hosted by ${host}.` : '';
  return `Join us for a watch party! Tonight we're watching ${titles}.${hostLine}\n\nStarts at **${timeText}**.`;
}

/**
 * Where to post, and whether we're actually able to.
 *
 * Checked up front rather than letting channel.send() throw, so a missing
 * permission reports itself as "I can't post there" instead of the generic
 * error — and, critically, so we never tell someone their announcement went
 * out when it didn't.
 */
function resolveTargetChannel(interaction) {
  const target = interaction.options.getChannel('channel') || interaction.channel;

  if (!target) {
    return { error: '❌ Couldn\'t work out which channel to post in. Try passing `channel` explicitly.' };
  }

  const me = interaction.guild?.members?.me;
  if (me && typeof target.permissionsFor === 'function') {
    const perms = target.permissionsFor(me);
    const needed = [
      [PermissionsBitField.Flags.ViewChannel, 'view'],
      [PermissionsBitField.Flags.SendMessages, 'send messages in'],
      [PermissionsBitField.Flags.EmbedLinks, 'embed links in'],
    ];
    for (const [flag, what] of needed) {
      if (perms && !perms.has(flag)) {
        return { error: `❌ I don't have permission to ${what} ${target}. Give me access there, or pick another channel.` };
      }
    }
  }

  return { channel: target };
}

/**
 * The ping line. A mention inside an embed NEVER notifies anyone — only
 * message content does — so anything meant to get attention goes here.
 */
function buildPingContent(role, headline) {
  const ping = role ? `${role} ` : '';
  return `${ping}${headline}`;
}

/** Trim a title to what an embed title can hold, leaving room for a prefix. */
function fitTitle(prefix, text) {
  const room = MAX_EMBED_TITLE - prefix.length;
  return `${prefix}${text.length > room ? `${text.slice(0, room - 1)}…` : text}`;
}

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
  return handleParty(interaction);
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
    const region = guildConfig.region || 'US';

    const segmentInputs = [{ title: title1, episodes: episodes1 }];
    if (title2) {
      segmentInputs.push({ title: title2, episodes: episodes2 });
    }

    const resolvedSegments = await Promise.all(
      segmentInputs.map(s => resolveSegment(s.title, s.episodes, region))
    );

    const notFound = segmentInputs
      .map((s, i) => (resolvedSegments[i] ? null : s.title))
      .filter(Boolean);

    if (notFound.length > 0) {
      await interaction.editReply({
        content: `❌ Couldn't find: ${notFound.map(t => `**${t}**`).join(', ')}. Check the spelling and try again.`,
      });
      return;
    }

    // A manual message is the point of the option: post it as written, make no
    // AI call, spend nothing. AI only fills in when nothing was written AND the
    // server wants it.
    let bodyText = manualMessage;
    let usedAi = false;

    if (!bodyText) {
      if (getAiTextEnabled(guildConfig)) {
        const flavorText = await generateAnnouncementText({
          segments: resolvedSegments,
          tone,
          customTone,
          timeText,
          host,
        });
        if (flavorText) {
          bodyText = flavorText;
          usedAi = true;
        }
      }
      bodyText = bodyText || buildFallbackText(resolvedSegments, timeText, host);
    }

    const titles = resolvedSegments
      .map(s => (s.episodes ? `${s.title} (${s.episodes})` : s.title))
      .join(' + ');

    const streamingLines = resolvedSegments
      .map(s => s.streamingText)
      .filter(Boolean)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xFF6B9D)
      .setTitle(fitTitle('🍿 Watch Party: ', titles))
      .setDescription(bodyText)
      .addFields({
        name: '🕒 Starts',
        value: timeText,
        inline: true,
      })
      .setTimestamp();

    if (host) {
      embed.addFields({ name: '🎤 Hosted by', value: host, inline: true });
    }
    if (streamingLines) {
      embed.addFields({ name: '📺 Where to watch', value: streamingLines.slice(0, 1024), inline: false });
    }

    const artUrl = resolvedSegments.find(s => s.artUrl)?.artUrl;
    if (artUrl) embed.setImage(artUrl);

    await target.channel.send({
      content: buildPingContent(role, `🍿 **Watch party:** ${titles} — starts at **${timeText}**`),
      embeds: [embed],
    });

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
