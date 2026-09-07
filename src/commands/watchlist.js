import { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  toggleWant,
  sortWatchlist,
  pickFromWatchlist,
  clearWatchlist,
  searchWatchlist,
  wantCount,
  DEFAULT_MAX_SIZE,
} from '../utils/watchlistManager.js';
import { loadGuildConfig, isAdmin, isModerator, canUseCommand } from '../utils/guildConfig.js';
import { trackSearch } from '../utils/statsTracker.js';

const TYPE_ICON = { movie: '🎬', tv: '📺' };

export const data = new SlashCommandBuilder()
  .setName('watchlist')
  .setDescription('The server watchlist — what you plan to watch next')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add a movie or TV show to the watchlist')
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Movie or TV show title')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('note')
          .setDescription('Why you want to watch it')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove a title from the watchlist')
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Title to remove')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('Show the watchlist')
      .addStringOption(option =>
        option
          .setName('filter')
          .setDescription('Filter by type')
          .setRequired(false)
          .addChoices(
            { name: 'All', value: 'all' },
            { name: 'Movies', value: 'movie' },
            { name: 'TV Shows', value: 'tv' }
          )
      )
      .addStringOption(option =>
        option
          .setName('sort')
          .setDescription('Sort order')
          .setRequired(false)
          .addChoices(
            { name: 'Recently added', value: 'recent' },
            { name: 'Oldest first', value: 'oldest' },
            { name: 'Most wanted', value: 'votes' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('pick')
      .setDescription('Pick something to watch from the list')
      .addStringOption(option =>
        option
          .setName('method')
          .setDescription('How to pick')
          .setRequired(false)
          .addChoices(
            { name: 'Random', value: 'random' },
            { name: 'Most wanted', value: 'votes' },
            { name: 'Longest waiting', value: 'oldest' }
          )
      )
      .addStringOption(option =>
        option
          .setName('filter')
          .setDescription('Limit to a type')
          .setRequired(false)
          .addChoices(
            { name: 'Movies', value: 'movie' },
            { name: 'TV Shows', value: 'tv' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('want')
      .setDescription('Vote that you want to watch something (click again to undo)')
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Title to vote for')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('clear')
      .setDescription('Remove every title from the watchlist (Admin/Moderator only)')
  );

/**
 * Read a guild's watchlist settings, tolerating configs saved before this
 * feature existed — loadGuildConfig returns saved files verbatim rather than
 * merging in new defaults.
 */
function watchlistSettings(guildConfig) {
  return {
    maxSize: DEFAULT_MAX_SIZE,
    modOnlyAdd: false,
    autoAddChampion: false,
    autoRemoveWatched: true,
    ...(guildConfig.watchlist || {}),
  };
}

/** Autocomplete for `remove` and `want`: match against titles already on the list. */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const matches = await searchWatchlist(interaction.guildId, focused);

  await interaction.respond(
    matches.map(entry => ({
      name: `${TYPE_ICON[entry.type] || ''} ${entry.title}${entry.year ? ` (${entry.year})` : ''}`.trim().substring(0, 100),
      // The value must round-trip an exact identity, since titles are not unique.
      value: `${entry.type}:${entry.tmdbId}`,
    }))
  );
}

/** Parse the `type:tmdbId` value produced by autocomplete. */
function parseTitleValue(raw) {
  const match = /^(movie|tv):(\d+)$/.exec(raw || '');
  return match ? { type: match[1], tmdbId: match[2] } : null;
}

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'watchlist');
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ You do not have permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  const guildConfig = await loadGuildConfig(interaction.guildId);
  const settings = watchlistSettings(guildConfig);

  switch (subcommand) {
    case 'add':
      return handleAdd(interaction, settings);
    case 'remove':
      return handleRemove(interaction, settings);
    case 'list':
      return handleList(interaction);
    case 'pick':
      return handlePick(interaction);
    case 'want':
      return handleWant(interaction);
    case 'clear':
      return handleClear(interaction);
    default:
      await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
  }
}

async function handleAdd(interaction, settings) {
  const isPrivileged = isAdmin(interaction.member) || isModerator(interaction.member);
  if (settings.modOnlyAdd && !isPrivileged) {
    await interaction.reply({
      content: '❌ Only moderators can add to the watchlist on this server.',
      ephemeral: true,
    });
    return;
  }

  const title = interaction.options.getString('title');
  const note = interaction.options.getString('note');

  await interaction.deferReply();

  try {
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(title),
      searchTVShows(title),
    ]);

    const allResults = [
      ...(movieResults || []).map(r => ({ ...r, type: 'movie' })),
      ...(tvResults || []).map(r => ({ ...r, type: 'tv' })),
    ];

    if (allResults.length === 0) {
      await interaction.editReply(`No movies or TV shows found matching "${title}".`);
      return;
    }

    if (allResults.length === 1) {
      await addResolvedTitle(interaction, allResults[0].type, allResults[0].id, note, settings);
      return;
    }

    // Several matches — let the requester disambiguate.
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 20;

    const payload = Buffer.from(
      JSON.stringify({ note, userId: interaction.user.id })
    ).toString('base64');

    const options = allResults.slice(0, maxResults).map(result => {
      const resultTitle = result.title || result.name;
      const date = result.release_date || result.first_air_date;
      const yearStr = date ? ` (${date.split('-')[0]})` : '';
      const overview = result.overview
        ? `${result.overview.substring(0, 94)}...`
        : 'No description';

      return {
        label: `${resultTitle}${yearStr}`.substring(0, 100),
        description: `${TYPE_ICON[result.type]} ${overview}`.substring(0, 100),
        value: `${result.type}_${result.id}_${payload}`.substring(0, 100),
      };
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_watchlist_add')
      .setPlaceholder('Select the title to add')
      .addOptions(options);

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Select a title to add')
      .setDescription(
        `Found ${allResults.length} results for "${title}". Pick the right one below.`
      );

    await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(selectMenu)],
    });
  } catch (error) {
    console.error('Watchlist add error:', error);
    await interaction.editReply('An error occurred while searching. Please try again later.');
  }
}

/**
 * Fetch full details for a chosen title and store it. Shared by the direct
 * single-result path and the select-menu path in selectHandler.
 */
export async function addResolvedTitle(interaction, type, tmdbId, note, settings, extra = {}) {
  const details = type === 'movie'
    ? await getMovieDetails(tmdbId)
    : await getTVShowDetails(tmdbId);

  const fullTitle = details.title || details.name;
  const date = details.release_date || details.first_air_date;
  const year = date ? date.split('-')[0] : null;

  const result = await addToWatchlist(
    interaction.guildId,
    {
      tmdbId,
      type,
      title: fullTitle,
      year,
      posterUrl: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : null,
      note,
      addedBy: interaction.user.username,
      addedById: interaction.user.id,
      ...extra,
    },
    settings.maxSize
  );

  if (!result.success) {
    await interaction.editReply({ content: `❌ ${result.error}`, embeds: [], components: [] });
    return;
  }

  await trackSearch(
    interaction.guildId,
    interaction.user.id,
    interaction.user.username,
    'watchlist',
    fullTitle,
    year || ''
  );

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Added to the Watchlist')
    .setDescription(`**${fullTitle}**${year ? ` (${year})` : ''}`)
    .addFields(
      { name: 'Type', value: type === 'movie' ? 'Movie' : 'TV Show', inline: true },
      { name: 'On the list', value: `${result.total} title${result.total !== 1 ? 's' : ''}`, inline: true }
    )
    .setFooter({ text: `Added by ${interaction.user.username} • /watchlist want to vote for it` })
    .setTimestamp();

  if (note) embed.addFields({ name: 'Note', value: note, inline: false });
  if (result.entry.posterUrl) embed.setThumbnail(result.entry.posterUrl);

  await interaction.editReply({ embeds: [embed], components: [] });
}

async function handleRemove(interaction, settings) {
  const raw = interaction.options.getString('title');
  const parsed = parseTitleValue(raw);

  if (!parsed) {
    await interaction.reply({
      content: '❌ Pick a title from the autocomplete list so the right entry is removed.',
      ephemeral: true,
    });
    return;
  }

  const isPrivileged = isAdmin(interaction.member) || isModerator(interaction.member);
  const entries = await getWatchlist(interaction.guildId);
  const target = entries.find(
    e => String(e.tmdbId) === parsed.tmdbId && e.type === parsed.type
  );

  if (!target) {
    await interaction.reply({ content: '❌ That title is not on the watchlist.', ephemeral: true });
    return;
  }

  // Anyone can tidy their own addition; removing someone else's is a mod action.
  if (target.addedById !== interaction.user.id && !isPrivileged) {
    await interaction.reply({
      content: `❌ **${target.title}** was added by ${target.addedBy}. Only they or a moderator can remove it.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const result = await removeFromWatchlist(interaction.guildId, parsed.tmdbId, parsed.type);
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF9900)
    .setTitle('🗑️ Removed from the Watchlist')
    .setDescription(`**${result.removed.title}**${result.removed.year ? ` (${result.removed.year})` : ''}`)
    .setFooter({ text: `Removed by ${interaction.user.username}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction) {
  const filter = interaction.options.getString('filter') || 'all';
  const sort = interaction.options.getString('sort') || 'recent';

  await interaction.deferReply();

  const entries = await getWatchlist(interaction.guildId);

  if (entries.length === 0) {
    await interaction.editReply(
      'The watchlist is empty. Add something with `/watchlist add`.'
    );
    return;
  }

  const sorted = sortWatchlist(entries, { filter, sort });

  if (sorted.length === 0) {
    await interaction.editReply(
      `Nothing on the watchlist matches that filter (${entries.length} title${entries.length !== 1 ? 's' : ''} total).`
    );
    return;
  }

  // Discord caps an embed description at 4096 characters; 25 entries with
  // notes stays comfortably inside that.
  const shown = sorted.slice(0, 25);

  const lines = shown.map((entry, index) => {
    const icon = TYPE_ICON[entry.type] || '•';
    const year = entry.year ? ` (${entry.year})` : '';
    const votes = wantCount(entry);
    const voteStr = votes > 0 ? ` • 👍 ${votes}` : '';
    const noteStr = entry.note ? `\n   💭 ${entry.note}` : '';
    const sourceStr = entry.source ? ` • ${entry.source}` : '';

    return `**${index + 1}.** ${icon} **${entry.title}**${year}${voteStr}\n   Added by ${entry.addedBy}${sourceStr}${noteStr}`;
  });

  const sortLabel = { recent: 'newest first', oldest: 'longest waiting', votes: 'most wanted' }[sort];
  const filterLabel = { all: 'titles', movie: 'movies', tv: 'TV shows' }[filter];

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎞️ ${interaction.guild.name} Watchlist`)
    .setDescription(
      `${sorted.length} ${filterLabel}, ${sortLabel}\n\n${lines.join('\n')}`
    )
    .setTimestamp();

  if (sorted.length > shown.length) {
    embed.setFooter({ text: `Showing ${shown.length} of ${sorted.length} — narrow it down with the filter option` });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handlePick(interaction) {
  const method = interaction.options.getString('method') || 'random';
  const filter = interaction.options.getString('filter') || 'all';

  await interaction.deferReply();

  const entries = await getWatchlist(interaction.guildId);
  const picked = pickFromWatchlist(entries, { method, filter });

  if (!picked) {
    await interaction.editReply(
      entries.length === 0
        ? 'The watchlist is empty. Add something with `/watchlist add`.'
        : 'Nothing on the watchlist matches that filter.'
    );
    return;
  }

  const reason = {
    random: 'Picked at random',
    votes: `Most wanted — ${wantCount(picked)} vote${wantCount(picked) !== 1 ? 's' : ''}`,
    oldest: 'Longest waiting',
  }[method];

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('🍿 Tonight\'s Pick')
    .setDescription(`# ${picked.title}${picked.year ? ` (${picked.year})` : ''}`)
    .addFields(
      { name: 'Type', value: picked.type === 'movie' ? 'Movie' : 'TV Show', inline: true },
      { name: 'How it was chosen', value: reason, inline: true }
    )
    .setFooter({ text: 'Log it afterwards with /watched add' })
    .setTimestamp();

  if (picked.note) embed.addFields({ name: 'Note', value: picked.note, inline: false });
  if (picked.posterUrl) embed.setImage(picked.posterUrl);

  await interaction.editReply({ embeds: [embed] });
}

async function handleWant(interaction) {
  const parsed = parseTitleValue(interaction.options.getString('title'));

  if (!parsed) {
    await interaction.reply({
      content: '❌ Pick a title from the autocomplete list so the right entry is voted for.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const result = await toggleWant(
    interaction.guildId,
    parsed.tmdbId,
    parsed.type,
    interaction.user.id
  );

  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }

  const votes = wantCount(result.entry);
  const embed = new EmbedBuilder()
    .setColor(result.added ? 0x00FF00 : 0x808080)
    .setDescription(
      result.added
        ? `👍 ${interaction.user} wants to watch **${result.entry.title}** — now ${votes} vote${votes !== 1 ? 's' : ''}.`
        : `↩️ Vote removed from **${result.entry.title}** — now ${votes} vote${votes !== 1 ? 's' : ''}.`
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleClear(interaction) {
  if (!isAdmin(interaction.member) && !isModerator(interaction.member)) {
    await interaction.reply({
      content: '❌ Only administrators and moderators can clear the watchlist.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const cleared = await clearWatchlist(interaction.guildId);

  await interaction.editReply(
    cleared === 0
      ? 'The watchlist was already empty.'
      : `🗑️ Cleared **${cleared}** title${cleared !== 1 ? 's' : ''} from the watchlist.`
  );
}
