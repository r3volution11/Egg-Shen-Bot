/**
 * Showing who a card is about: their face and their name, as this server
 * knows them.
 *
 * Used on cards about one person — a voting ballot, /bracket my-votes,
 * /stats type:My Stats. Cards about the tournament or the server keep the
 * bot's avatar.
 */

/**
 * Their server avatar if they've set one, else their account avatar —
 * Discord gives every account one, so this is never empty.
 * `interaction.member` can be a plain API object with no methods when the
 * member isn't cached; then the account avatar it is.
 */
export function avatarOf(interaction) {
  return interaction.member?.displayAvatarURL?.() || interaction.user.displayAvatarURL();
}

/** Their server nickname, else their display name, else their username. */
export function nameOf(interaction) {
  return interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
}
