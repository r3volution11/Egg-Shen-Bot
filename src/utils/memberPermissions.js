/**
 * Permission and role checks that work on either shape of `interaction.member`.
 *
 * discord.js gives an interaction one of two things as its member
 * (BaseInteraction: `guild?.members._add(data.member) ?? data.member`):
 *
 *  - a cached GuildMember, when the guild is in the client's cache:
 *    `permissions` is a PermissionsBitField, `roles` a role manager with a
 *    `.cache`, and it has an `id`;
 *  - the raw APIInteractionGuildMember Discord sent, when the guild isn't
 *    cached: `permissions` is the bitfield as a decimal STRING ("8"), `roles`
 *    a plain array of role ids, and there is no `id` (only `user.id`).
 *
 * `member.permissions.has(...)` on the second throws "member.permissions.has
 * is not a function". The rate limiter does exactly that before every
 * command, so for those members every command failed with the generic
 * error — seen in production, 2026-11.
 *
 * A cached member's own PermissionsBitField is used untouched, so nothing
 * changes for it: these are guild-level permissions, as before. Only the raw
 * string is converted. (`interaction.memberPermissions` would also work for
 * the raw member — it is built from the same string — but for a cached one it
 * is the CHANNEL's permissions, overwrites included, which could change the
 * answer for ManageEvents, ManageMessages or ManageChannels.)
 */
import { PermissionsBitField } from 'discord.js';

/**
 * The member's permissions as something with `.has()`, or null when there
 * are none to read (no member, or a value that isn't a bitfield).
 */
export function permissionsOf(member) {
  const perms = member?.permissions;
  if (perms == null) return null;
  if (typeof perms.has === 'function') return perms; // cached GuildMember
  try {
    return new PermissionsBitField(BigInt(perms)); // raw API member: "8"
  } catch {
    return null;
  }
}

/**
 * Whether the member holds `permission` (a flag name like 'Administrator' or
 * a PermissionFlagsBits value). Administrator implies every permission, as
 * PermissionsBitField.has does by default. No member means no.
 */
export function memberHas(member, permission) {
  return permissionsOf(member)?.has(permission) ?? false;
}

/** The ids of the member's roles, from either shape. */
export function memberRoleIds(member) {
  const roles = member?.roles;
  if (Array.isArray(roles)) return roles; // raw API member: already ids
  const cache = roles?.cache;
  if (!cache || typeof cache.values !== 'function') return [];
  return [...cache.values()].map(role => role.id);
}

/** The member's user id, from either shape (the raw one has no `id`). */
export function memberId(member) {
  return member?.id ?? member?.user?.id ?? null;
}
