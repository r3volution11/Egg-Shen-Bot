/**
 * Who may manage a tournament, and how long the matchup pickers last.
 *
 * Shared by `/bracket` (its admin subcommands) and the buttons the
 * `/bracket open-matchup` and `/bracket close-matchup` pickers post, so the
 * two can't drift apart again: the buttons used to let in anyone isAdmin()
 * accepts (also Manage Server, Kick Members, Ban Members), while the command
 * that posted them refused those same people.
 */
import { PermissionFlagsBits } from 'discord.js';
import { memberHas } from './memberPermissions.js';

/**
 * Administrator or Timeout Members (ModerateMembers): the people the
 * tournament docs call admins and moderators. memberHas reads either member
 * shape (see memberPermissions.js); the flags are passed as
 * PermissionFlagsBits, as bracket.js always passed them.
 */
export function isTournamentManager(member) {
  return memberHas(member, PermissionFlagsBits.Administrator)
    || memberHas(member, PermissionFlagsBits.ModerateMembers);
}

/**
 * The picker's buttons stop working this long after it was posted, as its
 * footer says. Matchups and their votes change in the meantime, so an old
 * picker's labels (and the vote counts on the close buttons) go stale.
 */
export const MATCHUP_PICKER_TTL_MS = 15 * 60 * 1000;

/** The footer the pickers carry, built from the same number the handlers enforce. */
export const MATCHUP_PICKER_FOOTER = `Buttons expire after ${MATCHUP_PICKER_TTL_MS / 60000} minutes`;

/**
 * Whether a picker message is past its 15 minutes. A message without a
 * creation time can't be judged, so it isn't treated as expired.
 *
 * @param {{ createdTimestamp?: number }} message - the message the button is on
 * @param {number} [now]
 */
export function matchupPickerExpired(message, now = Date.now()) {
  const created = message?.createdTimestamp;
  if (!Number.isFinite(created)) return false;
  return now - created > MATCHUP_PICKER_TTL_MS;
}
