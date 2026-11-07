#!/usr/bin/env node
/**
 * Which settings each server will read as a default once configs load with
 * defaults filled in (guildConfig.withDefaults).
 *
 * There are no config migrations: a server configured before a setting
 * existed has no such key in its file. Code that read that key directly
 * saw nothing there, which for most of them meant "off". Loading now fills
 * every missing key with the value a new server gets, so before deploying
 * that change, run this against the real configs to see, per server, every
 * key that is missing and the value it will now read as.
 *
 * One exception, Doug's call (2026-11-07): a config that never set
 * `rateLimits.enabled` keeps rate limiting off, as it has always read
 * (guildConfig.js, savedConfigDefaults). Such a config is reported as
 * "rate limiting stays off", and the rest of its missing rateLimits keys as
 * having no effect while it is off: they read as the defaults, ready for
 * when an admin turns it on.
 *
 * Nothing is written. A missing object is shown once, with its whole
 * default, rather than key by key; a wholly missing `rateLimits` is the
 * exception, shown key by key, because its keys fare differently.
 *
 * Usage:
 *   node scripts/config-defaults-report.js                  # guild_configs/*.json
 *   node scripts/config-defaults-report.js /path/to/guild_configs
 *   node scripts/config-defaults-report.js /path/to/123.json [more.json …]
 *   node scripts/config-defaults-report.js --json [paths…]  # machine-readable
 *
 * On the server:
 *   cd /opt/discord-bot && node scripts/config-defaults-report.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { missingDefaults, withDefaults } from '../src/utils/guildConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.join(__dirname, '..', 'guild_configs');

/**
 * Settings whose missing value behaved differently from the default before,
 * so a server lacking one changes behavior when it starts reading the
 * default. Every other key was already read as its default when missing
 * (through a normalizing helper, `x !== false`, `x || default`), or is never
 * read, so filling it in changes nothing anyone sees. Checked against the
 * code at 2.75.0, and again for 2.76.1 (commandPermissions.magic, added
 * since, already read missing as on).
 *
 * A note applies to its own path and to a missing object that contains it
 * (a missing `rateLimits.guildWide` turns the server-wide limit on).
 * `inside` notes apply only to a key missing inside that object: a whole
 * missing `services` or `rateLimits.aiImages` was already read through the
 * code's own fallback, which is the same as the default.
 *
 * `rateLimits.enabled` isn't here: missing, it stays off (RATE_LIMITING_OFF).
 * The rateLimits notes apply only where rate limiting is on; where it's off
 * those keys do nothing (rateLimitNote).
 */
const BEHAVIOR_CHANGES = [
  { path: 'services', inside: true, note: 'its rating badge was hidden (missing read as off); now shown' },
  { path: 'commandPermissions.enabled', note: 'members could not use any command with an on/off switch (refused, or an error when the whole list was missing); now allowed' },
  { path: 'rateLimits.bypassForModerators', note: 'admins and moderators were rate limited like everyone (missing read as off); now they skip the limits' },
  { path: 'rateLimits.global', note: 'commands without their own limit had no per-member limit; now 1 per 20 s' },
  { path: 'rateLimits.commands.recommend', note: '/recommend used the general per-member limit; now its own, 2 per 120 s' },
  { path: 'rateLimits.commands.suggest-quote', note: '/suggest-quote used the general per-member limit; now its own, 1 per 60 s' },
  { path: 'rateLimits.guildWide.enabled', note: 'the server-wide limit was off (missing read as off); now 10 commands per 60 s across everyone' },
  { path: 'rateLimits.patternDetection.enabled', note: 'pattern detection was off (missing read as off); now on' },
  { path: 'rateLimits.aiImages', inside: true, note: 'this part of the AI image limits was read as off or as nothing; now the default' },
];

/** The behavior-change notes for a missing key, joined; null when there are none. */
function noteFor(keyPath) {
  const notes = BEHAVIOR_CHANGES.filter(({ path: q, inside }) => {
    if (keyPath.startsWith(`${q}.`)) return !!inside; // missing inside q
    if (inside) return false;
    return q === keyPath || q.startsWith(`${keyPath}.`); // q itself, or q inside a missing object
  }).map(c => c.note);
  return notes.length ? notes.join('; ') : null;
}

const TURN_ON_RATE_LIMITING = '/eggshen-config-watch-party rate-limit toggle enabled:true';
const RATE_LIMITING_OFF = `rate limiting stays off (never set; turn on with ${TURN_ON_RATE_LIMITING})`;
const NO_EFFECT = 'no effect while rate limiting is off';

/**
 * What a missing key under rateLimits does on a server where rate limiting
 * is off: checkRateLimit returns before reading any of them. Except the
 * moderator bypass, which also lets admins and moderators skip manual
 * cooldowns, applied whenever moderation is on. AI image limits are their
 * own thing and keep their usual note.
 *
 * @returns {{ effect: string, note: string }|undefined} undefined: not one of these
 */
function rateLimitNote(keyPath, config) {
  if (!keyPath.startsWith('rateLimits.') || keyPath.startsWith('rateLimits.aiImages')) return undefined;
  if (keyPath === 'rateLimits.enabled') return { effect: 'stays-off', note: RATE_LIMITING_OFF };
  if (config?.rateLimits?.enabled) return undefined; // on: the usual notes
  if (keyPath === 'rateLimits.bypassForModerators' && config?.moderation?.enabled) {
    return { effect: 'changes', note: 'admins and moderators were held by manual cooldowns (missing read as off); now they skip them, and the rate limits too once rate limiting is on' };
  }
  return { effect: 'no-effect', note: NO_EFFECT };
}

/** A wholly missing rateLimits, key by key: its switch stays off while the rest read as defaults */
function expandRateLimits(missing) {
  return missing.flatMap(m => (m.path === 'rateLimits'
    ? Object.entries(m.value).map(([key, value]) => ({ path: `rateLimits.${key}`, value }))
    : [m]));
}

/** The config files named on the command line, or every one in guild_configs/. */
function configFiles(args) {
  const targets = args.length ? args : [DEFAULT_DIR];
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) throw new Error(`No such file or directory: ${target}`);
    if (fs.statSync(target).isDirectory()) {
      for (const name of fs.readdirSync(target).sort()) {
        // <guildId>.json only: not .bak or other leftovers
        if (/^[^.]+\.json$/.test(name)) files.push(path.join(target, name));
      }
    } else {
      files.push(target);
    }
  }
  return files;
}

/**
 * The report for some config files. `effect` is 'changes' (behavior
 * changes), 'stays-off' (rate limiting, never set), 'no-effect' (a rate
 * limit read as its default while rate limiting is off), or null (it was
 * already read as this default); `note` says what.
 * @returns {{ guildId: string, file: string, error?: string, rateLimitingOn?: boolean, missing: { path: string, value: *, effect: string|null, note: string|null }[] }[]}
 */
export function buildReport(args) {
  return configFiles(args).map((file) => {
    const guildId = path.basename(file, '.json');
    let saved;
    try {
      saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      return { guildId, file, error: `unreadable: ${error.message}`, missing: [] };
    }
    const config = withDefaults(saved); // as loadGuildConfig reads it
    const missing = expandRateLimits(missingDefaults(saved)).map(({ path: keyPath, value }) => {
      const rateLimit = rateLimitNote(keyPath, config);
      if (rateLimit) return { path: keyPath, value, ...rateLimit };
      const note = noteFor(keyPath);
      return { path: keyPath, value, effect: note ? 'changes' : null, note };
    });
    return { guildId, file, rateLimitingOn: !!config.rateLimits?.enabled, missing };
  });
}

export function formatReport(report) {
  const lines = [];
  for (const guild of report) {
    lines.push(`Guild ${guild.guildId} (${guild.file})`);
    if (guild.error) {
      lines.push(`  ${guild.error}`);
    } else if (guild.missing.length === 0) {
      lines.push('  nothing missing: every setting is already saved');
    } else {
      for (const { path: keyPath, value, effect, note } of guild.missing) {
        lines.push(`  ${keyPath} = ${JSON.stringify(value)}`);
        if (effect === 'changes') lines.push(`      changes behavior: ${note}`);
        else if (note) lines.push(`      ${note}`);
      }
    }
    lines.push('');
  }
  const count = (effect) => report.filter(g => g.missing.some(m => m.effect === effect)).length;
  lines.push(`${report.length} config${report.length === 1 ? '' : 's'}; ${count('changes')} with a setting whose behavior changes; ` +
    `${count('stays-off')} where rate limiting stays off because it was never set.`);
  return lines.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  try {
    const report = buildReport(args.filter(a => a !== '--json'));
    console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
