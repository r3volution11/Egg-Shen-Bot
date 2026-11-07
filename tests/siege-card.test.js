/**
 * The siege card's words for 2.75.0, the real hero (src/utils/siegeCard.js):
 * pure renders of hand-built sieges, so every line is checked exactly — the
 * frozen card's Wang Chi and Jack Burton, the live card's "Wang Chi so far"
 * and backing, the results' honour lines (their placeholders filled, never a
 * raw "{mvp}"), each row's honours, the backing field, and the daily
 * report's "Wang Chi of the night". The whole flow — the real commands, the
 * scheduler and Discord — is tests/siege-sim*.test.js.
 *
 * Run with: npm test -- tests/siege-card.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { renderSiegeCard, resultsPayload, reportPayload, lineFor } from '../src/utils/siegeCard.js';
import { siegeView } from '../src/utils/siegeStore.js';
import { createKit } from '../src/utils/emojiKit.js';
import { messageProblems } from '../src/utils/embedFit.js';
import { HONOURS, fill } from '../src/data/btilcLines.js';
import { MONSTERS } from '../src/data/siegeMonsters.js';
import { SIEGE_PACES, ITEMS } from '../src/data/gameRewards.js';
import { siegeTimings } from '../src/utils/gamePace.js';

const T = Date.UTC(2026, 10, 9, 20, 0);
const MIN = 60_000;
const kit = createKit(new Map()); // fallback: 🗡️ 🔪 🎲 for wang, jack, back
const BLOB = MONSTERS.blob;

const p = (name, damage, extra = {}) => ({
  name, damage, attacks: 3, frees: 0, cures: 0, firstAt: T, firstAttackAt: T, lastAt: T,
  spooked: false, poison: null, caught: null, poisoned: null, out: false, ...extra,
});

/** A blob siege at `key` pace, its fighters and its result as finishSiege stores them */
function siege({ key = 'quick', status = 'won', participants, result = null, killingBlow = null, backers = {}, id = '00000000ab' } = {}) {
  return {
    id, monster: 'blob', status, startedAt: T, endsAt: T + SIEGE_PACES[key].span * MIN, finishedAt: status === 'live' ? null : T + 30 * MIN,
    hp: status === 'won' ? 0 : 50, maxHp: 200, t: siegeTimings(SIEGE_PACES[key].span), poolScale: 1, honours: 'wang-chi',
    participants, killingBlow, backers, log: [], result,
  };
}

const grant = (userId, name, points, extra = {}) => ({
  userId, name, damage: 10, contribution: 10, attacks: 3, share: 0.3, points, loss: 0, loot: null, win: true,
  mvp: false, wangChi: false, jack: false, honour: 0, backBonus: 0, kaiju: false, titles: [], total: points, ...extra,
});

describe('the frozen card', () => {
  test('shows the Wang Chi in bold (held the line, when nobody helped) and the Jack Burton, with the kit\'s icons', () => {
    const s = siege({
      participants: { sam: p('Sam', 40), kim: p('Kim', 10, { frees: 2 }) },
      killingBlow: { userId: 'sam', name: 'Sam', at: T, by: 'poison' },
      result: { status: 'won', grants: [], mvp: { userId: 'kim', name: 'Kim' }, wangChi: { userId: 'kim', name: 'Kim', help: 24, held: false }, jack: { userId: 'sam', name: 'Sam', by: 'poison' }, backing: [] },
    });
    const lines = renderSiegeCard(siegeView(s, T + 31 * MIN), { kit }).toJSON().description.split('\n');
    expect(lines.slice(-2)).toEqual(['🗡️ Wang Chi: **Kim**', '🔪 The Jack Burton: Sam (poison)']);
    const held = siege({ ...s, participants: s.participants, result: { ...s.result, wangChi: { userId: 'sam', name: 'Sam', help: 0, held: true }, jack: { userId: 'sam', name: 'Sam', by: 'food' } } });
    expect(renderSiegeCard(siegeView(held, T + 31 * MIN), { kit }).toJSON().description.split('\n').slice(-2))
      .toEqual(['🗡️ Wang Chi: **Sam** (held the line)', '🔪 The Jack Burton: Sam']);
  });

  test('a result from before 2.75.0 (an MVP, no Wang Chi kept) reads as its Wang Chi, its killing blow as the Jack Burton', () => {
    const s = siege({
      participants: { sam: p('Sam', 40) },
      killingBlow: { userId: 'sam', name: 'Sam', at: T, by: 'doom' },
      result: { status: 'won', grants: [], mvp: { userId: 'sam', name: 'Sam' } },
    });
    expect(renderSiegeCard(siegeView(s, T + 31 * MIN), { kit }).toJSON().description.split('\n').slice(-2))
      .toEqual(['🗡️ Wang Chi: **Sam**', '🔪 The Jack Burton: Sam']);
  });

  test('one fighter alone: no honours, but the killing blow is still named', () => {
    const s = siege({
      participants: { sam: p('Sam', 40) },
      killingBlow: { userId: 'sam', name: 'Sam', at: T, by: 'doom' },
      result: { status: 'won', grants: [], mvp: null, wangChi: null, jack: null, backing: [] },
    });
    const lines = renderSiegeCard(siegeView(s, T + 31 * MIN), { kit }).toJSON().description.split('\n');
    expect(lines.at(-1)).toBe('⚔️ Killing blow: Sam');
    expect(lines.join('\n')).not.toMatch(/Wang Chi|Jack Burton/);
  });
});

describe('the live card', () => {
  test('the Wang Chi so far, once someone has really helped (one cure or more); the top fighter alone isn\'t shown as one', () => {
    const live = (participants) => renderSiegeCard(siegeView(siege({ status: 'live', participants }), T + MIN), { kit }).toJSON();
    expect(live({ sam: p('Sam', 40), kim: p('Kim', 5) }).description).not.toMatch(/Wang Chi/);
    const d = live({ sam: p('Sam', 40), kim: p('Kim', 5, { frees: 2, cures: 1 }) }).description.split('\n');
    expect(d).toContain('🗡️ Wang Chi so far: Kim (2 freed, 1 cured)');
  });

  test('backing is offered on the card until it closes, halfway through the siege\'s own time', () => {
    const s = siege({ key: 'week', status: 'live', participants: { sam: p('Sam', 40) } });
    const closes = Math.floor((T + (s.endsAt - T) / 2) / 1000);
    const how = (now) => renderSiegeCard(siegeView(s, now), { kit }).toJSON().fields.at(-1).value;
    expect(how(T + MIN).split('\n').at(-1)).toBe(`\`/siege back fighter:@… points:2–10\` until <t:${closes}:R>`);
    expect(how(closes * 1000)).not.toMatch(/siege back/);
  });
});

describe('the results', () => {
  const backing = [
    { backerId: 'jo', backerName: 'Jo', fighterId: 'kim', fighterName: 'Kim', stake: 6, outcome: 'wangChi', back: 12, bonus: 3 },
    { backerId: 'lu', backerName: 'Lu', fighterId: 'kim', fighterName: 'Kim', stake: 4, outcome: 'wangChi', back: 8, bonus: 0 },
    { backerId: 'al', backerName: 'Al', fighterId: 'sam', fighterName: 'Sam', stake: 5, outcome: 'push', back: 5, bonus: 0 },
    { backerId: 'bo', backerName: 'Bo', fighterId: 'dev', fighterName: 'Dev', stake: 2, outcome: 'lost', back: 0, bonus: 0 },
    { backerId: 'zz', backerName: 'Zz', fighterId: null, fighterName: null, stake: 7, outcome: 'refunded', back: 7, bonus: 0, orphan: true },
  ];
  function won({ key = 'week', jackId = 'sam', id } = {}) {
    const H = SIEGE_PACES[key].honour;
    const jack = { userId: jackId, name: jackId === 'kim' ? 'Kim' : 'Sam', by: 'doom' };
    return siege({
      key, id,
      participants: { sam: p('Sam', 90), kim: p('Kim', 20, { frees: 2 }), dev: p('Dev', 5) },
      killingBlow: { ...jack, at: T },
      result: {
        status: 'won',
        mvp: { userId: 'kim', name: 'Kim' }, wangChi: { userId: 'kim', name: 'Kim', help: 24, held: false }, jack,
        grants: [
          grant('sam', 'Sam', 20 + (jackId === 'sam' ? 3 * H : 0), { jack: jackId === 'sam', honour: jackId === 'sam' ? 3 * H : 0 }),
          grant('kim', 'Kim', 10 + 8 * H + 3 + (jackId === 'kim' ? 3 * H : 0), {
            mvp: true, wangChi: true, jack: jackId === 'kim', honour: 8 * H + (jackId === 'kim' ? 3 * H : 0), backBonus: 3, loot: { item: 'gpie', overflow: false },
          }),
          grant('dev', 'Dev', 2),
        ],
        backing,
      },
    });
  }

  test('the defeat line names the Wang Chi, then a Wang Chi line and a Jack Burton line, picked by the siege\'s id, then the pings', () => {
    const s = won();
    const content = resultsPayload(s, { kit }).content.split('\n');
    expect(content[0]).toBe(BLOB.lines.defeat.split('{mvp}').join('Kim'));
    expect(content[1]).toBe(fill(lineFor(s.id, HONOURS.wangChi, 0), { mvp: 'Kim', jack: 'Sam' }));
    expect(content[2]).toBe(fill(lineFor(s.id, HONOURS.jackBurton, 3), { mvp: 'Kim', jack: 'Sam' }));
    expect(content[3]).toBe('<@sam> <@kim> <@dev>');
    expect(content.join('\n')).not.toMatch(/\{\w+\}/);
    // The same siege always gets the same lines (no luck drawn); another siege may get others
    expect(resultsPayload(s, { kit }).content).toBe(resultsPayload(won(), { kit }).content);
    const picks = new Set(['0000000000', '1111111111', '2222222222', '3333333333', '4444444444', '5555555555'].map(id => resultsPayload(won({ id }), { kit }).content.split('\n')[1]));
    expect(picks.size).toBeGreaterThan(1);
  });

  test('every honour line fills its placeholders, whichever is picked', () => {
    for (const list of [HONOURS.wangChi, HONOURS.wangChiHeld, HONOURS.jackBurton, HONOURS.both]) {
      for (const line of list) expect(fill(line, { mvp: 'Kim', jack: 'Sam' })).not.toMatch(/\{\w+\}/);
    }
  });

  test('the Wang Chi who landed the blow too: one line for both', () => {
    const s = won({ jackId: 'kim' });
    const content = resultsPayload(s, { kit }).content.split('\n');
    expect(content).toHaveLength(3);
    expect(content[1]).toBe(fill(lineFor(s.id, HONOURS.both, 0), { mvp: 'Kim' }));
  });

  test('the head and the rows say the honours ×H; backers get a field: the Wang Chi\'s first backer names the fighter\'s share, the second doesn\'t', () => {
    const s = won();
    const H = SIEGE_PACES.week.honour; // read, not assumed (3 when this was written: +24 and +9)
    const embed = resultsPayload(s, { kit }).embeds[0].toJSON();
    const rows = embed.description.split('\n');
    expect(rows[0]).toMatch(/^🟢 Beaten with `3` fighters\. The pot \(\d+, \d+ a fighter a night\) was split by what each did; /);
    expect(rows[0].endsWith(`; 🗡️ the Wang Chi gets +${8 * H} and loot, 🔪 the Jack Burton +${3 * H}.`)).toBe(true);
    expect(rows[2]).toBe(`🥇 Sam · \`10\` damage · \`+${20 + 3 * H}\` · 🔪 +${3 * H}`);
    expect(rows[3]).toBe(`🥈 Kim · \`10\` damage · \`+${10 + 8 * H + 3}\` · 🗡️ +${8 * H} · 🎲 +3 · ${ITEMS.gpie.emoji} ${ITEMS.gpie.name}`);
    expect(rows[4]).toBe('🥉 Dev · `10` damage · `+2`');
    expect(embed.fields).toEqual([{
      name: '🎲 Backing',
      value: [
        fill(lineFor(`${s.id}jo`, HONOURS.backing.wangChi, 0), { backer: 'Jo', fighter: 'Kim', stake: 6, gain: '+6', bonus: '+3' }),
        '🎲 Lu backed Kim too (4): Wang Chi! Lu +4.',
        fill(lineFor(`${s.id}al`, HONOURS.backing.push, 2), { backer: 'Al', fighter: 'Sam', stake: 5 }),
        fill(lineFor(`${s.id}bo`, HONOURS.backing.lost, 3), { backer: 'Bo', fighter: 'Dev', stake: 2 }),
      ].join('\n'),
      inline: false,
    }]);
    // The orphaned stake's refund is paid, not shown: it names no fighter
    expect(JSON.stringify(embed)).not.toMatch(/Zz/);
    expect(embed.fields[0].value).not.toMatch(/\{\w+\}/);
  });

  test('a fighter past today\'s reward limit wasn\'t paid their backers\' share, so the line doesn\'t claim it', () => {
    const s = won();
    s.result.grants[1] = { ...s.result.grants[1], limited: true, points: 0, backBonus: 0, wangChi: false };
    const field = resultsPayload(s, { kit }).embeds[0].toJSON().fields[0].value.split('\n');
    expect(field[0]).toBe('🎲 Jo backed Kim too (6): Wang Chi! Jo +6.');
  });

  test('an escape: the backers lost; too few fighters: refunded — and no honour lines', () => {
    const esc = siege({
      status: 'escaped', participants: { sam: p('Sam', 30), kim: p('Kim', 10) },
      result: {
        status: 'escaped', grants: [grant('sam', 'Sam', -3, { win: false }), grant('kim', 'Kim', -3, { win: false })], mvp: null, wangChi: null, jack: null,
        backing: [{ backerId: 'jo', backerName: 'Jo', fighterId: 'sam', fighterName: 'Sam', stake: 4, outcome: 'refunded', back: 4, bonus: 0 }],
      },
    });
    const out = resultsPayload(esc, { kit });
    expect(out.content.split('\n')).toEqual([BLOB.lines.escape, '<@sam> <@kim>']);
    expect(out.embeds[0].toJSON().fields[0].value).toBe('🎲 Not enough of a crew to call it, so Jo gets the 4 on Sam back.');
    expect(messageProblems(out)).toEqual([]);
  });

  test('a result paid the old way (before 2.75.0): the MVP\'s +5 × H in the head, no honour lines', () => {
    const s = won();
    s.result = { status: 'won', mvp: { userId: 'sam', name: 'Sam' }, grants: [grant('sam', 'Sam', 35, { mvp: true }), grant('kim', 'Kim', 5)] };
    const out = resultsPayload(s, { kit });
    expect(out.embeds[0].toJSON().description.split('\n')[0].endsWith(`; the MVP gets +${5 * SIEGE_PACES.week.honour} and loot.`)).toBe(true);
    expect(out.content.split('\n')).toEqual([BLOB.lines.defeat.split('{mvp}').join('Sam'), '<@sam> <@kim>']);
  });
});

describe('the results, with 2.74.0\'s digests (merged onto 2.75.0)', () => {
  test('the monster\'s line, the honours\' lines, then the digests no report reached, then the pings — the digested pinged too', () => {
    const s = siege({
      key: 'week',
      participants: { sam: p('Sam', 90), kim: p('Kim', 20, { frees: 2 }) },
      killingBlow: { userId: 'sam', name: 'Sam', at: T, by: 'doom' },
      result: {
        status: 'won', mvp: { userId: 'kim', name: 'Kim' }, wangChi: { userId: 'kim', name: 'Kim', help: 24, held: false }, jack: { userId: 'sam', name: 'Sam', by: 'doom' },
        grants: [grant('sam', 'Sam', 30, { jack: true }), grant('kim', 'Kim', 40, { mvp: true, wangChi: true })], backing: [],
      },
    });
    s.unreported = [{ userId: 'ana', name: 'Ana', at: T, points: -5 }];
    const out = resultsPayload(s, { kit });
    expect(out.content.split('\n')).toEqual([
      BLOB.lines.defeat.split('{mvp}').join('Kim'),
      fill(lineFor(s.id, HONOURS.wangChi, 0), { mvp: 'Kim', jack: 'Sam' }),
      fill(lineFor(s.id, HONOURS.jackBurton, 3), { mvp: 'Kim', jack: 'Sam' }),
      '😋 Digested while nobody was around: Ana −5',
      '<@sam> <@kim> <@ana>',
    ]);
    expect(out.allowedMentions).toEqual({ parse: [], users: ['sam', 'kim', 'ana'] });
    expect(messageProblems(out)).toEqual([]);
  });

  test('a long digest line gives way to the honours\' lines and the pings: clipped to what\'s left of 2,000, the mentions whole', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `f${i}`);
    const participants = Object.fromEntries(ids.map((id, i) => [id, p(`F${i}`, 10)]));
    participants.f1.frees = 2;
    const s = siege({
      participants, killingBlow: { userId: 'f0', name: 'F0', at: T, by: 'doom' },
      result: {
        status: 'won', mvp: { userId: 'f1', name: 'F1' }, wangChi: { userId: 'f1', name: 'F1', help: 24, held: false }, jack: { userId: 'f0', name: 'F0', by: 'doom' },
        grants: ids.map((id, i) => grant(id, `F${i}`, 5)), backing: [],
      },
    });
    // Escaped, a name of underscores doubles: 40 of them can't fit beside the honours and the pings
    s.unreported = ids.map((id, i) => ({ userId: id, name: `${'_'.repeat(29)}${i}`, at: T, points: -5 }));
    const out = resultsPayload(s, { kit });
    const content = out.content.split('\n');
    expect(out.content.length).toBeLessThanOrEqual(2000);
    expect(content.slice(0, 3)).toEqual([
      BLOB.lines.defeat.split('{mvp}').join('F1'),
      fill(lineFor(s.id, HONOURS.wangChi, 0), { mvp: 'F1', jack: 'F0' }),
      fill(lineFor(s.id, HONOURS.jackBurton, 3), { mvp: 'F1', jack: 'F0' }),
    ]);
    // The pings whole (SIEGE.pingMax of the digested), the digest line clipped to fit before them
    expect(content.at(-1)).toBe(ids.slice(0, 20).map(id => `<@${id}>`).join(' '));
    expect(out.allowedMentions.users).toEqual(ids.slice(0, 20));
    expect(content.at(-2)).toMatch(/^😋 Digested while nobody was around: .*…$/);
    expect(content).toHaveLength(5);
  });
});

describe('the daily report', () => {
  test('"Wang Chi of the night": the most help as the honour weighs it — a free (12) beats a cure (8), not the most assists', () => {
    const s = siege({ key: 'week', status: 'live', participants: { sam: p('Sam', 40), kim: p('Kim', 5), dev: p('Dev', 5) } });
    const tally = { damage: 50, users: { sam: { name: 'Sam', damage: 40, frees: 0, cures: 0 }, kim: { name: 'Kim', damage: 5, frees: 1, cures: 0 }, dev: { name: 'Dev', damage: 5, frees: 0, cures: 1 } } };
    const field = reportPayload(s, { night: '2026-11-10', last: '2026-11-09', number: 1, tally, digested: [] }, { kit, now: T + DAY() }).embeds[0].toJSON().fields[0];
    expect(field.value.split('\n').at(-1)).toBe('🗡️ Wang Chi of the night: Kim (1 freed)');
    // Two cures (16) beat one free (12)
    tally.users.dev.cures = 2;
    const again = reportPayload(s, { night: '2026-11-10', last: '2026-11-09', number: 1, tally, digested: [] }, { kit, now: T + DAY() }).embeds[0].toJSON().fields[0];
    expect(again.value.split('\n').at(-1)).toBe('🗡️ Wang Chi of the night: Dev (2 cured)');
    expect(JSON.stringify(again)).not.toMatch(/Best helper/);
  });

  test('a report covering several nights (one was lost on the way) says so: "Wang Chi of the last 2 nights"', () => {
    const s = siege({ key: 'week', status: 'live', participants: { sam: p('Sam', 40), kim: p('Kim', 5) } });
    const tally = { damage: 45, users: { sam: { name: 'Sam', damage: 40, frees: 0, cures: 0 }, kim: { name: 'Kim', damage: 5, frees: 1, cures: 0 } } };
    const field = reportPayload(s, { night: '2026-11-11', last: '2026-11-10', number: 2, nights: 2, tally, digested: [] }, { kit, now: T + 2 * DAY() }).embeds[0].toJSON().fields[0];
    expect(field.name).toBe('🏆 The last 2 nights');
    expect(field.value.split('\n').at(-1)).toBe('🗡️ Wang Chi of the last 2 nights: Kim (1 freed)');
    // Nobody attacked in them: still the helper, still over both nights
    const quiet = { damage: 0, users: { kim: { name: 'Kim', damage: 0, frees: 1, cures: 0 } } };
    expect(reportPayload(s, { night: '2026-11-11', last: '2026-11-10', number: 2, nights: 2, tally: quiet, digested: [] }, { kit, now: T + 2 * DAY() }).embeds[0].toJSON().fields[0].value)
      .toBe('Nobody attacked. 🗡️ Wang Chi of the last 2 nights: Kim (1 freed)');
    // Nobody at all: 2.74.0's words for a report that covers more than one night
    const none = { damage: 0, users: {} };
    expect(reportPayload(s, { night: '2026-11-11', last: '2026-11-10', number: 2, nights: 2, tally: none, digested: [] }, { kit, now: T + 2 * DAY() }).embeds[0].toJSON().fields[0].value)
      .toBe('Nobody fought in the last 2 nights.');
    expect(reportPayload(s, { night: '2026-11-11', last: '2026-11-10', number: 2, nights: 1, tally: none, digested: [] }, { kit, now: T + 2 * DAY() }).embeds[0].toJSON().fields[0].value)
      .toBe('Nobody fought last night.');
  });
});

function DAY() { return 24 * 60 * MIN; }
