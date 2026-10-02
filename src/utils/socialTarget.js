/**
 * Who a social command (/potion, /foodfight) is aimed at: a member, a role,
 * or @everyone.
 *
 * Discord's User option can't pick @everyone, so these commands take a
 * Mentionable option, which offers members and roles — and @everyone is a
 * role, the one whose id is the server's id.
 *
 * A role or @everyone appears in the message as a mention but never pings:
 * a social command shouldn't notify a whole role, let alone the whole
 * server, every time someone plays (Doug's call, 2026-10-02). Members are
 * pinged, as /potion always did.
 */

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {string} optionName - a Mentionable option
 * @returns {{kind: 'member'|'role'|'everyone', mention: string, pingUserIds: string[], isBot: boolean, name: string} | null}
 *   null when the option is missing (it's required, so only for bad input)
 */
export function resolveSocialTarget(interaction, optionName) {
  // options.get() rather than getMentionable(): it says which kind was
  // picked (.user/.member for a member, .role for a role) instead of leaving
  // us to guess from the shape of what comes back
  const option = interaction.options.get(optionName);
  if (!option) return null;

  if (option.role) {
    const role = option.role;
    if (role.id === interaction.guildId) {
      return { kind: 'everyone', mention: '@everyone', pingUserIds: [], isBot: false, name: 'everyone' };
    }
    return { kind: 'role', mention: `<@&${role.id}>`, pingUserIds: [], isBot: false, name: role.name };
  }

  const user = option.user || option.member?.user;
  if (!user) return null;
  return { kind: 'member', mention: `<@${user.id}>`, pingUserIds: [user.id], isBot: !!user.bot, name: user.username };
}

/**
 * Who a social command's message may notify: the person who used it and, if
 * they aimed at a member, that member. Nothing else — `parse: []` with no
 * `roles` means a role or @everyone in the text shows as a mention without
 * pinging anyone.
 * @param {string} actorId
 * @param {{pingUserIds: string[]}} target
 */
export function allowedMentionsFor(actorId, target) {
  return { parse: [], users: [...new Set([actorId, ...(target?.pingUserIds || [])])] };
}
