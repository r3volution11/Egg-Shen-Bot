/**
 * Tournaments surviving a bot restart: the bot restarted mid-vote (deploys,
 * crashes, the server rebooting), at the worst moments — mid-save, between a
 * tie and posting its tiebreaker, inside a deadline warning window, or down
 * long enough for a deadline to pass. Split from tournament-sim.test.js only
 * so the two run in parallel; same simulator (tests/harness/).
 *
 * Run with: npm test -- tests/tournament-sim-restarts.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadSim, finishSim, clock, favorite, restartBot } from './harness/tournamentSim.js';

let Sim;
let mods;

beforeAll(async () => {
  mods = await loadSim();
  ({ Sim } = mods);
  clock.install();
});

afterAll(() => finishSim());

const HORROR_8 = [
  ['Alien', 1979], ['The Thing', 1982], ['Halloween', 1978], ['Jaws', 1975],
  ['The Shining', 1980], ['Scream', 1996], ['Get Out', 2017], ['Hereditary', 2018],
];

async function straightBracket(sim, name, size, type, titles) {
  await sim.bracket('admin', 'create', { name, 'max-titles': size });
  for (const [title, year] of titles) await sim.addTitle(type, title, year);
}

describe('the bot restarts mid-tournament', () => {
  test('voting carries on: old ballots still work, the scheduler closes the round, the tournament finishes', async () => {
    const sim = new Sim('sim-restart');
    await straightBracket(sim, 'Restart Cup', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite, sim.voters.slice(0, 3));
    const ballot = await sim.openBallot('voter4');

    await restartBot();

    // A ballot opened before the restart still votes
    const [m] = sim.openMatchups();
    await sim.voteMatchup('voter4', ballot, m.id, favorite(m));
    expect(sim.tournament().votes.voter4[m.id]).toBe(favorite(m));
    await sim.everyoneVotes(favorite, sim.voters.slice(3));

    for (let n = 0; n < 3 && sim.tournament().status !== 'completed'; n++) {
      if (n > 0) {
        await sim.bracket('admin', 'open', { duration: '1d' });
        await sim.everyoneVotes(favorite);
      }
      await sim.passDeadlines();
    }
    expect(sim.tournament().champion.title).toBe('Alien');
  });
});

describe('restarts at bad moments', () => {
  const titled = (sim, re) => sim.channel.posted.filter(m => re.test(m.embeds[0]?.toJSON().title || ''));
  const tournamentFile = (sim) => `${process.env.GUILD_TOURNAMENTS_DIR}/${sim.guildId}.json`;

  test('killed in the middle of saving: the tournament survives, and /bracket create can\'t replace it', async () => {
    const sim = new Sim('sim-restart-torn-write');
    await straightBracket(sim, 'Torn', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    const before = sim.tournament();

    // What a kill mid-write leaves: the file cut off partway
    const fs = await import('fs');
    const full = fs.readFileSync(tournamentFile(sim), 'utf8');
    fs.writeFileSync(tournamentFile(sim), full.slice(0, Math.floor(full.length / 2)));
    await restartBot();

    const after = sim.tournament();
    expect(after?.name).toBe('Torn');
    expect(after.status).toBe('knockout');
    const create = await sim.bracket('admin', 'create', { name: 'Oops', 'max-titles': 8 });
    expect(create.reply.text).toMatch(/already in progress/);
    expect(sim.tournament().name).toBe('Torn');
    // Votes up to the last complete save are all there
    expect(Object.keys(after.votes)).toEqual(Object.keys(before.votes));
  });

  test('a "closing soon" warning isn\'t sent twice because the bot restarted', async () => {
    const sim = new Sim('sim-restart-warning');
    await straightBracket(sim, 'Warned', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.advance(23 * 60 * 60 * 1000); // inside the last 2 hours: warned
    expect(titled(sim, /Closing Soon/)).toHaveLength(1);
    await restartBot();
    await sim.advance(60 * 1000);
    await sim.advance(60 * 1000);
    expect(titled(sim, /Closing Soon/)).toHaveLength(1);
  });

  test('votes after a restart update the same Live Standings card', async () => {
    const sim = new Sim('sim-restart-standings');
    await straightBracket(sim, 'Same Card', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite, sim.voters.slice(0, 2));
    await restartBot();
    await sim.everyoneVotes(favorite, sim.voters.slice(2));
    expect(titled(sim, /Live Standings/)).toHaveLength(1);
  });

  test('killed between a tie and posting its tiebreaker: the vote gets posted after the restart', async () => {
    const sim = new Sim('sim-restart-tiebreaker', { voters: 4 });
    await straightBracket(sim, 'Unposted', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? (['voter1', 'voter2'].includes(v) ? 1 : 2) : favorite(m)));
    // The tie is decided and saved; the bot dies before posting the vote
    mods.bracketManager.closeKnockoutMatchup(sim.guildId, tied.id);
    expect(sim.tournament().tiebreakers.find(t => t.status === 'active')?.messageId).toBeFalsy();
    await restartBot();

    // Within its first two minutes it's left alone (whoever created it is
    // posting it); after that the scheduler posts it
    await sim.advance(60 * 1000);
    const tiebreakerPosts = () => sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_')));
    expect(tiebreakerPosts()).toHaveLength(0);
    await sim.advance(2 * 60 * 1000);
    const posts = tiebreakerPosts();
    expect(posts).toHaveLength(1);
    await sim.advance(60 * 1000);
    expect(tiebreakerPosts()).toHaveLength(1); // once
    // ...and it works
    const option = posts[0].allComponents.find(c => c.customId.endsWith('_1'));
    for (const v of sim.voters) await sim.click(v, posts[0], option.customId);
    await sim.passDeadlines();
    expect(sim.tournament().knockoutBracket.find(m => m.id === tied.id).winner.title).toBe(tied.movie2.title);
  });

  test('a tiebreaker left unposted past its own deadline gets its full time once posted, not a random pick', async () => {
    const sim = new Sim('sim-restart-tiebreaker-late', { voters: 4 });
    await straightBracket(sim, 'Late', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? (['voter1', 'voter2'].includes(v) ? 1 : 2) : favorite(m)));
    mods.bracketManager.closeKnockoutMatchup(sim.guildId, tied.id); // 1-hour tiebreaker, never posted
    await restartBot();
    clock.now += 3 * 60 * 60 * 1000; // down for 3 hours
    await sim.advance(60 * 1000);
    expect(sim.tournament().knockoutBracket.find(m => m.id === tied.id).status).toBe('tiebreaker');
    const tb = sim.tournament().tiebreakers.find(t => t.status === 'active');
    expect(tb.deadline - clock.now).toBe(60 * 60 * 1000 - 0); // a full hour from now
  });

  test('a deadline that passes while the bot is down closes when it comes back', async () => {
    const sim = new Sim('sim-restart-downtime');
    await straightBracket(sim, 'Downtime', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    await restartBot();
    clock.now += 2 * 24 * 60 * 60 * 1000; // down for two days
    await sim.advance(60 * 1000);
    expect(sim.openMatchups()).toHaveLength(0);
    expect(sim.tournament().phase).toBe('semifinals');
    expect(titled(sim, /Results/).length).toBe(4);
  });
});
