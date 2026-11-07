/**
 * "Log to Watch History": the button on a stopped timer's card, and the form
 * it opens.
 *
 * The card is posted when a timer stops (or auto-stops) and its title
 * couldn't be logged automatically: the timer had no label, the label wasn't
 * found on TMDB, or logging failed. The button opens a form for the title and
 * notes; submitting it searches TMDB and saves one watch-history entry.
 *
 * Three things went wrong here before, and shape the code below:
 *
 * - The title was read from the card's first line, whatever it said, so a
 *   timer with no label offered "Timer has been stopped" as what you
 *   watched. Only a title the card actually shows (a bold first line) is
 *   used now, and only to pre-fill the form's title box, which is always
 *   there to correct — before, a card that had a title gave no box at all,
 *   so a label TMDB couldn't find could never be fixed and never logged.
 * - The title rode in the form's customId as base64. A customId is capped at
 *   100 characters, which with two snowflakes left room for ~33 bytes of
 *   title; a longer one threw building the form. Nothing variable is in the
 *   customId now (CLAUDE.md's rule) — the title is in the form itself, which
 *   also means nothing is held in memory that a restart or the 15-minute
 *   pendingSelections expiry could lose while someone types their notes.
 * - A card could be logged more than once: the auto-logged cards carried the
 *   button too ("manual override", which could only add a second entry), and
 *   two forms opened from one card each saved. A card already logged now
 *   says so instead of opening the form; each entry records the card it came
 *   from (`cardMessageId`) so a second submit is refused; and a card being
 *   logged right now is claimed in memory, synchronously, so two submits a
 *   moment apart can't both pass the history check.
 */

import { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';
import { memberHas } from '../utils/memberPermissions.js';
import { getWatchHistory, saveWatchHistory } from '../utils/watchHistoryManager.js';
import { clipText, LIMITS } from '../utils/embedFit.js';

// Said by the timer cards that logged themselves (timer.js and
// timerManager.js, autoLogTimerToWatchHistory). Those cards no longer get
// the button, but ones posted before that still carry it; this is how the
// handler knows not to log them again.
const AUTO_LOGGED = 'Automatically logged to watch history';

// Cards being logged right now, `${guildId}:${messageId}`. Claimed before
// the first await so two submits from one card can't both get through.
const cardsBeingLogged = new Set();

/** The timer's starter, or an admin/moderator (memberHas reads an uncached member too) */
function canLogFor(interaction, starterUserId) {
  return interaction.user.id === starterUserId ||
    memberHas(interaction.member, 'Administrator') ||
    memberHas(interaction.member, 'ManageGuild') ||
    memberHas(interaction.member, 'ModerateMembers');
}

const NOT_ALLOWED = '❌ Only the person who started the timer or server administrators/moderators can log it to watch history.';

/**
 * The title a card shows, or null. The cards that have one open with it in
 * bold on a line of its own (`**Alien**`); the no-label cards open with
 * plain text ("Timer has been stopped"), which is not a title.
 */
export function titleOnCard(message) {
  const firstLine = (message?.embeds?.[0]?.description || '').split('\n')[0].trim();
  const match = firstLine.match(/^\*\*(.+)\*\*$/);
  return match ? match[1].trim() || null : null;
}

/**
 * What this card is already logged as, or null: an auto-logged card (its
 * first line is the logged title), or an entry saved from this card's form.
 */
async function loggedAs(interaction) {
  const card = interaction.message;
  const description = card?.embeds?.[0]?.description || '';
  if (description.includes(AUTO_LOGGED)) {
    return description.split('\n')[0].replace(/\*\*/g, '').trim();
  }
  if (!card?.id) return null;
  const history = await getWatchHistory(interaction.guildId, 'all', Infinity);
  const entry = history.find(e => e.cardMessageId === card.id);
  return entry ? `${entry.title}${entry.year ? ` (${entry.year})` : ''}` : null;
}

const alreadyLoggedReply = (title) => ({
  content: `✅ This watch party is already in the watch history as **${title}**. \`/watched history\` shows it.`,
  flags: MessageFlags.Ephemeral,
});

/** A text box's value, or null when the form has no such box */
function textInput(interaction, customId) {
  try {
    return interaction.fields.getTextInputValue(customId);
  } catch {
    return null;
  }
}

/**
 * Handle the "Log to Watch History" button (`log_watched_<channelId>_<starterUserId>`).
 */
export async function handleWatchHistoryButton(interaction) {
  const [, , channelId, starterUserId] = interaction.customId.split('_');

  if (!canLogFor(interaction, starterUserId)) {
    await interaction.reply({ content: NOT_ALLOWED, flags: MessageFlags.Ephemeral });
    return;
  }

  const logged = await loggedAs(interaction);
  if (logged) {
    await interaction.reply(alreadyLoggedReply(logged));
    return;
  }

  // Fixed length: two snowflakes, nothing else
  const modal = new ModalBuilder()
    .setCustomId(`watched_modal_${channelId}_${starterUserId}`)
    .setTitle('Log to Watch History');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Movie or TV Show Title')
    .setPlaceholder('Enter the title of what you watched')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  const title = titleOnCard(interaction.message);
  if (title) titleInput.setValue(title);

  // The notes are shown in an embed field, which holds 1024 characters:
  // longer ones made addFields throw after the entry was already saved
  const notesInput = new TextInputBuilder()
    .setCustomId('notes')
    .setLabel('Notes (optional)')
    .setPlaceholder('Optional - notes about this watch party')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(notesInput),
  );

  await interaction.showModal(modal);
}

/**
 * Handle the form's submission (`watched_modal_<channelId>_<starterUserId>`).
 *
 * A form opened by the previous version has a fifth part, the title as
 * base64 (or `notitle`), and no title box when the card had one; it's still
 * read so a form left open across a deploy can be submitted.
 */
export async function handleWatchedModalSubmit(interaction) {
  const [, , channelId, starterUserId, legacyTitle] = interaction.customId.split('_');

  // The same people the button lets in. This used to require the submitter
  // to BE the starter, so a moderator could open the form but never submit it.
  if (!canLogFor(interaction, starterUserId)) {
    await interaction.reply({ content: NOT_ALLOWED, flags: MessageFlags.Ephemeral });
    return;
  }

  const legacy = legacyTitle && legacyTitle !== 'notitle'
    ? Buffer.from(legacyTitle, 'base64').toString('utf-8')
    : null;
  const title = (textInput(interaction, 'title') ?? legacy ?? '').trim();
  const notes = (textInput(interaction, 'notes') || '').trim() || null;

  if (!title) {
    await interaction.reply({ content: '❌ Type the title of what you watched.', flags: MessageFlags.Ephemeral });
    return;
  }

  const card = interaction.message;
  const cardKey = card?.id ? `${interaction.guildId}:${card.id}` : null;
  if (cardKey) {
    if (cardsBeingLogged.has(cardKey)) {
      await interaction.reply({ content: '⏳ This watch party is being logged right now.', flags: MessageFlags.Ephemeral });
      return;
    }
    cardsBeingLogged.add(cardKey);
  }

  try {
    const logged = await loggedAs(interaction);
    if (logged) {
      await interaction.reply(alreadyLoggedReply(logged));
      return;
    }

    // Public, so everyone sees what was logged
    await interaction.deferReply();

    try {
      const { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } = await import('../services/tmdbService.js');

      const [movieResults, tvResults] = await Promise.all([
        searchMovies(title),
        searchTVShows(title),
      ]);

      const allResults = [
        ...(movieResults || []).map(r => ({ ...r, type: 'movie' })),
        ...(tvResults || []).map(r => ({ ...r, type: 'tv' })),
      ];

      if (allResults.length === 0) {
        // The button stays: the form's title box can be corrected and tried again
        await interaction.editReply({
          content: `Could not find "${title}" on TMDB. Check the spelling and press **Log to Watch History** again, or search with \`/watched add\`.`,
        });
        return;
      }

      // Use the first result
      const result = allResults[0];
      const details = result.type === 'movie'
        ? await getMovieDetails(result.id)
        : await getTVShowDetails(result.id);

      const fullTitle = details.title || details.name;
      const year = details.release_date || details.first_air_date;
      const yearStr = year ? year.split('-')[0] : '';

      await saveWatchHistory(interaction.guildId, {
        tmdbId: result.id,
        type: result.type,
        title: fullTitle,
        year: yearStr,
        notes,
        savedBy: interaction.user.username,
        savedById: interaction.user.id,
        watchedAt: Date.now(),
        channelId,
        channelName: interaction.channel?.name || 'Unknown Channel',
        // The card this was logged from: a second submit from it is refused
        cardMessageId: card?.id ?? null,
      });

      const { trackSearch } = await import('../utils/statsTracker.js');
      await trackSearch(
        interaction.guildId,
        interaction.user.id,
        interaction.user.username,
        'watched',
        fullTitle,
        yearStr
      );

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Added to Watch History')
        .setDescription(`**${fullTitle}**${yearStr ? ` (${yearStr})` : ''}`)
        .addFields(
          { name: 'Type', value: result.type === 'movie' ? 'Movie' : 'TV Show', inline: true },
          { name: 'Watch Party Channel', value: `<#${channelId}>`, inline: true },
        );

      if (notes) {
        // Clipped too: a form from the previous version had no length cap
        embed.addFields({ name: 'Notes', value: clipText(notes, LIMITS.fieldValue), inline: false });
      }

      embed.setFooter({ text: `Saved by ${interaction.user.username}` });
      embed.setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Logged: the card's button goes
      await card?.edit({ components: [] }).catch(() => {});
    } catch (error) {
      console.error('Modal submission error:', error);
      await interaction.editReply({
        content: 'An error occurred while adding to watch history.',
      });
    }
  } finally {
    if (cardKey) cardsBeingLogged.delete(cardKey);
  }
}
