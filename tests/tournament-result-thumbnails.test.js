/**
 * Tournament result cards show the winner's poster as the embed thumbnail —
 * the smallest image an embed can carry — so a result is recognizable at a
 * glance without turning into a large image post.
 *
 * Driven through the tournament simulator (real /bracket command, button
 * handler and scheduler, real recorded TMDB data), and asserted on what was
 * actually posted: each card's thumbnail must be the winner's own poster,
 * not just "some image".
 *
 * Run with: npm test -- tests/tournament-result-thumbnails.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { EmbedBuilder } from 'discord.js';
import { loadSim, finishSim, clock, favorite } from './harness/tournamentSim.js';

let Sim;

beforeAll(async () => {
  ({ Sim } = await loadSim());
  clock.install();
});

afterAll(() => finishSim());

const HORROR_8 = [
  ['Alien', 1979], ['The Thing', 1982], ['Halloween', 1978], ['Jaws', 1975],
  ['The Shining', 1980], ['Scream', 1996], ['Get Out', 2017], ['Hereditary', 2018],
];

async function eightMovies(sim, name) {
  await sim.bracket('admin', 'create', { name, 'max-titles': 8 });
  for (const [title, year] of HORROR_8) await sim.addTitle('movie', title, year);
}

const posterOf = (sim, title) => sim.tournament().titles.find(t => t.title === title).posterUrl;
const postsTitled = (sim, re) => sim.channel.posted.flatMap(m => m.embeds).filter(e => re.test(e.title || ''));

describe('result card thumbnails', () => {
  test("the scheduler's result card for each matchup shows the winner's poster", async () => {
    const sim = new Sim('thumb-scheduler');
    await eightMovies(sim, 'Poster Cup');
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    await sim.passDeadlines();

    const closed = sim.tournament().knockoutBracket.filter(m => m.round === 'quarterfinals');
    const cards = postsTitled(sim, /Quarterfinals - Match \d+ - Results/);
    expect(cards).toHaveLength(closed.length);

    for (const m of closed) {
      const card = cards.find(e => e.title.includes(`Match ${m.position + 1} `));
      expect(card.fields[0].value).toContain(m.winner.title);
      expect(card.thumbnail?.url).toBe(posterOf(sim, m.winner.title));
      expect(card.thumbnail.url).toMatch(/^https:\/\/image\.tmdb\.org\//);
    }
    // Thumbnail only — no full-width image
    expect(cards.every(e => !e.image)).toBe(true);
  });

  // /bracket close goes through the scheduler's close path, so it posts the
  // same result card as a deadline does.
  test("/bracket close posts the winner's poster on the result card", async () => {
    const sim = new Sim('thumb-close');
    await eightMovies(sim, 'Close Cup');
    await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' });
    const [matchup] = sim.openMatchups();
    await sim.everyoneVotes(favorite);

    await sim.bracket('admin', 'close');
    const winner = sim.tournament().knockoutBracket.find(m => m.id === matchup.id).winner;
    const [card] = postsTitled(sim, /- Results$/);
    expect(card.fields[0].value).toContain(winner.title);
    expect(card.thumbnail?.url).toBe(posterOf(sim, winner.title));
  });

  test("/bracket close-matchup replies with the winner's poster", async () => {
    const sim = new Sim('thumb-close-matchup');
    await eightMovies(sim, 'Close Matchup Cup');
    await sim.bracket('admin', 'open', { duration: '1d' });
    const matchup = sim.openMatchups().find(m => m.position === 0);
    await sim.everyoneVotes(favorite);

    const close = await sim.bracket('admin', 'close-matchup', { matchup: '1A' });
    const card = close.reply.embeds.find(e => /Complete!/.test(e.title || ''));
    const winner = sim.tournament().knockoutBracket.find(m => m.id === matchup.id).winner;

    expect(card.description).toContain(`**${winner.title}** wins!`);
    expect(card.thumbnail?.url).toBe(posterOf(sim, winner.title));
  });

  test("a tiebreaker's result shows the winner's poster", async () => {
    const sim = new Sim('thumb-tiebreaker', { voters: 4 });
    await eightMovies(sim, 'Tie Cup');
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    const split = (m, v) => (['voter1', 'voter2'].includes(v) ? 1 : 2);
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    await sim.passDeadlines();

    const post = sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_'))).pop();
    const option2 = post.allComponents.find(c => c.customId.endsWith('_1'));
    for (const v of sim.voters) await sim.click(v, post, option2.customId);
    await sim.passDeadlines();

    const [resolved] = postsTitled(sim, /Tiebreaker Resolved/);
    expect(resolved.description).toContain(`Winner: ${tied.movie2.title}`);
    expect(resolved.thumbnail?.url).toBe(posterOf(sim, tied.movie2.title));
  });
});

describe('setTitleThumbnail', () => {
  test('skips a title with no poster, or a poster Discord would reject', async () => {
    const { setTitleThumbnail } = await import('../src/utils/tournamentUI.js');
    for (const title of [null, { posterUrl: null }, { posterUrl: '' }, { posterUrl: '/relative/path.jpg' }]) {
      expect(setTitleThumbnail(new EmbedBuilder().setTitle('t'), title).toJSON().thumbnail).toBeUndefined();
    }
    expect(setTitleThumbnail(new EmbedBuilder(), { posterUrl: 'https://x.test/p.jpg' }).toJSON().thumbnail)
      .toEqual({ url: 'https://x.test/p.jpg' });
  });
});
