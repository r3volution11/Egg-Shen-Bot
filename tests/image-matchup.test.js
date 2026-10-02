/**
 * /image matchup: drawing a tournament matchup. Reported broken 2026-10-02,
 * and it was, every way it suggested:
 *   - its own description said to type a label like "1A"; the lookup only
 *     compared titles, so "1A" never matched
 *   - the no-options list numbered matchups 1–16; typing a number searched
 *     the titles, so "1" picked whichever title contained a 1 ("13th")
 *   - no suggestions, and the list mixed decided matchups with open ones
 * Driven through the real command with the fake Discord. OpenAI is never
 * called: fetch is stubbed, and the matchup chosen is read from the
 * "Generating AI image for …" progress message.
 *
 * Run with: npm test -- tests/image-matchup.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import { FakeDiscord } from './harness/fakeDiscord.js';

process.env.OPENAI_API_KEY = 'test-key'; // before config.js is loaded

let image;
let bracketManager;

beforeAll(async () => {
  image = await import('../src/commands/image.js');
  bracketManager = await import('../src/utils/bracketManager.js');
  globalThis.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ error: { message: 'stubbed' } }) }));
});

const GUILD = 'image-matchup-guild';
let discord;

// A 16-title bracket: round of 16, labels 1A–4B. Titles chosen so a loose
// search would trip: one contains "13th", one contains "1A".
const TITLES = ['Friday the 13th', 'Alien', 'Halloween', 'Jaws', 'The Thing', 'Scream', 'Get Out', 'Us',
  'Psycho', 'Carrie', 'The Fly', 'It', 'Saw', 'Hereditary', 'Midsommar', 'Room 1A'];

beforeEach(() => {
  bracketManager.deleteTournament(GUILD);
  bracketManager.createTournament(GUILD, 'Cup', 'admin', 16);
  TITLES.forEach((title, i) => bracketManager.addTitle(GUILD, 'A', 'movie', { id: i + 1, title, year: '2000', type: 'movie' }));
  bracketManager.generateKnockoutBracket(GUILD);
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('admin', { admin: true });
});

const round = () => bracketManager.loadTournament(GUILD).knockoutBracket
  .filter(m => m.round === 'round_of_16').sort((a, b) => a.position - b.position);
const vs = (m) => `${m.movie1.title}** vs **${m.movie2.title}`;

async function draw(matchup) {
  const i = discord.command('admin', 'image', { options: { matchup } });
  await image.execute(i);
  return i.replyMessage.history.map(h => h.content).join('\n');
}

async function suggest(typed) {
  const i = discord.autocomplete('admin', 'image', { options: {}, focused: { name: 'matchup', value: typed } });
  await image.autocomplete(i);
  return i.choices;
}

describe('/image matchup:', () => {
  test('a label draws that matchup: "1A", "2b", any case', async () => {
    const [m1A, m1B, m2A] = round();
    expect(await draw('1A')).toContain(`Generating AI image for **${vs(m1A)}**`);
    expect(await draw('1b')).toContain(`Generating AI image for **${vs(m1B)}**`);
    expect(await draw('2A')).toContain(`Generating AI image for **${vs(m2A)}**`);
  });

  test('a number or a fragment doesn\'t grab whichever title contains it', async () => {
    const said = await draw('1');
    expect(said).not.toContain('Generating');
    expect(said).toContain('No matchup "1"');
  });

  test('titles still work, either order, or one title on its own', async () => {
    const m = round()[2];
    expect(await draw(`${m.movie2.title} vs ${m.movie1.title}`)).toContain(`Generating AI image for **${vs(m)}**`);
    expect(await draw(m.movie1.title.toUpperCase())).toContain(`Generating AI image for **${vs(m)}**`);
  });

  test('a picked suggestion draws exactly that matchup', async () => {
    // A title no other title contains (the bracket is shuffled, and "it" is
    // also in "Hereditary")
    const m = round().find(x => [x.movie1.title, x.movie2.title].includes('Midsommar'));
    const [choice] = await suggest('midsommar');
    expect(choice.name).toContain('Midsommar');
    expect(await draw(choice.value)).toContain(`Generating AI image for **${vs(m)}**`);
  });
});

describe('suggestions', () => {
  test('voting now comes first and says so; labels filter as you type', async () => {
    const m = round()[6]; // 4A
    bracketManager.openKnockoutMatchups(GUILD, [m.id], Date.now() + 3600000, 'channel');
    const all = await suggest('');
    expect(all[0].value).toBe(m.id);
    expect(all[0].name).toMatch(/^4A · .* · voting now$/);
    expect(all.length).toBeGreaterThanOrEqual(8);

    const r1 = await suggest('1');
    expect(r1.map(c => c.name.split(' · ')[0])).toEqual(['1A', '1B']);
  });
});

describe('/image with no options', () => {
  test('lists this round\'s matchups by label, open ones first, with a working example', async () => {
    const [decided, , , m] = round(); // 1A decided, 2B open
    bracketManager.openKnockoutMatchups(GUILD, [decided.id], Date.now() + 3600000, 'channel');
    bracketManager.voteKnockout(GUILD, 'voter', decided.id, 1);
    bracketManager.closeKnockoutMatchup(GUILD, decided.id);
    bracketManager.openKnockoutMatchups(GUILD, [m.id], Date.now() + 3600000, 'channel');
    const i = discord.command('admin', 'image', { options: {} });
    await image.execute(i);
    const text = i.replyMessage.content;
    expect(text).toContain(`• **2B** · ${m.movie1.title} vs ${m.movie2.title} · voting now`);
    expect(text).not.toContain('**1A**'); // decided: nothing left to draw
    expect(text.indexOf('**2B**')).toBeLessThan(text.indexOf('**1B**'));
    expect(text).toContain('/image matchup:2B');
    expect(text).not.toMatch(/^1\. /m); // no numbers that don't work
  });
});
