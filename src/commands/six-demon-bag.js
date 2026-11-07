import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { loadGuildConfig, canUseCommand } from '../utils/guildConfig.js';
import {
  getGameSettings, channelAllowed, loadScores, castCheck, castCharm, shrugHex, setPeace, bagStatus, checkPlayLimit, extraLines,
} from '../utils/gameScores.js';
import { currentSiege, fightingNow } from '../utils/siegeStore.js';
import { elementChoices, elementOf, charmName, charmAbout, castCost, payText, CHARM_KINDS } from '../utils/gameMagic.js';
import { liveHappenings } from '../utils/gameRules.js';
import { happeningsNow } from '../utils/gamePlay.js';
import { nameOf } from '../utils/personCard.js';
import { cardName } from '../utils/gameBoards.js';
import { lineFor } from '../utils/siegeCard.js';
import { liveKit, pill } from '../utils/emojiKit.js';
import { clipText } from '../utils/embedFit.js';
import { CHI, MAGIC } from '../data/gameRewards.js';
import { ELEMENTS, ELEMENT_KEYS, SIX_DEMON_BAG, ITEMS_BTILC, fill } from '../data/btilcLines.js';

/**
 * /six-demon-bag (2.76.0, design §1–§3): Egg Shen's bag. Spend the Chi good
 * plays earn to bless a friend or hex a rival, element by element. The
 * rules are in src/utils/gameMagic.js (pure) and gameScores.js (castCharm
 * and friends, one save each); the numbers are gameRewards.js' CHI, MAGIC
 * and CHARMS; the words btilcLines.js' SIX_DEMON_BAG and ELEMENTS.
 *
 *   bless member: element:  — CHI.cost.bless Chi. Public, and pings the member once
 *   hex member: element:    — CHI.cost.hex Chi, one a day, inside the
 *                             anti-harassment limits (design §3.4)
 *   peace on:               — no hexes either way; once made, kept a week
 *   shrug                   — the hex on you is gone: free once a day, then
 *                             CHI.cost.shrug Chi (free when you hold less)
 *   status private:         — your bag: Chi, casts, what's on you (private
 *                             by default, read with `?? true`)
 *
 * Discord lists subcommands alphabetically (CLAUDE.md), so the picker shows
 * bless, hex, peace, shrug, status: the one people reach for first, first.
 *
 * Gates, in order: the member toggle (`magic`, canUseCommand), then — for
 * everything but `status`, which works anywhere, privately, like
 * /scoreboard — the games' channels (`/eggshen-config-games channels`,
 * design §0.9: a thread counts as its channel) and the bag being on (an
 * admin passes canUseCommand with it off, but nothing would work). Every
 * refusal is private and costs nothing: castCheck is read before the
 * cooldown is spent, and castCharm reads it again, in the same synchronous
 * block, before it saves anything.
 *
 * No buttons and no selects: nothing here can be clicked by someone else.
 */

/**
 * OPEN QUESTION 4 for Doug (R3 brief §13), the one switch: `element:` as
 * 'autocomplete' (the default: each choice says what it'd do to THIS
 * member — "🌧️ Rain · lifts Sam's 🔥 Scorched") or as six 'fixed' choices
 * ("🔥 Fire · Fired Up (6 Chi)"), which can't know the member. Typed names
 * resolve either way. ~1.2 KB of command definition as autocomplete, ~2.1
 * KB fixed; `deploy-commands` after a flip.
 */
export const ELEMENT_INPUT = 'autocomplete';

function elementOption(kind) {
  return (option) => {
    option
      .setName('element')
      .setDescription(kind === 'bless' ? 'Which demon: each does something different' : 'Which demon: each takes something different')
      .setRequired(true);
    if (ELEMENT_INPUT === 'autocomplete') return option.setAutocomplete(true);
    return option.addChoices(...ELEMENT_KEYS.map(el => ({ name: `${ELEMENTS[el].emoji} ${ELEMENTS[el].name} · ${charmName(kind, el)} (${CHI.cost[kind]} Chi)`, value: el })));
  };
}

export const data = new SlashCommandBuilder()
  .setName('six-demon-bag')
  .setDescription('Spend Chi from good plays to bless a friend or hex a rival: wind, fire, all that kind of thing')
  .addSubcommand(sub => sub
    .setName('bless')
    .setDescription(`Bless a member with one of six demons (${CHI.cost.bless} Chi)`)
    .addUserOption(option => option.setName('member').setDescription('Who to bless').setRequired(true))
    .addStringOption(elementOption('bless')))
  .addSubcommand(sub => sub
    .setName('hex')
    .setDescription(`Hex a member (${CHI.cost.hex} Chi, one a day): they can shrug it off`)
    .addUserOption(option => option.setName('member').setDescription('Who to hex').setRequired(true))
    .addStringOption(elementOption('hex')))
  .addSubcommand(sub => sub
    .setName('peace')
    .setDescription(`No hexes on you and none from you. Once made, it holds for ${MAGIC.peaceLockDays} days`)
    .addBooleanOption(option => option.setName('on').setDescription('true: make peace · false: end it').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('shrug')
    .setDescription('Shrug off the hex on you (free once a day)'))
  .addSubcommand(sub => sub
    .setName('status')
    .setDescription('Your Chi, your casts today, and what\'s on you (only you see it)')
    .addBooleanOption(option => option.setName('private').setDescription('Only you see it (default: true)')));

const privately = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const unix = (ms) => Math.floor(ms / 1000);
const when = (ms) => `<t:${unix(ms)}:R>`;

/**
 * The channel this interaction came from: discord.js gives null for one it
 * hasn't cached (a thread, say), so it's fetched — a thread of a games
 * channel mustn't be refused as "not a games channel" (as siege.js does)
 */
const channelOf = async (interaction) => interaction.channel
  ?? await interaction.guild?.channels?.fetch(interaction.channelId).catch(() => null)
  ?? null;

/**
 * The member picked, with the name they go by here: discord.js resolves a
 * User option to the option's `user` (and `member`, in a server)
 */
function memberOf(interaction) {
  const opt = interaction.options.get('member');
  const user = opt?.user || interaction.options.getUser('member');
  if (!user?.id) return null;
  const name = opt?.member?.displayName || user.globalName || user.username;
  return { id: user.id, name, bot: !!user.bot };
}

/** A refusal's words, by castProblem's (or castCharm's) reason */
export function refusalText(p, { target }) {
  const R = SIX_DEMON_BAG.refusals;
  const reason = p.reason || p.error;
  const text = Object.hasOwn(R, reason) ? R[reason] : R.castLimit;
  return fill(text, {
    target: cardName(target), when: p.when ? when(p.when) : '', count: p.count ?? 0, chi: p.chi ?? 0, need: p.need ?? 0,
  });
}

// ── the element autocomplete ────────────────────────────────────────────

/**
 * `element:` suggestions: all six with their charm and cost, and — once the
 * member is picked — what each would do to them (gameMagic.elementChoices).
 * An autocomplete's options aren't resolved: the member is its id.
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const kind = interaction.options.getSubcommand(false);
  if (focused?.name !== 'element' || !CHARM_KINDS.includes(kind)) {
    await interaction.respond([]);
    return;
  }
  const opt = interaction.options.get('member');
  const targetId = typeof opt?.value === 'string' ? opt.value : opt?.user?.id ?? null;
  const now = Date.now();
  const scores = loadScores(interaction.guildId);
  const target = targetId ? scores.users?.[targetId] : null;
  const settings = getGameSettings(await loadGuildConfig(interaction.guildId));
  const cost = castCost(kind, liveHappenings(happeningsNow(interaction.guildId, now, settings), now));
  await interaction.respond(elementChoices({ kind, typed: focused.value, target, targetName: target?.name, cost, settings }, now).slice(0, 25));
}

// ── the subcommands ─────────────────────────────────────────────────────

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (!await canUseCommand(interaction.guildId, interaction.member, 'magic')) {
    await privately(interaction, '❌ /six-demon-bag is turned off on this server.');
    return;
  }
  const settings = getGameSettings(await loadGuildConfig(interaction.guildId));
  if (sub === 'status') {
    await status(interaction, settings);
    return;
  }
  // Acting: where the games are played (a thread counts as its channel)
  const channel = await channelOf(interaction);
  const here = channelAllowed(settings, interaction.channelId, channel?.parentId || null);
  if (!here.ok) {
    await privately(interaction, here.message);
    return;
  }
  // An admin gets past the toggle, but with it off nothing in the bag works
  if (!settings.magic) {
    await privately(interaction, '🎒 The Six-Demon Bag is switched off on this server.');
    return;
  }
  if (sub === 'peace') await peace(interaction);
  else if (sub === 'shrug') await shrug(interaction, settings);
  else await cast(interaction, sub, settings);
}

/**
 * bless / hex. Every check that can refuse runs, read-only, before the
 * cooldown is spent; then — with no await between them — the cooldown and
 * the cast itself (castCharm checks it all again inside its one save).
 */
async function cast(interaction, kind, settings) {
  const target = memberOf(interaction);
  if (!target) {
    await privately(interaction, '❌ Pick a member to cast on.');
    return;
  }
  const value = interaction.options.getString('element');
  const el = elementOf(value, kind);
  if (!el) {
    await privately(interaction, `🎒 There's no "${clipText(String(value || ''), 40)}" in the bag. Pick one of the six: ${ELEMENT_KEYS.map(k => `${ELEMENTS[k].emoji} ${ELEMENTS[k].name}`).join(', ')}.`);
    return;
  }
  const caster = { id: interaction.user.id, name: nameOf(interaction) };

  // ── No await from here until the reply: the siege, the check, the
  // cooldown and the cast read and write the same files (CLAUDE.md: never
  // save an object loaded before an await) ──
  const now = Date.now();
  const happenings = happeningsNow(interaction.guildId, now, settings);
  const fighting = fightingNow(currentSiege(interaction.guildId), target.id, now);
  const spec = { caster, target, kind, el, settings, fighting, happenings };
  const problem = castCheck(loadScores(interaction.guildId), spec, now);
  if (problem) {
    await privately(interaction, refusalText(problem, { target: target.name }));
    return;
  }
  const limit = checkPlayLimit(interaction.guildId, caster.id, 'magic', settings, now);
  if (!limit.ok) {
    await privately(interaction, limit.message);
    return;
  }
  const done = castCharm(interaction.guildId, spec, now);
  // ── end of the synchronous block ──
  if (done.error) {
    await privately(interaction, refusalText(done, { target: target.name }));
    return;
  }
  await interaction.reply({
    content: castMessage(done, { caster: caster.name, target, seed: interaction.id }),
    // Public, and it pings the member it landed on — once, and nobody else
    allowedMentions: { parse: [], users: [target.id] },
  });
}

/**
 * The cast's public message (design §1). Its lines are picked by the
 * interaction's id, never by luck: a luck draw here would shift every
 * seeded game after it.
 *   🎒 Sam reaches into the Six-Demon Bag. *"Wind, fire, all that kind of thing!"*
 *   🔥 Sam lights a little fire under Alex…
 *   **Fired Up**: +1 on each good play for the next 3 plays. @Alex
 *   -# Sam 14 → 8 Chi · 1 cast left today
 * A lift or a spoil says so with the element's cancel line, a wash (Cleansing
 * Rain) what it washed, a Jade Charm (3B) that it turned the hex aside; a
 * payoff, the caster's pay (and any prize or title it brought).
 */
export function castMessage(done, { caster, target, seed = '' }) {
  const e = ELEMENTS[done.el];
  const names = { caster: cardName(caster), target: cardName(target.name) };
  const ping = `<@${target.id}>`;
  const lines = [`${fill(lineFor(seed, SIX_DEMON_BAG.cast), names)} *${lineFor(seed, SIX_DEMON_BAG.egg, 1)}*`];
  if (done.outcome === 'deflected') {
    lines.push(`${fill(lineFor(seed, ITEMS_BTILC.jadeCharm.fired, 2), names)} ${ping}`);
  } else if (done.outcome === 'lifted' || done.outcome === 'spoiled') {
    const which = done.outcome === 'lifted' ? 'lift' : 'spoil';
    lines.push(`${fill(lineFor(seed, e.cancel[which], 2), { ...names, charm: done.cancelled })} ${ping}`);
  } else {
    lines.push(fill(lineFor(seed, e[done.kind], 3), names));
    lines.push(`**${charmName(done.kind, done.el)}**: ${charmAbout(done.kind, done.el)} ${ping}`);
    if (done.washed?.length) lines.push(fill(SIX_DEMON_BAG.washed, { target: names.target, statuses: done.washedText }));
  }
  const tail = [];
  if (done.pay) {
    tail.push(`-# ${fill(SIX_DEMON_BAG.paidOff, { caster: names.caster, charm: `${e.emoji} ${charmName('bless', done.el)}`, points: payText(done.pay) })}`);
  }
  tail.push(...extraLines({ rewards: done.rewards, titles: done.titles }, { actor: names.caster, target: null }));
  const left = done.castsLeft > 0 ? `${done.castsLeft} cast${done.castsLeft === 1 ? '' : 's'} left today` : 'no casts left today';
  tail.push(`-# ${names.caster} ${done.chiBefore} → ${done.chiAfter} Chi · ${left}`);
  return clipText([...lines, ...tail].join('\n'), 2000);
}

/** peace on:true|false — public when it changes, private when it can't */
async function peace(interaction) {
  const on = interaction.options.getBoolean('on') === true;
  const name = nameOf(interaction);
  const done = setPeace(interaction.guildId, { userId: interaction.user.id, name, on }, Date.now());
  const P = SIX_DEMON_BAG.peace;
  if (done.error === 'tooSoon') return privately(interaction, fill(P.tooSoon, { when: when(done.when) }));
  if (done.error === 'alreadyOn') return privately(interaction, P.alreadyOn);
  if (done.error === 'alreadyOff') return privately(interaction, P.alreadyOff);
  const user = cardName(name);
  const lines = [fill(lineFor(interaction.id, on ? P.on : P.off), { user })];
  if (done.lifted) lines.push(fill(P.lifted, { user, charm: done.lifted }));
  if (on) lines.push(`-# ☮️ ${user} can switch it off ${when(Date.now() + MAGIC.peaceLockDays * 24 * 60 * 60 * 1000)}. Blessings still land.`);
  return interaction.reply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
}

/** shrug — public: the hex is gone, and the ward that follows */
async function shrug(interaction, settings) {
  const name = nameOf(interaction);
  const done = shrugHex(interaction.guildId, { userId: interaction.user.id, name, settings }, Date.now());
  const S = SIX_DEMON_BAG.shrug;
  if (done.error) return privately(interaction, S.none);
  const user = cardName(name);
  const line = done.outcome === 'paid' ? fill(lineFor(interaction.id, S.paid), { user, chi: done.chi })
    : done.outcome === 'broke' ? fill(S.broke, { user })
      : fill(lineFor(interaction.id, S.free), { user });
  return interaction.reply({
    content: `${line}\n-# ${done.charm} is gone. No hex can land on ${user} until <t:${unix(done.wardUntil)}:t>.`,
    allowedMentions: { parse: [] },
  });
}

/** status — the bag, privately unless private:false; works in any channel */
async function status(interaction, settings) {
  const isPrivate = interaction.options.getBoolean('private') ?? true;
  const now = Date.now();
  const bag = bagStatus(loadScores(interaction.guildId), interaction.user.id, settings, now);
  const embed = statusEmbed(bag, { name: nameOf(interaction), seed: interaction.id }, { kit: liveKit(), now });
  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] }, ...(isPrivate ? { flags: MessageFlags.Ephemeral } : {}) });
}

/**
 * The status card: Chi with its bar, today's casts, what's on you and from
 * whom, peace or a ward, and what each element does. Each field stays under
 * Discord's 1,024 (tests/six-demon-bag.test.js measures the longest).
 */
export function statusEmbed(bag, { name, seed = '' }, { kit = liveKit(), now = Date.now() } = {}) {
  const T = SIX_DEMON_BAG.status;
  const lines = [];
  if (!bag.magic) lines.push('⏸️ **The Six-Demon Bag is switched off on this server.**');
  lines.push(`${kit.e('chi')} ${pill(`${bag.chi}/${bag.bag}`)} Chi ${kit.bar(bag.chi, bag.bag, { colour: 'blue', style: 'blocks' })}`);
  lines.push(`Today: ${pill(`+${bag.today}/${bag.perDay}`)} from good plays · ${pill(`+${bag.helpToday}/${bag.helpPerDay}`)} from freeing and curing in a siege`);
  const castsLeft = Math.max(0, bag.castsPerDay - bag.casts);
  lines.push(`Casts: ${pill(`${castsLeft} of ${bag.castsPerDay}`)} left today${bag.hexesOff || bag.peace ? '' : ` (a hex: ${pill(`${Math.max(0, bag.hexesPerDay - bag.hexes)} of ${bag.hexesPerDay}`)})`} · resets 00:00 UTC`);
  if (bag.on.length) {
    for (const c of bag.on) {
      const from = c.kind === 'hex' ? `hex, ${c.byName ? `from ${cardName(c.byName)}` : 'Ching Dai\'s Curse'}` : `from ${cardName(c.byName || 'someone')}`;
      const uses = c.counts ? ` · ${c.left} ${c.left === 1 ? 'play' : 'plays'} left` : '';
      const shrugHint = c.kind === 'hex' ? ` · \`/six-demon-bag shrug\`${bag.freeShrugs > 0 ? ' (free today)' : ''}` : '';
      lines.push(`On you: ${c.label} *(${from})*${uses} · ends ${when(c.until)}${shrugHint}`);
    }
  } else {
    lines.push(T.nothing);
  }
  if (bag.peace) lines.push(`${T.peace} You can end it ${when(bag.peace.until)}.`);
  if (bag.hexesOff) lines.push(T.hexesOff);
  else if (bag.ward) lines.push(`🛡️ Warded: no hex can land on you until <t:${unix(bag.ward)}:t>.`);
  lines.push(`*${lineFor(seed, SIX_DEMON_BAG.egg, 1)}*`);
  const about = (kind) => ELEMENT_KEYS.map(el => `${ELEMENTS[el].emoji} **${charmName(kind, el)}**: ${charmAbout(kind, el)}`).join('\n');
  return {
    color: 0x2E8B57,
    title: T.title,
    author: { name: clipText(String(name || 'Someone'), 256) },
    description: lines.join('\n'),
    fields: [
      { name: `${kit.e('bag')} Blessings · ${CHI.cost.bless} Chi`, value: about('bless'), inline: false },
      { name: `${kit.e('bag')} Hexes · ${CHI.cost.hex} Chi`, value: bag.hexesOff ? T.hexesOff : about('hex'), inline: false },
    ],
    footer: { text: '/six-demon-bag bless · hex · shrug · peace · a blessing that does something pays its caster' },
  };
}
