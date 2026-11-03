import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { loadGuildConfig, isAdmin, canUseCommand } from '../utils/guildConfig.js';
import { beginPlay, itemOption, itemChoices, outcomeLabel, resolvePlay } from '../utils/gamePlay.js';
import { getGameSettings, channelAllowed, recordPlay, resultLine, extraLines } from '../utils/gameScores.js';
import { itemEffect, owns } from '../utils/gameRules.js';
import { noteActivity } from '../utils/happeningStore.js';
import { nameOf } from '../utils/personCard.js';
import { clipText } from '../utils/embedFit.js';
import { formatNumber, pill } from '../utils/emojiKit.js';
import {
  currentSiege, isLive, monsterOf, monsterTarget, siegeAttack, spawnSiege,
  finishSiege, siegeTick, siegeView, standingOf, randomMonster, closeOrphanSiege, isCaught, isOut, poisonedNow,
} from '../utils/siegeStore.js';
import { renderSiegeCard, placeText, HOW_TO_FIGHT } from '../utils/siegeCard.js';
import { botCanPost, editSiegeCard, postSiegeResults, postArrival } from '../utils/happeningScheduler.js';
import { SIEGE } from '../data/gameRewards.js';
import { MONSTERS, MONSTER_KEYS } from '../data/siegeMonsters.js';
import { SIEGE_ATTACK_LINES } from '../data/siegeAttackLines.js';

/**
 * /siege — a monster attacks the drive-in and the whole server fights it
 * together (R5, the fifth game). The rules and the state are in
 * src/utils/siegeStore.js, the card in siegeCard.js, the clock in the
 * happening scheduler.
 *
 *   attack weapon:food|doom|potion item:  — a play like the other games'
 *     (the same cooldown, the 6-a-minute limit, items), with lines of its
 *     own (siegeAttackLines.js). Only the attacker is scored; the first
 *     SIEGE.scoredPerDay attacks a day score, every one does damage. R6: a
 *     fighter the monster has grabbed or digested can't attack; one it has
 *     poisoned does half damage.
 *   status                               — the card, privately, with your place
 *   start monster: minutes:  (Admin/Mod) — in this channel
 *   end                      (Admin/Mod) — no rewards, no penalties (a win if it's
 *                                          already at 0 HP, an escape if its time is up)
 *
 * Discord lists subcommands alphabetically (CLAUDE.md), so the picker shows
 * attack, end, start, status — the one people reach for first, first.
 */

const WEAPONS = Object.freeze([
  { value: 'food', name: '🥧 Food (throw it)' },
  { value: 'doom', name: '🪓 Doom (a horror fate)' },
  { value: 'potion', name: '🧪 Potion (poison: damage now and for 5 minutes)' },
]);

/** "food", for "…so food can't be used" */
const WEAPON_WORD = { food: 'food', doom: 'doom', potion: 'potions' };

export const data = new SlashCommandBuilder()
  .setName('siege')
  .setDescription('A monster attacks the drive-in: fight it together')
  .addSubcommand(sub => sub
    .setName('attack')
    .setDescription('Attack the monster with food, a doom or a potion')
    .addStringOption(option => option
      .setName('weapon')
      .setDescription('What to hit it with')
      .setRequired(true)
      .addChoices(...WEAPONS))
    .addStringOption(itemOption))
  .addSubcommand(sub => sub
    .setName('end')
    .setDescription('End the siege now: no rewards, no penalties (Admin/Mod)'))
  .addSubcommand(sub => sub
    .setName('start')
    .setDescription('A monster attacks this channel (Admin/Mod)')
    .addStringOption(option => option
      .setName('monster')
      .setDescription('Which monster (default: a random one)')
      .setRequired(false)
      .addChoices(...MONSTER_KEYS.map(key => ({ name: `${MONSTERS[key].emoji} ${MONSTERS[key].name}`, value: key }))))
    .addIntegerOption(option => option
      .setName('minutes')
      .setDescription(`How long it lasts (default: ${SIEGE.minutes.default}, or the monster's own)`)
      .setRequired(false)
      .setMinValue(SIEGE.minutes.min)
      .setMaxValue(SIEGE.minutes.max)))
  .addSubcommand(sub => sub
    .setName('status')
    .setDescription('The monster, its HP, and your damage (only you see it)'));

const privately = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

/**
 * The channel this interaction came from. discord.js gives null for one it
 * hasn't cached (a thread, say): fetched then, so a thread of the siege's
 * channel isn't told to "fight it there".
 */
const channelOf = async (interaction) => interaction.channel
  ?? await interaction.guild?.channels?.fetch(interaction.channelId).catch(() => null)
  ?? null;
const unix = (ms) => Math.floor(ms / 1000);

// ── item autocomplete ───────────────────────────────────────────────────

/**
 * `item` suggestions: what you hold that fits this weapon — the weapon's
 * own game item (a Golden Pie for food) and the Silver Bullet. Before a
 * weapon is picked, whatever fits any of them.
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused?.name !== 'item') {
    await interaction.respond([]);
    return;
  }
  const weapon = interaction.options.getString('weapon');
  const weapons = owns(SIEGE.outcomes, weapon) ? [weapon] : Object.keys(SIEGE.outcomes);
  const lists = weapons.map(w => itemChoices(interaction.guildId, interaction.user.id, { game: 'siege', action: w }, focused.value));
  const seen = new Set();
  const real = lists.flat().filter(c => c.value !== 'none' && !seen.has(c.value) && seen.add(c.value));
  // Nothing to use: the first list's placeholder says why (none held, or today's 3 used)
  await interaction.respond(real.length ? real.slice(0, 25) : lists[0].slice(0, 1));
}

// ── the subcommands ─────────────────────────────────────────────────────

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'start' || sub === 'end') {
    // A public card's command is gated here; the admin subcommands, by role
    if (!isAdmin(interaction.member)) {
      await privately(interaction, '❌ Only administrators and moderators can start or end a siege.');
      return;
    }
    await (sub === 'start' ? start(interaction) : end(interaction));
    return;
  }
  if (!await canUseCommand(interaction.guildId, interaction.member, 'siege')) {
    await privately(interaction, '❌ /siege is turned off on this server.');
    return;
  }
  await (sub === 'status' ? status(interaction) : attack(interaction));
}

/**
 * Every line this attack could post (R6: src/data/siegeAttackLines.js,
 * written for a monster — the games' own lines are about a person, and
 * read oddly with a monster put where the member would be), re-tagged with
 * the siege's outcomes (SIEGE.outcomes). One draw over them all
 * (resolvePlay), so the outcome odds are the file's own mix.
 */
function attackLines(weapon) {
  const table = SIEGE.outcomes[weapon];
  return (SIEGE_ATTACK_LINES[weapon] || [])
    .filter(l => l?.text && owns(table, l.outcome))
    .map(l => ({ text: l.text, outcome: table[l.outcome] }));
}

/** Every game's actor placeholder is the attacker; {monster} (siege lines), {target} and {receiver}, the monster */
const fillFor = (userId, monster) => (text) => text
  .replace(/{thrower}|{feeder}|{user}|{giver}/g, `<@${userId}>`)
  .replace(/{monster}|{target}|{receiver}/g, monster ? `**${monster.name}**` : 'the monster');

/**
 * Why a member can't attack siege `s` from here, or null — the refusals
 * that cost nothing (checked before the cooldown is spent, and again,
 * except the channel, in the same synchronous block as the damage).
 */
function refusal(s, interaction, channel, now) {
  if (!s || s.status !== 'live') return '👹 No monster is attacking right now.';
  const monster = monsterOf(s.monster);
  const here = interaction.channelId === s.channelId || (channel?.parentId && channel.parentId === s.channelId);
  if (!here) return `👹 ${monster.name} is attacking in <#${s.channelId}>: fight it there!`;
  if (!(s.hp > 0)) return `🏆 ${monster.name} is already beaten! The results are on their way.`;
  if (!isLive(s, now)) return `💨 ${monster.name} is getting away: it's too late to attack.`;
  // R6: the monster has them, or has eaten them
  const me = s.participants?.[interaction.user.id];
  if (isOut(me)) return `😋 ${monster.name} digested you: you're out of this siege.`;
  if (isCaught(me)) return caughtRefusal(monster, me, interaction.member?.displayName || interaction.user.username);
  return null;
}

/** A grabbed fighter's refusal: who can free them, and by when */
const caughtRefusal = (monster, p, name) => `🪤 ${monster.name} has you! You can't attack until someone else frees you with \`/rescue attempt target:@${name}\`, by <t:${unix(p.caught.until)}:t> (<t:${unix(p.caught.until)}:R>).`;

/** What a refused attack says, by siegeAttack's error */
const LATE = {
  caught: (m) => `🪤 ${m.name} grabbed you a moment before your attack landed: someone has to free you with \`/rescue\`.`,
  out: (m) => `😋 ${m.name} digested you a moment before your attack landed.`,
  beaten: (m) => `🏆 ${m.name} was beaten a moment before your attack landed. The results are on their way.`,
  'time-up': (m) => `💨 ${m.name} got away a moment before your attack landed.`,
  'not-live': (m) => `⏹️ The fight with ${m.name} ended a moment before your attack landed.`,
  'not-current': () => '⏹️ That fight ended a moment before your attack landed.',
};

/** The `-#` lines that say what the attack did to the monster */
function damageLines(hit, monster, who) {
  const notes = [];
  if (hit.silverMult) notes.push(`🥈 ×${hit.silverMult}`);
  if (hit.wasSpooked && hit.raw > 0) notes.push('😱 halved');
  if (hit.wasPoisoned && hit.raw > 0) notes.push('🤢 halved: poisoned');
  const dmg = hit.damage > 0 ? `💥 ${formatNumber(hit.damage)} damage${notes.length ? ` (${notes.join(', ')})` : ''}` : '💥 No damage';
  const out = [`${dmg} · ${monster.name} ${hit.hp}/${hit.maxHp}`];
  if (hit.joined) out.push(`📈 ${who} joined the fight: ${monster.name} grows +${hit.joined} HP.`);
  if (hit.healed) out.push(`💚 ${monster.name} feeds on the miss and heals ${hit.healed} HP.`);
  if (hit.poison) {
    out.push(`🧪 ${monster.name} is poisoned${hit.poison.restarted ? ' again (it starts over)' : ''}: ${hit.poison.perMin} a minute for ${hit.poison.minutes} minutes, credited to ${who}.`);
  }
  if (hit.spooked) out.push(`😱 ${who} is Spooked: their next attack does half damage.`);
  // R6: a fizzled potion splashes back
  if (hit.selfPoisoned?.antidote) out.push(`💊 The potion splashed back on ${who}, and their Antidote cured it at once.`);
  else if (hit.selfPoisoned) out.push(`🤢 The potion splashed back: ${who} is poisoned, and their attacks do half damage until someone cures them with a helpful \`/potion give\` (or ${SIEGE.poisoned.minutes} minutes pass).`);
  if (hit.killingBlow) out.push(`🏆 ${who} landed the killing blow on ${monster.name}!`);
  return out.map(l => `-# ${l}`);
}

async function attack(interaction) {
  const weapon = interaction.options.getString('weapon');
  if (!owns(SIEGE.outcomes, weapon)) {
    await privately(interaction, '❌ Pick a weapon: food, doom or potion.');
    return;
  }
  // The refusals that cost nothing: before beginPlay spends the cooldown
  const channel = await channelOf(interaction);
  const s = currentSiege(interaction.guildId);
  const why = refusal(s, interaction, channel, Date.now());
  if (why) {
    await privately(interaction, why);
    return;
  }
  const game = SIEGE.weaponGame[weapon];
  if (!await canUseCommand(interaction.guildId, interaction.member, game)) {
    await privately(interaction, `❌ /${game} is turned off on this server, so ${WEAPON_WORD[weapon]} can't be used on the monster. Try another weapon!`);
    return;
  }

  const started = await beginPlay(interaction, 'siege', { item: interaction.options.getString('item'), action: weapon, channel });
  if (!started) return;
  const monster = monsterOf(s.monster);
  const lines = attackLines(weapon);
  const actor = { id: interaction.user.id, name: nameOf(interaction) };
  const target = monsterTarget(monster);
  // A siege's own daily cap (the cap is whatever the caller passes, so it's
  // set here), and never a twist (recordPlay refuses one on a siege anyway)
  const settings = { ...started.settings, dailyScoredPlays: SIEGE.scoredPerDay, twists: false };

  // ── No await from here until the reply: the live check, the draw, the
  // damage and the points all read and write the same two files, so
  // nothing can land between them (CLAUDE.md: never save an object loaded
  // before an await) ──
  const now = Date.now();
  const again = currentSiege(interaction.guildId);
  if (!again || again.id !== s.id || again.status !== 'live' || !(again.hp > 0) || !isLive(again, now)) {
    const err = !again || again.id !== s.id ? 'not-current' : again.status !== 'live' ? 'not-live' : !(again.hp > 0) ? 'beaten' : 'time-up';
    await privately(interaction, LATE[err](monster));
    return;
  }
  const drawn = resolvePlay(interaction.guildId, { game: 'siege', action: weapon, actor, target, lines, item: started.item, settings, happenings: [] }, now);
  const fx = drawn.usable ? itemEffect(drawn.item, 'siege', weapon) : null;
  const landed = siegeAttack(interaction.guildId, s.id, { userId: actor.id, name: actor.name, weapon, outcome: drawn.outcome, silver: !!fx?.silver }, now);
  if (landed.error) {
    await privately(interaction, (LATE[landed.error] || LATE['not-live'])(monster));
    return;
  }
  const result = recordPlay(interaction.guildId, {
    game: 'siege', action: weapon, actor, target, outcome: drawn.outcome, settings, item: drawn.item, mods: drawn.mods, happenings: [],
  }, now);
  // ── end of the synchronous block ──
  try {
    noteActivity(interaction.guildId, { channelId: interaction.channelId || null, userId: actor.id }, now);
  } catch (error) {
    console.error('[Siege] Couldn\'t note activity:', error.message);
  }

  const names = { actor: actor.name, target: null };
  const tail = [
    resultLine('siege', result, names, { label: outcomeLabel(result) }),
    ...damageLines(landed.hit, monster, actor.name),
    ...extraLines(result, names),
  ].join('\n');
  // Over Discord's limit, the line itself gives way, as in every game
  const said = clipText(fillFor(actor.id, monster)(drawn.line.text), Math.max(1, 2000 - tail.length - 1));
  await interaction.reply({
    content: `${said}\n${tail}`.slice(0, 2000),
    // The attacker only: a monster has nobody to ping
    allowedMentions: { parse: [], users: [actor.id] },
  });
}

async function status(interaction) {
  const s = currentSiege(interaction.guildId);
  if (!s || s.status !== 'live') {
    await privately(interaction, '👹 No monster is attacking right now.');
    return;
  }
  // Beaten, or its time up, but the scheduler's pass hasn't finished it
  // yet (up to a minute): say so, as an attack's refusal would, rather
  // than show a live card telling them how to fight
  const monster = monsterOf(s.monster);
  if (!(s.hp > 0)) {
    await privately(interaction, `🏆 ${monster.name} is already beaten! The results are on their way.`);
    return;
  }
  if (!isLive(s, Date.now())) {
    await privately(interaction, `💨 ${monster.name} is getting away: its time is up. The results are on their way.`);
    return;
  }
  const me = standingOf(s, interaction.user.id);
  const mine = s.participants?.[interaction.user.id];
  // R6: their own state first — it's what they can't see on the card's top 3
  const state = isOut(mine) ? ' · 😋 digested: out of this siege'
    : isCaught(mine) ? ` · 🪤 grabbed: someone has to free you by <t:${unix(mine.caught.until)}:R>`
      : poisonedNow(mine) ? ' · 🤢 poisoned: your attacks do half damage' : '';
  const content = me
    ? `You: ${pill(formatNumber(me.damage))} damage · ${placeText(me)} ${me.of === 1 ? 'fighter' : 'fighters'}${state}`
    : `You haven't attacked yet: ${HOW_TO_FIGHT}`;
  await interaction.reply({
    content,
    embeds: [renderSiegeCard(siegeView(s))],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

/**
 * A monster attacks this channel. The channel must be one the games are
 * played in, and one the bot can View, Send and Embed in (checked before
 * anything starts). The siege and the claim on its card are saved
 * together, before the send, so a restart can never post two cards.
 */
async function start(interaction) {
  const config = await loadGuildConfig(interaction.guildId);
  const settings = getGameSettings(config);
  // Members couldn't fight it, and the scheduler calls off a siege that's
  // switched off on its next pass: say so now, rather than post a monster
  // that's gone a minute later
  if (config?.commandPermissions?.siege === false) {
    await privately(interaction, '❌ /siege is turned off for members on this server, so nobody could fight it. Turn it on first: `/eggshen-config commands toggle setting:siege enabled:true`.');
    return;
  }
  // An uncached channel (a thread, say) arrives as null: fetch it, rather
  // than tell the admin the bot can't post where it can
  const channel = interaction.channel ?? await interaction.guild?.channels?.fetch(interaction.channelId).catch(() => null);
  if (!channelAllowed(settings, interaction.channelId, channel?.parentId || null).ok) {
    await privately(interaction, '❌ The games aren\'t played in this channel, so a monster can\'t attack here. Start it in a games channel.');
    return;
  }
  if (!await botCanPost(interaction.guild, channel)) {
    await privately(interaction, '❌ I can\'t post the monster here: I need View Channel, Send Messages and Embed Links in this channel.');
    return;
  }
  const key = interaction.options.getString('monster') || randomMonster();
  const monster = monsterOf(key);
  if (!monster) {
    await privately(interaction, '❌ Pick a monster from the list.');
    return;
  }
  const minutes = interaction.options.getInteger('minutes') ?? monster.minutes ?? settings.siegeMinutes;

  // ── No await between the start and the claim ──
  const now = Date.now();
  const spawned = spawnSiege(interaction.guildId, { monster: key, minutes, startedBy: interaction.user.id, channelId: interaction.channelId, source: 'admin' }, now);
  if (spawned.error) {
    const old = spawned.siege && monsterOf(spawned.siege.monster);
    await privately(interaction, spawned.error === 'in-progress'
      ? `❌ ${old?.name || 'A monster'} is already attacking <#${spawned.siege.channelId}>. One siege at a time: end it with \`/siege end\` first.`
      : spawned.error === 'results-pending'
        ? `❌ The last siege's results haven't been posted yet. Try again in a minute.`
        : '❌ That siege couldn\'t start.');
    return;
  }
  const siege = spawned.siege;
  // Claimed, sent, recorded (happeningScheduler.postArrival): Discord
  // refusing calls it off; no answer leaves it to the next passes, which
  // find the card in the channel or call the siege off quietly
  const posted = await postArrival(interaction.guild, channel, siege, { now });
  if (posted.error) {
    await privately(interaction, '❌ I couldn\'t post the monster in this channel, so the siege is off.');
    return;
  }
  if (posted.unsure) {
    await privately(interaction, `⚠️ Discord didn't confirm the monster's card. If it's in <#${siege.channelId}>, the fight's on; if it isn't, the siege is called off by itself within a few minutes.`);
    return;
  }
  // An admin may start any monster any time (a test server's November
  // Horseman); a random pick keeps to its months. The admin is told.
  const month = new Date(now).getUTCMonth() + 1;
  const season = Array.isArray(monster.months) && !monster.months.includes(month) ? ' (out of season)' : '';
  await privately(interaction, `${monster.emoji} **${monster.name}**${season} is attacking <#${siege.channelId}> until <t:${unix(siege.endsAt)}:t> (<t:${unix(siege.endsAt)}:R>) with ${pill(formatNumber(siege.hp))} HP.`);
}

/**
 * End the siege now: no rewards and no penalties — unless the monster is
 * already at 0 HP (poison due included), when it's the win it was, or its
 * time is already up, when it's the escape it was (the scheduler just
 * hadn't got to it). The card is frozen straight away; results are posted
 * now too (and by the scheduler's next pass if that fails). Deferred
 * first: the card edit and the results are Discord calls of their own.
 */
async function end(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const say = (content) => interaction.editReply({ content, allowedMentions: { parse: [] } });
  const now = Date.now();
  // A siege whose monster no longer exists can't be seen by anything else: closed here
  if (!closeOrphanSiege(interaction.guildId, now).error) {
    await say('⏹️ Ended a siege whose monster no longer exists. No rewards, no penalties.');
    return;
  }
  const s = currentSiege(interaction.guildId);
  if (!s || s.status !== 'live') {
    await say('No monster is attacking right now, so there was nothing to end.');
    return;
  }
  const monster = monsterOf(s.monster);
  siegeTick(interaction.guildId, s.id, now);
  const fresh = currentSiege(interaction.guildId);
  const beaten = fresh && fresh.id === s.id && !(fresh.hp > 0);
  const outcome = beaten ? 'won' : now >= s.endsAt ? 'escaped' : 'ended';
  const done = finishSiege(interaction.guildId, s.id, outcome, now);
  if (done.error) {
    await say(`${monster.name}'s siege had already ended.`);
    return;
  }
  await editSiegeCard(interaction.guild, s.id, { now, force: true });
  if (outcome === 'won') {
    await postSiegeResults(interaction.guild, s.id, { now });
    await say(`🏆 ${monster.name} was already beaten, so it counts as a win: the results are in <#${s.channelId}>.`);
    return;
  }
  if (outcome === 'escaped') {
    await postSiegeResults(interaction.guild, s.id, { now });
    await say(`💨 ${monster.name}'s time was already up, so it got away: the results are in <#${s.channelId}>.`);
    return;
  }
  await say(`⏹️ Ended the siege: ${monster.name} slinks off. No rewards, no penalties.`);
}
