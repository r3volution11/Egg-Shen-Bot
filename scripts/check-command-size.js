/**
 * Report each slash command's serialized size against Discord's 8000-byte
 * per-command limit.
 *
 * Discord measures a command by the UTF-8 length of its full JSON payload —
 * every name, description, option, and choice combined. The cap has been hit
 * twice on /eggshen-config, so run this before adding options to any command.
 *
 * Usage: node scripts/check-command-size.js [--json] [--verbose]
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsPath = join(__dirname, '../src/commands');

const LIMIT = 8000;
const WARN_RATIO = 0.75; // Flag anything already using 75% of the budget

const asJson = process.argv.includes('--json');
const verbose = process.argv.includes('--verbose');

/** Discord counts the UTF-8 bytes of the serialized command. */
function byteSize(json) {
  return Buffer.byteLength(JSON.stringify(json), 'utf8');
}

/** Per-subcommand sizes, so it's clear which one to move when a command is full. */
function subcommandSizes(json) {
  const rows = [];
  for (const option of json.options || []) {
    // 1 = SUB_COMMAND, 2 = SUB_COMMAND_GROUP
    if (option.type !== 1 && option.type !== 2) continue;
    rows.push({ name: option.name, bytes: byteSize(option) });
  }
  return rows.sort((a, b) => b.bytes - a.bytes);
}

const results = [];

for (const file of readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = await import(`file://${join(commandsPath, file)}`);
  if (!('data' in command)) continue;

  const json = command.data.toJSON();
  const bytes = byteSize(json);

  results.push({
    name: json.name,
    file,
    bytes,
    remaining: LIMIT - bytes,
    percent: Math.round((bytes / LIMIT) * 1000) / 10,
    overLimit: bytes > LIMIT,
    nearLimit: bytes > LIMIT * WARN_RATIO,
    subcommands: subcommandSizes(json),
  });
}

results.sort((a, b) => b.bytes - a.bytes);

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const nameWidth = Math.max(...results.map(r => r.name.length), 7);

  console.log(`\nDiscord per-command limit: ${LIMIT} bytes\n`);
  console.log(`${'COMMAND'.padEnd(nameWidth)}  ${'BYTES'.padStart(6)}  ${'FREE'.padStart(6)}  USED`);
  console.log('-'.repeat(nameWidth + 30));

  for (const r of results) {
    const flag = r.overLimit ? ' ✗ OVER LIMIT' : r.nearLimit ? ' ⚠ near limit' : '';
    console.log(
      `${r.name.padEnd(nameWidth)}  ${String(r.bytes).padStart(6)}  ${String(r.remaining).padStart(6)}  ${String(r.percent).padStart(5)}%${flag}`
    );

    if (verbose && r.subcommands.length > 0) {
      for (const sub of r.subcommands) {
        console.log(`${' '.repeat(nameWidth + 2)}  └ ${sub.name}: ${sub.bytes} bytes`);
      }
    }
  }

  const over = results.filter(r => r.overLimit);
  const near = results.filter(r => r.nearLimit && !r.overLimit);

  console.log();
  if (over.length > 0) {
    console.log(`✗ ${over.length} command(s) OVER the limit: ${over.map(r => r.name).join(', ')}`);
  }
  if (near.length > 0) {
    console.log(`⚠ ${near.length} command(s) above ${WARN_RATIO * 100}% of the limit: ${near.map(r => r.name).join(', ')}`);
  }
  if (over.length === 0 && near.length === 0) {
    console.log('✓ All commands comfortably within the limit.');
  }
  console.log(`\nTotal: ${results.length} commands, largest is ${results[0].name} at ${results[0].bytes} bytes.\n`);
}

process.exit(results.some(r => r.overLimit) ? 1 : 0);
