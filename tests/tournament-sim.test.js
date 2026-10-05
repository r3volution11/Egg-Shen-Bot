/**
 * Whole tournaments, run start to finish through the real /bracket command,
 * button and select handlers and scheduler, against a fake Discord that is
 * as strict as the real one. See tests/harness/tournamentSim.js.
 *
 * Each scenario is one way people really run a tournament. Between them they
 * cover each option at least once: bracket and groups; 2 to 32 titles; setup
 * by command and by the setup form; every title type; opening whole rounds,
 * N at a time, by region or one matchup; ties; deadlines; changed votes.
 * The simulator checks its invariants after every action, so a scenario
 * fails at the step that broke, not just at the end.
 *
 * API data is real (recorded TMDB/RAWG/BGG/Google Books responses in
 * tests/fixtures/tournament-http.json). To re-record after adding titles:
 *   SIM_RECORD=1 npm test -- tests/tournament-sim.test.js
 * To see what every scenario posted, as HTML:
 *   SIM_REPORT=/tmp/sim npm test -- tests/tournament-sim.test.js
 *
 * Run with: npm test -- tests/tournament-sim.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadSim, finishSim, clock, favorite } from './harness/tournamentSim.js';

let Sim;
let mods;

beforeAll(async () => {
  mods = await loadSim();
  ({ Sim } = mods);
  clock.install();
});

afterAll(() => finishSim());

const DAY = 24 * 60 * 60 * 1000;

const HORROR_8 = [
  ['Alien', 1979], ['The Thing', 1982], ['Halloween', 1978], ['Jaws', 1975],
  ['The Shining', 1980], ['Scream', 1996], ['Get Out', 2017], ['Hereditary', 2018],
];

describe('movie night: 8 movies, whole rounds, run by the scheduler', () => {
  test('from /bracket create to a champion on the watchlist', async () => {
    const sim = new Sim('sim-movie-night');
    await sim.configure(c => { c.watchlist = { ...(c.watchlist || {}), autoAddChampion: true }; });

    await sim.bracket('admin', 'create', { name: 'Friday Frights', 'max-titles': 8 });
    for (const [title, year] of HORROR_8) {
      const entry = await sim.addTitle('movie', title, year);
      // Real metadata, from the title the admin picked
      expect(entry.title).toBe(title);
      expect(String(entry.year)).toBe(String(year));
      expect(entry.posterUrl).toMatch(/^https:\/\/image\.tmdb\.org\//);
    }

    const announce = await sim.bracket('admin', 'announce', { message: 'Vote for the scariest!' });
    expect(announce.reply.text).toContain('Friday Frights');

    // Round 1: the whole quarterfinal round, 4 matchups, on one ballot
    await sim.bracket('admin', 'open', { duration: '1d' });
    expect(sim.openMatchups()).toHaveLength(4);
    // The deadline is the card's own timestamp, which Discord shows in each
    // viewer's time zone — not a <t:…> in the footer, which it shows raw
    const opened = sim.channel.posted.map(m => m.embeds[0]?.toJSON()).find(e => /Voting Opened/.test(e?.title || ''));
    expect(opened.footer.text).toBe('Voting closes');
    expect(Date.parse(opened.timestamp)).toBe(sim.openMatchups()[0].votingDeadline);
    await sim.everyoneVotes(favorite);

    // voter1 changes their mind on the first matchup; only the new vote counts
    const [first] = sim.openMatchups();
    const ballot = await sim.openBallot('voter1');
    await sim.voteMatchup('voter1', ballot, first.id, favorite(first) === 1 ? 2 : 1);
    const changed = sim.tournament().knockoutBracket.find(m => m.id === first.id);
    expect(changed.votes.movie1.length + changed.votes.movie2.length).toBe(sim.voters.length);

    // Every round: the deadline passes, the scheduler closes it, the admin opens the next
    let rounds = 0;
    while (sim.tournament().status !== 'completed') {
      if (rounds > 0) {
        await sim.bracket('admin', 'open', { duration: '1d' });
        await sim.everyoneVotes(favorite);
      }
      await sim.passDeadlines();
      rounds++;
      if (rounds > 3) throw new Error(`8 titles should take 3 rounds; still ${sim.tournament().status} / ${sim.tournament().phase}`);
    }

    const t = sim.tournament();
    expect(rounds).toBe(3);
    // Everyone (but voter1 once) backed the first title added; it must win
    expect(t.champion.title).toBe('Alien');
    // ...and land on the watchlist, as configured
    const list = await mods.watchlist.getWatchlist(sim.guildId);
    expect(list.map(e => e.title)).toContain('Alien');

    sim.writeTranscript('movie-night');
  });
});

describe('the ballot lists every vote you\'ve cast', () => {
  test('under Round headings, your pick ticked; it updates as you vote, and earlier rounds stay', async () => {
    const sim = new Sim('sim-ballot-votes');
    await sim.bracket('admin', 'create', { name: 'Ballot Votes', 'max-titles': 8 });
    for (const [title, year] of HORROR_8) await sim.addTitle('movie', title, year);
    await sim.bracket('admin', 'open', { duration: '1d' });

    const votesOn = (ballot) => ballot.embeds[0].description.split('**Your votes**\n')[1]?.split('\n\n⏰')[0];
    const find = (m) => sim.tournament().knockoutBracket.find(x => x.id === m.id);
    // An 8-title bracket: one matchup per region, so each line keeps its full label
    const line = (m, pick) => `${mods.tournamentUI.matchupLabel(m.position, m.round)}: `
      + (pick === 1 ? `✅ **${m.movie1.title}** vs ${m.movie2.title}` : `${m.movie1.title} vs ✅ **${m.movie2.title}**`);

    // Before voting: no list yet
    const ballot = await sim.openBallot('voter1');
    expect(ballot.embeds[0].description).toContain('Cast your first vote below!');
    expect(ballot.embeds[0].description).not.toContain('Total votes');

    // Vote two ways; the ballot answers with both, in bracket order, under Round 1
    const [a, b] = sim.openMatchups();
    await sim.voteMatchup('voter1', ballot, b.id, 2);
    await sim.voteMatchup('voter1', ballot, a.id, 1);
    expect(votesOn(ballot)).toBe(['**Round 1**', line(a, 1), line(b, 2)].join('\n'));
    expect(line(a, 1)).toMatch(/^1A: ✅ \*\*.+\*\* vs .+$/);

    // Changing a vote moves the tick
    await sim.voteMatchup('voter1', ballot, a.id, 2);
    expect(votesOn(ballot)).toBe(['**Round 1**', line(a, 2), line(b, 2)].join('\n'));

    // Next round: the earlier votes stay under Round 1, the new under Round 2
    await sim.everyoneVotes(favorite, sim.voters.filter(v => v !== 'voter1'));
    const rest = sim.openMatchups().filter(m => m.id !== a.id && m.id !== b.id);
    for (const m of rest) await sim.voteMatchup('voter1', ballot, m.id, 1);
    await sim.passDeadlines();
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [semi] = sim.openMatchups();
    const next = await sim.openBallot('voter1');
    // A freshly opened ballot already lists what you voted last round
    const round1 = ['**Round 1**', line(find(a), 2), line(find(b), 2), ...rest.map(m => line(find(m), 1))].join('\n');
    expect(votesOn(next)).toBe(round1);
    await sim.voteMatchup('voter1', next, semi.id, 1);
    expect(votesOn(next)).toBe(`${round1}\n\n**Round 2**\n${line(find(semi), 1)}`);
  });

  test('a round with several matchups per region gets a heading per region, its matchups by letter; the last is the Final', () => {
    const { formatKnockoutVotes } = mods.tournamentUI;
    const bracket = [];
    const votes = {};
    // A 16-title bracket: two matchups per region in its first round
    for (const [round, n] of [['round_of_16', 8], ['quarterfinals', 4], ['semifinals', 2], ['finals', 1]]) {
      for (let p = 0; p < n; p++) {
        bracket.push({ id: `${round}-${p}`, round, position: p, movie1: { title: `A${p}` }, movie2: { title: `B${p}` } });
      }
    }
    const pick = (id, side) => { votes[id] = side; };
    pick('round_of_16-0', 1); pick('round_of_16-1', 2); pick('round_of_16-3', 1); // regions 1 and 2
    pick('quarterfinals-0', 2); pick('quarterfinals-3', 1);
    pick('semifinals-1', 1);
    pick('finals-0', 2);
    expect(formatKnockoutVotes({ knockoutBracket: bracket, votes: { u: votes } }, 'u')).toBe([
      '**Round 1 · Region 1**',
      'A: ✅ **A0** vs B0',
      'B: A1 vs ✅ **B1**',
      '',
      '**Round 1 · Region 2**',
      'B: ✅ **A3** vs B3',
      '',
      '**Round 2**',
      '1A: A0 vs ✅ **B0**',
      '4A: ✅ **A3** vs B3',
      '',
      '**Round 3**',
      '3A: ✅ **A1** vs B1',
      '',
      '**Final**',
      'A0 vs ✅ **B0**',
    ].join('\n'));

    // Rounds count from the bracket's first round, even ones you skipped
    const skipped = formatKnockoutVotes({ knockoutBracket: bracket, votes: { u: { 'semifinals-0': 1 } } }, 'u');
    expect(skipped).toBe('**Round 3**\n1A: ✅ **A0** vs B0');
  });

  test('a very long list keeps the latest rounds and says how many it left out', () => {
    const { formatKnockoutVotes } = mods.tournamentUI;
    const long = 'A Very Long Title That Goes On And On For A While';
    const bracket = [];
    const votes = {};
    for (const [round, n] of [['round_of_32', 16], ['round_of_16', 8], ['quarterfinals', 4], ['semifinals', 2], ['finals', 1]]) {
      for (let p = 0; p < n; p++) {
        const id = `${round}-${p}`;
        bracket.push({ id, round, position: p, movie1: { title: `${long} ${p}a` }, movie2: { title: `${long} ${p}b` } });
        votes[id] = 1;
      }
    }
    // Given out of order (a bracket file isn't promised to be sorted)
    const text = formatKnockoutVotes({ knockoutBracket: [...bracket].reverse(), votes: { u: votes } }, 'u');
    expect(text.length).toBeLessThanOrEqual(3000 + 40);
    expect(text).toMatch(new RegExp(`^-# …and 16 earlier votes\\n\\*\\*Round 2 · Region 1\\*\\*\\nA: ✅ \\*\\*${long} 0a\\*\\* vs ${long} 0b\\nB: ✅ \\*\\*${long} 1a\\*\\*`));
    expect(text).toContain(`\n\n**Final**\n✅ **${long} 0a** vs ${long} 0b`);
    // Markdown in a title can't break the bold
    const odd = formatKnockoutVotes({ knockoutBracket: [{ id: 'x', round: 'finals', position: 0, movie1: { title: '*batteries*' }, movie2: { title: 'B' } }], votes: { u: { x: 1 } } }, 'u');
    expect(odd).toBe('**Final**\n✅ **\\*batteries\\*** vs B');
  });
});

const HORROR_16 = [
  ...HORROR_8,
  ['Psycho', 1960], ['The Exorcist', 1973], ['Poltergeist', 1982], ['The Fly', 1986],
  ['Carrie', 1976], ['It Follows', 2015], ['The Babadook', 2014], ['Midsommar', 2019],
];

const HORROR_32 = [
  ...HORROR_16,
  ['Rosemary\'s Baby', 1968], ['Night of the Living Dead', 1968], ['Suspiria', 1977], ['The Evil Dead', 1983],
  ['A Nightmare on Elm Street', 1984], ['The Texas Chain Saw Massacre', 1974], ['Dawn of the Dead', 1978], ['The Ring', 2002],
  ['The Descent', 2005], ['The Conjuring', 2013], ['The Witch', 2015], ['Us', 2019],
  ['Ringu', 1998], ['The Blair Witch Project', 1999], ['28 Days Later', 2002], ['Train to Busan', 2016],
];

const TV_8 = [
  ['Twin Peaks', 1990], ['The X-Files', 1993], ['Stranger Things', 2016], ['Buffy the Vampire Slayer', 1997],
  ['The Twilight Zone', 1959], ['Supernatural', 2005], ['The Walking Dead', 2010], ['Hannibal', 2013],
];

/** A straight bracket of `titles`, created and filled by the admin. */
async function straightBracket(sim, name, size, type, titles) {
  await sim.bracket('admin', 'create', { name, 'max-titles': size });
  for (const [title, year] of titles) await sim.addTitle(type, title, year);
}

describe('one matchup at a time: 8 TV shows with /bracket open matchups:1', () => {
  test('each run closes the last matchup and opens the next, to a champion; old ballots are refused', async () => {
    const sim = new Sim('sim-one-at-a-time');
    await straightBracket(sim, 'Small Screen Scares', 8, 'tv', TV_8);
    for (const entry of sim.tournament().titles) expect(entry.year).toBeTruthy();

    let staleBallot = null;
    let staleMatchup = null;
    for (let n = 0; n < 8 && sim.tournament().status !== 'completed'; n++) {
      await sim.bracket('admin', 'open', { matchups: 1, duration: '2h' });
      if (sim.tournament().status === 'completed') break;
      expect(sim.openMatchups()).toHaveLength(1); // only ever one on the ballot
      await sim.everyoneVotes(favorite);
      if (n === 0) {
        staleBallot = await sim.openBallot('voter2');
        [staleMatchup] = sim.openMatchups();
      }
      if (n === 1) {
        // voter2 clicks a ballot from the first matchup, which has closed:
        // refused, and the closed result doesn't change
        const before = JSON.stringify(sim.tournament().knockoutBracket.find(m => m.id === staleMatchup.id).votes);
        await sim.voteMatchup('voter2', staleBallot, staleMatchup.id, favorite(staleMatchup) === 1 ? 2 : 1);
        expect(JSON.stringify(sim.tournament().knockoutBracket.find(m => m.id === staleMatchup.id).votes)).toBe(before);
      }
    }
    // 7 matchups, then one more run to close the final
    const t = sim.tournament();
    expect(t.status).toBe('completed');
    expect(t.champion.title).toBe(TV_8[0][0]);
    sim.writeTranscript('one-at-a-time');
  });
});

describe('16 movies opened in parts with matchups:4', () => {
  test('a round too big for one ballot is opened four at a time, to a champion', async () => {
    const sim = new Sim('sim-sixteen');
    await straightBracket(sim, 'Sweet Sixteen', 16, 'movie', HORROR_16);

    // The whole round (8 matchups) can't go on one ballot: /bracket open must not open it
    await sim.bracket('admin', 'open', { duration: '1d' });
    expect(sim.openMatchups().length).toBeLessThanOrEqual(5);

    for (let n = 0; n < 12 && sim.tournament().status !== 'completed'; n++) {
      await sim.bracket('admin', 'open', { matchups: 4, duration: '1d' });
      if (sim.tournament().status === 'completed') break;
      await sim.everyoneVotes(favorite);
      await sim.bracket('admin', 'status');
      await sim.bracket('voter1', 'my-votes');
    }
    expect(sim.tournament().status).toBe('completed');
    expect(sim.tournament().champion.title).toBe('Alien');
    await sim.bracket('voter3', 'view');
    sim.writeTranscript('sixteen');
  });
});

describe('a 32-title bracket opened by region', () => {
  test('/bracket open-matchup offers regions; the region button opens them; members vote', async () => {
    const sim = new Sim('sim-regions');
    await straightBracket(sim, 'The Big One', 32, 'movie', HORROR_32);

    // 16 matchups won't fit one ballot: /bracket open builds the bracket, opens none, and says how
    const built = await sim.bracket('admin', 'open', { duration: '1d' });
    expect(sim.openMatchups()).toHaveLength(0);
    expect(built.reply.text).toMatch(/region|matchups:/i);

    // No region or matchup, 16 matchups in the round: the bot offers region buttons
    const picker = await sim.bracket('admin', 'open-matchup', { duration: '1d' });
    const regionButton = picker.reply.allComponents.find(c => (c.customId || '').startsWith('open_region_1_'));
    expect(regionButton).toBeTruthy();
    await sim.click('admin', picker.reply, regionButton.customId);
    expect(sim.openMatchups()).toHaveLength(4);

    await sim.everyoneVotes(favorite);
    await sim.bracket('admin', 'open-matchup', { region: 2, duration: '1d' });
    await sim.bracket('admin', 'open-matchup', { matchup: '3A,3B', duration: '1d' });
    expect(sim.openMatchups().length).toBeLessThanOrEqual(5);
    sim.writeTranscript('regions');
  });

  test('picking a single matchup from the button list opens it', async () => {
    const sim = new Sim('sim-matchup-buttons');
    await straightBracket(sim, 'Pick One', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' }); // builds the bracket
    const picker = await sim.bracket('admin', 'open-matchup', { duration: '1d' });
    const button = picker.reply.allComponents.find(c => (c.customId || '').startsWith('open_matchup_'));
    expect(button).toBeTruthy();
    await sim.click('admin', picker.reply, button.customId);
    expect(sim.openMatchups().map(m => m.id)).toContain(button.customId.split('_')[2]);
  });
});

describe('ties', () => {
  const split = (m, voter) => (['voter1', 'voter2'].includes(voter) ? 1 : 2);

  test('a tie at the deadline gets a tiebreaker vote, which decides the matchup', async () => {
    const sim = new Sim('sim-tie-deadline', { voters: 4 });
    await straightBracket(sim, 'Dead Even', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    await sim.passDeadlines();

    // The scheduler posted a tiebreaker vote; everyone votes in it
    const post = sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_'))).pop();
    expect(post).toBeTruthy();
    const option1 = post.allComponents.find(c => c.customId.endsWith('_0'));
    for (const v of sim.voters) await sim.click(v, post, option1.customId);
    // Votes in: the leader's bar is green squares, as on the live standings
    const counted = post.embeds[0].toJSON().description;
    expect(counted).toContain(`${'🟩'.repeat(10)} ${sim.voters.length} votes`);
    expect(counted).not.toMatch(/[█░]/);
    await sim.passDeadlines();

    const decided = sim.tournament().knockoutBracket.find(m => m.id === tied.id);
    expect(decided.status).toBe('closed');
    expect(decided.winner.title).toBe(tied.movie1.title);
    expect(sim.tournament().phase).toBe('semifinals');
  });

  test('a tie closed with /bracket close-matchup posts a tiebreaker vote', async () => {
    const sim = new Sim('sim-tie-close-matchup', { voters: 4 });
    await straightBracket(sim, 'Close Call', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    await sim.bracket('admin', 'close-matchup', { matchup: '1A' });
    const post = sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_'))).pop();
    expect(post).toBeTruthy();
    // No votes yet: each tied title's bar is ten white squares, not █/░
    const text = post.embeds[0].toJSON().description;
    expect(text.match(new RegExp(`${'⬜'.repeat(10)} 0 votes`, 'g'))).toHaveLength(2);
    expect(text).not.toMatch(/[█░]/);
  });

  test('a tie closed with /bracket close posts a tiebreaker vote', async () => {
    const sim = new Sim('sim-tie-close', { voters: 4 });
    await straightBracket(sim, 'Smart Close', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    await sim.bracket('admin', 'close');
    const post = sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_'))).pop();
    expect(post).toBeTruthy();
  });

  test('a tie closed with the Close button posts a tiebreaker vote', async () => {
    const sim = new Sim('sim-tie-close-button', { voters: 4 });
    await straightBracket(sim, 'Button Close', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    const picker = await sim.bracket('admin', 'close-matchup', {});
    const button = picker.reply.allComponents.find(c => c.customId === `close_matchup_${tied.id}`);
    expect(button).toBeTruthy();
    await sim.click('admin', picker.reply, button.customId);
    const post = sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_'))).pop();
    expect(post).toBeTruthy();
  });
});

describe('/bracket voting-post brings the voting card back', () => {
  test('anyone can post it again; its Start Voting button works; once per 10 minutes, admins excepted', async () => {
    mods.bracket.resetVotingPostCooldowns();
    const sim = new Sim('sim-voting-post');
    await straightBracket(sim, 'Long Haul', 8, 'movie', HORROR_8);

    // Nothing open yet
    const early = await sim.bracket('voter1', 'voting-post');
    expect(early.reply.ephemeralFor).toBe('voter1');
    expect(early.reply.text).toMatch(/Nothing is open for voting/);

    await sim.bracket('admin', 'open', { duration: '1d' });
    const [first] = sim.openMatchups();

    // A member reposts it: a new public message, listing what's open
    const posted = await sim.bracket('voter1', 'voting-post');
    expect(posted.reply.ephemeralFor).toBeNull();
    const card = posted.reply.embeds[0].toJSON();
    expect(card.title).toBe('🗳️ Quarterfinals - Voting Is Open');
    expect(card.description).toContain(`**1A:** ${first.movie1.title} vs ${first.movie2.title}`);
    expect(card.description).toMatch(/⏰ Voting closes <t:\d+:R>/);
    expect(Date.parse(card.timestamp)).toBe(first.votingDeadline);

    // Its button is the real thing: it opens a ballot and the vote counts
    const ballot = await sim.openBallot('voter2', posted.reply);
    await sim.voteMatchup('voter2', ballot, first.id, 1);
    expect(sim.tournament().knockoutBracket.find(m => m.id === first.id).votes.movie1).toContain('voter2');

    // Again too soon: refused privately, pointing back at the card
    const again = await sim.bracket('voter2', 'voting-post');
    expect(again.reply.ephemeralFor).toBe('voter2');
    expect(again.reply.text).toMatch(/^⏳ The voting card was posted here <t:\d+:R>/);

    // An admin isn't held back; after 10 minutes, anyone again
    expect((await sim.bracket('admin', 'voting-post')).reply.ephemeralFor).toBeNull();
    await sim.advance(10 * 60 * 1000 + 1000);
    expect((await sim.bracket('voter3', 'voting-post')).reply.ephemeralFor).toBeNull();
  });
});

describe('the live standings, on request', () => {
  const standingsCards = (sim) => sim.channel.posted.filter(m => /Live Standings/.test(m.embeds[0]?.toJSON().title || ''));
  const blocks = (sim) => sim.openMatchups().map(m => mods.tournamentUI.formatStandingsMatchup(m));

  test('/bracket status shows each open matchup exactly as the live standings card does', async () => {
    const sim = new Sim('sim-status-bars');
    await straightBracket(sim, 'Bars', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes((m, v) => (v === 'voter1' ? 2 : 1));

    const status = (await sim.bracket('voter2', 'status')).reply.embeds[0].toJSON().description;
    const card = standingsCards(sim).pop().embeds[0].toJSON().description;
    for (const block of blocks(sim)) {
      expect(status).toContain(block);
      expect(card).toContain(block);
    }
    expect(status).toContain('🟩');
    expect(status).not.toMatch(/Leading:/);
  });

  test('voting-post brings the live card down: the new one takes the votes, the old one says it moved', async () => {
    mods.bracket.resetVotingPostCooldowns();
    const sim = new Sim('sim-move-standings');
    await straightBracket(sim, 'Moving Day', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [first] = sim.openMatchups();
    await sim.everyoneVotes(favorite, ['voter1', 'voter2']);
    const old = standingsCards(sim).pop();

    const posted = await sim.bracket('voter3', 'voting-post');
    const after = sim.channel.posted.slice(sim.channel.posted.indexOf(posted.reply) + 1);
    const fresh = after.find(m => /Live Standings/.test(m.embeds[0]?.toJSON().title || ''));
    expect(fresh).toBeTruthy(); // right under the reposted voting card
    expect(old.embeds[0].toJSON().footer.text).toBe('No longer updating: the live standings moved further down');

    // The next vote updates the new card, not the old one
    const oldText = old.embeds[0].toJSON().description;
    const ballot = await sim.openBallot('voter3', posted.reply);
    await sim.voteMatchup('voter3', ballot, first.id, 2);
    expect(old.embeds[0].toJSON().description).toBe(oldText);
    expect(fresh.embeds[0].toJSON().description).toContain(mods.tournamentUI.formatStandingsMatchup(sim.openMatchups()[0]));
    expect(standingsCards(sim).filter(m => !m.deleted)).toHaveLength(2); // no third card
  });
});

describe('who can do what', () => {
  test('members vote; they cannot run admin commands or press admin buttons', async () => {
    const sim = new Sim('sim-permissions');
    await straightBracket(sim, 'Members Only', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' });

    const denied = await sim.bracket('voter1', 'open', { duration: '1d' });
    expect(denied.reply.text).toMatch(/admin|moderator|permission/i);
    expect(sim.openMatchups()).toHaveLength(1);

    const picker = await sim.bracket('admin', 'open-matchup', { duration: '1d' });
    const button = picker.reply.allComponents.find(c => (c.customId || '').startsWith('open_matchup_'));
    const before = sim.openMatchups().length;
    await sim.click('voter1', picker.reply, button.customId); // the picker is public: anyone can press it
    expect(sim.openMatchups()).toHaveLength(before);

    // ...but voting is for everyone
    await sim.everyoneVotes(favorite);
    expect(Object.keys(sim.tournament().votes)).toEqual(expect.arrayContaining(sim.voters));
  });
});

describe('the smallest bracket', () => {
  test('2 titles: one matchup, and its winner is champion', async () => {
    const sim = new Sim('sim-two');
    await straightBracket(sim, 'Head to Head', 2, 'movie', HORROR_8.slice(0, 2));
    await sim.bracket('admin', 'open', { duration: '1d' });
    expect(sim.openMatchups()).toHaveLength(1);
    await sim.everyoneVotes(favorite);
    await sim.passDeadlines();
    expect(sim.tournament().status).toBe('completed');
    expect(sim.tournament().champion.title).toBe('Alien');
  });
});

describe('every kind of title', () => {
  const KINDS = {
    game: [['Doom', 2016], ['Hades', 2020], ['Celeste', 2018], ['Portal', 2007]],
    boardgame: [['Catan', 1995], ['Wingspan', 2019], ['Azul', 2017], ['Pandemic', 2008]],
    book: [['Dracula', null], ['Frankenstein', null], ['The Haunting of Hill House', null], ['Carrie', null]],
  };

  for (const [type, titles] of Object.entries(KINDS)) {
    test(`${type}: added with real metadata, then played to a champion`, async () => {
      const sim = new Sim(`sim-kind-${type}`);
      await sim.bracket('admin', 'create', { name: `${type} cup`, 'max-titles': 4 });
      for (const [title, year] of titles) {
        const entry = await sim.addTitle(type, title, year);
        expect(entry.title).toBeTruthy();
        expect(entry.year).toBeTruthy();
        expect(entry.posterUrl).toMatch(/^https?:\/\//);
      }
      await sim.bracket('admin', 'open', { duration: '1d' });
      for (let n = 0; n < 3 && sim.tournament().status !== 'completed'; n++) {
        if (n > 0) await sim.bracket('admin', 'open', { duration: '1d' });
        await sim.everyoneVotes(favorite);
        await sim.passDeadlines();
      }
      expect(sim.tournament().status).toBe('completed');
    });
  }
});

describe('the setup form', () => {
  test('a CSV of 8 movies becomes a tournament that runs to a champion, with the form\'s voting time', async () => {
    const sim = new Sim('sim-setup-form');
    const csv = `title,year\n${HORROR_8.map(([t, y]) => `"${t}",${y}`).join('\n')}\n`;
    const parsed = mods.tournamentImport.parseImportFile(csv);
    expect(parsed.errors).toEqual([]);
    const results = await mods.tournamentImport.resolveRows('movie', parsed.rows);
    // The page shows each row's match; where there are several, the admin picks by year
    const rows = results.map((r, i) => {
      const entry = r.status === 'matched' ? r.entry : r.candidates.find(c => String(c.year) === String(HORROR_8[i][1]));
      expect(entry).toBeTruthy();
      return { entry, group: '' };
    });
    const saved = mods.tournamentImport.saveImportedTournament(sim.guildId, {
      settings: { name: 'From a Spreadsheet', type: 'movie', seeding: 'ordered', votingDuration: '12h' },
      rows,
      creatorId: 'admin',
    });
    expect(saved.success).toBe(true);

    await sim.bracket('admin', 'announce', {});
    const opened = clock.now;
    await sim.bracket('admin', 'open', {});
    // No duration given: the form's 12h is used
    expect(sim.openMatchups()[0].votingDeadline - opened).toBe(12 * 60 * 60 * 1000);
    for (let n = 0; n < 3 && sim.tournament().status !== 'completed'; n++) {
      if (n > 0) await sim.bracket('admin', 'open', {});
      await sim.everyoneVotes(favorite);
      await sim.passDeadlines();
    }
    expect(sim.tournament().champion.title).toBe('Alien');
  });

  test('board game and book matches carry their year and image', async () => {
    // Books: search returns year and cover, so every candidate shows them
    const [book] = await mods.tournamentImport.resolveRows('book', [{ title: 'Dracula', year: '', id: '' }]);
    for (const c of book.status === 'matched' ? [book.entry] : book.candidates.slice(0, 3)) {
      expect(c.year).toBeTruthy();
      expect(c.posterUrl).toMatch(/^https?:\/\//);
    }
    // Board games: search has the year; the image comes once one is settled on
    const [list] = await mods.tournamentImport.resolveRows('boardgame', [{ title: 'Catan', year: '', id: '' }]);
    expect(list.candidates[0].year).toBeTruthy();
    const [matched] = await mods.tournamentImport.resolveRows('boardgame', [{ title: 'Catan', year: '1995', id: '' }]);
    expect(matched.status).toBe('matched');
    expect(matched.entry.year).toBe('1995');
    expect(matched.entry.posterUrl).toMatch(/^https?:\/\//);
  });
});

describe('a groups tournament: 16 movies in 4 groups, then a knockout', () => {
  test('group votes, a partial vote thrown out, the scheduler closing groups, knockout to a champion on the watchlist', async () => {
    const sim = new Sim('sim-groups');
    await sim.configure(c => { c.watchlist = { ...(c.watchlist || {}), autoAddChampion: true }; });
    await sim.bracket('admin', 'create', { name: 'World Cup of Horror', 'max-titles': 36 });
    await sim.bracket('admin', 'resize', { groups: 4 });
    for (const [i, [title, year]] of HORROR_16.entries()) {
      await sim.addTitle('movie', title, year, { group: 'ABCD'[Math.floor(i / 4)] });
    }
    await sim.bracket('admin', 'list-groups');

    await sim.bracket('admin', 'open', { duration: '2d' });
    const post = sim.votingPost();
    // voters 1–3 pick titles 0 and 1 in every group, voter4 picks 0 and 2;
    // voter5 picks only one in group D, which doesn't count
    for (const v of sim.voters) {
      const ballot = await sim.openBallot(v, post);
      for (const g of 'ABCD') {
        const picks = v === 'voter4' ? [0, 2] : v === 'voter5' && g === 'D' ? [0] : [0, 1];
        for (const idx of picks) await sim.click(v, ballot, `group_vote_${g}_${idx}`);
      }
    }
    await sim.passDeadlines();
    const groups = sim.tournament().groupResults;
    for (const g of 'ABCD') {
      expect(groups[g].first.title).toBe(HORROR_16['ABCD'.indexOf(g) * 4][0]);
    }

    for (let n = 0; n < 4 && sim.tournament().status !== 'completed'; n++) {
      await sim.bracket('admin', 'open', { duration: '1d' });
      await sim.everyoneVotes(favorite);
      await sim.passDeadlines();
    }
    const t = sim.tournament();
    expect(t.status).toBe('completed');
    // How a title qualified is kept apart from what it is: overwriting the
    // media type with 'winner' is what kept groups champions off the watchlist
    expect(t.champion.type).toBe('movie');
    expect(['winner', 'runnerup', 'wildcard']).toContain(t.champion.qualifiedAs);
    const list = await mods.watchlist.getWatchlist(sim.guildId);
    expect(list.map(e => e.title)).toContain(t.champion.title);
    sim.writeTranscript('groups');
  });
});

/** A 4-group, 16-movie groups tournament, open for voting. */
async function openGroups(sim) {
  await sim.bracket('admin', 'create', { name: 'Groups', 'max-titles': 36 });
  await sim.bracket('admin', 'resize', { groups: 4 });
  for (const [i, [title, year]] of HORROR_16.entries()) {
    await sim.addTitle('movie', title, year, { group: 'ABCD'[Math.floor(i / 4)] });
  }
  await sim.bracket('admin', 'open', { duration: '2d' });
}

/**
 * Everyone votes in every group. In group A the first two titles tie for
 * first (voters 1–3 pick both; 4–5 pick the other two); elsewhere the first
 * title wins outright.
 */
async function groupVotesWithTieInA(sim) {
  const ballots = {};
  const post = sim.votingPost();
  for (const v of sim.voters) {
    const ballot = await sim.openBallot(v, post);
    ballots[v] = ballot;
    for (const g of 'ABCD') {
      const picks = g === 'A'
        ? (['voter1', 'voter2', 'voter3'].includes(v) ? [0, 1] : [2, 3])
        : (v === 'voter4' || v === 'voter5' ? [0, 2] : [0, 1]);
      for (const idx of picks) await sim.click(v, ballot, `group_vote_${g}_${idx}`);
    }
  }
  return ballots;
}

const tiebreakerPosts = (sim) => sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_')));

describe('group-stage ties', () => {
  for (const how of ['deadline', '/bracket close', '/bracket close-groups']) {
    test(`a tie for first, closed by ${how}: tiebreaker vote posted, decided, then on to the knockout`, async () => {
      const sim = new Sim(`sim-group-tie-${how.replace(/\W+/g, '-')}`);
      await openGroups(sim);
      const ballots = await groupVotesWithTieInA(sim);

      if (how === 'deadline') await sim.passDeadlines();
      else if (how === '/bracket close') await sim.bracket('admin', 'close', {});
      else await sim.bracket('admin', 'close-groups', { groups: 'A,B,C,D' });

      const [post] = tiebreakerPosts(sim);
      expect(post).toBeTruthy();
      expect(post.text).toContain(HORROR_16[0][0]);
      expect(post.text).toContain(HORROR_16[1][0]);

      // Group A's voting has closed: a vote on an old ballot is refused and changes nothing
      const before = JSON.stringify(sim.tournament().groups.A.movies.map(m => m.votes));
      await sim.click('voter4', ballots.voter4, 'group_vote_A_1');
      expect(JSON.stringify(sim.tournament().groups.A.movies.map(m => m.votes))).toBe(before);

      // Everyone breaks the tie for the second title
      const second = post.allComponents.find(c => c.customId.endsWith('_1'));
      for (const v of sim.voters) await sim.click(v, post, second.customId);
      await sim.passDeadlines();
      const a = sim.tournament().groupResults.A;
      expect(a.first.title).toBe(HORROR_16[1][0]);
      expect(a.second.title).toBe(HORROR_16[0][0]);

      // And the knockout starts and runs
      for (let n = 0; n < 4 && sim.tournament().status !== 'completed'; n++) {
        await sim.bracket('admin', 'open', { duration: '1d' });
        await sim.everyoneVotes(favorite);
        await sim.passDeadlines();
      }
      expect(sim.tournament().status).toBe('completed');
    });
  }
});

describe('/bracket extend-voting', () => {
  test('a matchup stays open past its old deadline and closes at the new one', async () => {
    const sim = new Sim('sim-extend');
    await straightBracket(sim, 'More Time', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    const oldDeadline = sim.openMatchups()[0].votingDeadline;

    await sim.advance(20 * 60 * 60 * 1000); // 20h in
    await sim.bracket('admin', 'extend-voting', { type: 'knockout', duration: '1d' });
    await sim.advance(oldDeadline - clock.now + 60 * 1000); // past the old deadline
    expect(sim.openMatchups()).toHaveLength(4);
    // ...and votes still count
    const [m] = sim.openMatchups();
    const ballot = await sim.openBallot('voter1');
    await sim.voteMatchup('voter1', ballot, m.id, favorite(m) === 1 ? 2 : 1);
    expect(sim.tournament().votes.voter1[m.id]).toBe(favorite(m) === 1 ? 2 : 1);

    await sim.passDeadlines();
    expect(sim.openMatchups()).toHaveLength(0);
    expect(sim.tournament().phase).toBe('semifinals');
  });
});

describe('seeding and the setup form', () => {
  /** Parse, match and save a CSV the way the setup form does. */
  async function fromForm(sim, csv, settings, years) {
    const parsed = mods.tournamentImport.parseImportFile(csv);
    expect(parsed.errors).toEqual([]);
    const results = await mods.tournamentImport.resolveRows('movie', parsed.rows);
    const rows = results.map((r, i) => ({
      entry: r.status === 'matched' ? r.entry : r.candidates.find(c => String(c.year) === String(years[i])),
      group: parsed.rows[i].group || '',
    }));
    const saved = mods.tournamentImport.saveImportedTournament(sim.guildId, { settings: { type: 'movie', ...settings }, rows, creatorId: 'admin' });
    expect(saved.errors).toBeUndefined();
    return saved.tournament;
  }

  test('ordered seeding: 1 meets 8, 4 meets 5, 2 meets 7, 3 meets 6', async () => {
    const sim = new Sim('sim-seeded');
    const csv = `title,year\n${HORROR_8.map(([t, y]) => `"${t}",${y}`).join('\n')}\n`;
    await fromForm(sim, csv, { name: 'Seeded', seeding: 'ordered' }, HORROR_8.map(r => r[1]));
    await sim.bracket('admin', 'open', { duration: '1d' });
    const pairs = sim.openMatchups().map(m => [m.movie1.title, m.movie2.title]);
    const seed = (n) => HORROR_8[n - 1][0];
    expect(pairs).toEqual([[seed(1), seed(8)], [seed(4), seed(5)], [seed(2), seed(7)], [seed(3), seed(6)]]);
  });

  test('a groups tournament from a CSV with a group column runs to a champion', async () => {
    const sim = new Sim('sim-form-groups');
    const csv = `title,year,group\n${HORROR_16.map(([t, y], i) => `"${t}",${y},${'ABCD'[Math.floor(i / 4)]}`).join('\n')}\n`;
    const t = await fromForm(sim, csv, { name: 'Form Groups', seeding: 'random' }, HORROR_16.map(r => r[1]));
    expect(t.mode).toBe('groups');
    expect(Object.keys(t.groups).sort()).toEqual(['A', 'B', 'C', 'D']);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const post = sim.votingPost();
    for (const v of sim.voters) {
      const ballot = await sim.openBallot(v, post);
      for (const g of 'ABCD') for (const idx of (v === 'voter5' ? [0, 2] : [0, 1])) await sim.click(v, ballot, `group_vote_${g}_${idx}`);
    }
    await sim.passDeadlines();
    for (let n = 0; n < 4 && sim.tournament().status !== 'completed'; n++) {
      await sim.bracket('admin', 'open', { duration: '1d' });
      await sim.everyoneVotes(favorite);
      await sim.passDeadlines();
    }
    expect(sim.tournament().status).toBe('completed');
  });
});

describe('tournaments started before 2.47.0', () => {
  test('a groups champion whose type says how it qualified still reaches the watchlist', async () => {
    const sim = new Sim('sim-legacy-champion');
    await sim.configure(c => { c.watchlist = { ...(c.watchlist || {}), autoAddChampion: true }; });
    const { addChampionToWatchlist } = await import('../src/utils/watchlistIntegration.js');
    const champion = { id: 348, title: 'Alien', year: '1979', type: 'winner' };
    const added = await addChampionToWatchlist(sim.guildId, { name: 'Old Cup', type: 'movie', champion, winner: champion });
    expect(added.added).toBe(true);
    const list = await mods.watchlist.getWatchlist(sim.guildId);
    expect(list.find(e => e.title === 'Alien')?.type).toBe('movie');
  });
});

describe('each voter sees their own avatar on their ballot', () => {
  const avatarOf = (ballot) => ballot.embeds[0].toJSON().thumbnail?.url;

  test('knockout ballots, when opened and after each vote; group ballots too', async () => {
    const sim = new Sim('sim-avatars', { voters: 2 });
    // voter3 has a server avatar, which wins over their account one
    sim.discord.addUser('voter3', { guildAvatar: 'https://cdn.example/guild/voter3.png' });
    sim.voters.push('voter3');

    await straightBracket(sim, 'Faces', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    for (const v of sim.voters) {
      const ballot = await sim.openBallot(v);
      const want = v === 'voter3' ? 'https://cdn.example/guild/voter3.png' : `https://cdn.example/${v}.png`;
      expect(avatarOf(ballot)).toBe(want);
      const [m] = sim.openMatchups();
      await sim.voteMatchup(v, ballot, m.id, 1); // redrawn after the vote
      expect(avatarOf(ballot)).toBe(want);
      const myVotes = await sim.bracket(v, 'my-votes');
      expect(avatarOf(myVotes.reply)).toBe(want);
    }

    const groups = new Sim('sim-avatars-groups', { voters: 2 });
    await openGroups(groups);
    const ballot = await groups.openBallot('voter2');
    expect(avatarOf(ballot)).toBe('https://cdn.example/voter2.png');
    await groups.click('voter2', ballot, 'group_vote_A_0');
    expect(avatarOf(ballot)).toBe('https://cdn.example/voter2.png');
  });
});

describe('Live Standings follow the matchup being voted on', () => {
  const standings = (sim) => sim.channel.posted.filter(m => /Live Standings/.test(m.embeds[0]?.toJSON().title || ''));

  for (const how of ['/bracket open matchups:1', '/bracket open-matchup']) {
    test(`one matchup at a time with ${how}: each new matchup's votes get a new card, below it`, async () => {
      // Seen live 2026-10-02: in a round run one matchup at a time, votes on
      // the new matchup edited the card posted for an earlier one, far up
      // the channel. Edits don't notify or move, so voters couldn't tell
      // their vote counted.
      const sim = new Sim(`sim-standings-${how.includes('matchups') ? 'open' : 'open-matchup'}`);
      await straightBracket(sim, 'Standings', 16, 'movie', HORROR_16);
      if (how.includes('matchups')) await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' });
      else {
        await sim.bracket('admin', 'open', { duration: '1d' }); // builds the 8-matchup round, opens none
        await sim.bracket('admin', 'open-matchup', { matchup: '1A', duration: '1d' });
      }
      await sim.everyoneVotes(favorite);
      const [first] = standings(sim);
      expect(first).toBeTruthy();
      const firstText = first.text;

      if (how.includes('matchups')) await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' });
      else await sim.bracket('admin', 'open-matchup', { matchup: '1B', duration: '1d' });
      const newMatchupPost = sim.votingPost();
      await sim.everyoneVotes(favorite);

      const cards = standings(sim);
      expect(cards).toHaveLength(2);
      const latest = cards[1];
      // The new card comes after the new matchup's post, where voters are
      expect(sim.channel.posted.indexOf(latest)).toBeGreaterThan(sim.channel.posted.indexOf(newMatchupPost));
      const [current] = sim.openMatchups();
      expect(latest.text).toContain(current.movie1.title);
      // ...and the earlier card still shows the earlier matchup, untouched
      expect(first.text).toBe(firstText);
    });
  }

  test('votes on the same open matchups keep updating one card', async () => {
    const sim = new Sim('sim-standings-same');
    await straightBracket(sim, 'One Card', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    expect(standings(sim)).toHaveLength(1);
  });
});

describe('the final, by its label', () => {
  test('open-matchup offers "Finals"; picking it opens the final, and close-matchup Finals crowns the champion', async () => {
    // Seen live 2026-10-03, at the end of a 32-title tournament: the
    // suggestion "Finals" was refused as 'Invalid label "FINALS"' — the
    // input is upper-cased, and the check only knew 'Finals'/'finals'
    const sim = new Sim('sim-finals-label');
    await straightBracket(sim, 'To the Final', 8, 'movie', HORROR_8);
    for (let n = 0; n < 2; n++) {
      await sim.bracket('admin', 'open', { duration: '1d' });
      await sim.everyoneVotes(favorite);
      await sim.passDeadlines();
    }
    expect(sim.tournament().phase).toBe('finals');

    const [choice] = await sim.suggest('admin', 'open-matchup', 'matchup');
    expect(choice.value).toBe('Finals');
    await sim.bracket('admin', 'open-matchup', { matchup: choice.value, duration: '1d' });
    expect(sim.openMatchups().map(m => m.round)).toEqual(['finals']);

    await sim.everyoneVotes(favorite);
    await sim.bracket('admin', 'close-matchup', { matchup: 'finals' });
    expect(sim.tournament().status).toBe('completed');
    expect(sim.tournament().champion.title).toBe('Alien');
  });

  test('a label that opens nothing leaves the matchups voting alone (by label, or a stale picker button)', async () => {
    // 8 titles: quarterfinals 1A–4A, few enough for single-matchup buttons
    const sim = new Sim('sim-open-nothing');
    await straightBracket(sim, 'Keep Voting', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { matchups: 2, duration: '1d' }); // opens 1A and 2A
    const open = () => sim.openMatchups().map(m => m.id).sort();
    const both = open();
    expect(both).toHaveLength(2);

    // 1A is already open: nothing to do, and 2A keeps voting
    const again = await sim.bracket('admin', 'open-matchup', { matchup: '1A', duration: '1d' });
    expect(again.reply.text).toMatch(/already open/);
    expect(open()).toEqual(both);

    // A picker button left in the channel for a matchup that has since been
    // decided: pressing it must not end the matchup voting now
    const picker = await sim.bracket('admin', 'open-matchup', { duration: '1d' }); // buttons for 3A, 4A
    const stale = picker.reply.allComponents.find(c => (c.customId || '').startsWith('open_matchup_'));
    await sim.click('admin', picker.reply, stale.customId); // opens 3A, closing 1A and 2A
    await sim.bracket('admin', 'open-matchup', { matchup: '4A', duration: '1d' }); // 4A opens, 3A closes: decided
    const now = open();
    expect(now).toHaveLength(1);
    await sim.click('admin', picker.reply, stale.customId); // 3A again: decided
    expect(open()).toEqual(now);
  });

  test('the final decided with /bracket close-matchup posts the final bracket and puts the champion on the watchlist', async () => {
    // close-matchup closes matchups itself, not through the scheduler, and
    // never added the champion to the watchlist
    const sim = new Sim('sim-final-close-matchup');
    await sim.configure(c => { c.watchlist = { ...(c.watchlist || {}), autoAddChampion: true }; });
    await straightBracket(sim, 'Close It', 4, 'movie', HORROR_8.slice(0, 4));
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    await sim.passDeadlines();
    await sim.bracket('admin', 'open-matchup', { matchup: 'Finals', duration: '1d' });
    await sim.everyoneVotes(favorite);
    await sim.bracket('admin', 'close-matchup', { matchup: 'Finals' });

    const finalPost = sim.channel.posted.filter(m => /— Final Bracket$/.test(m.embeds[0]?.toJSON().title || '')).pop();
    expect(finalPost.embeds[0].toJSON().description).toBe('**Champion: Alien**');
    const list = await mods.watchlist.getWatchlist(sim.guildId);
    expect(list.map(e => e.title)).toContain('Alien');
  });

  test('"Finals" before the final is refused, not taken as the first matchup', async () => {
    const sim = new Sim('sim-finals-early');
    await straightBracket(sim, 'Too Soon', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' }); // builds the quarterfinals, opens 1A
    const before = sim.openMatchups().map(m => m.id);
    const r = await sim.bracket('admin', 'open-matchup', { matchup: 'Finals', duration: '1d' });
    expect(r.reply.text).toMatch(/Invalid label/);
    expect(sim.openMatchups().map(m => m.id)).toEqual(before);
  });
});

describe('the bracket after each matchup', () => {
  // Doug asked for it 2026-10-03: once matchups are decided, post the bracket
  const bracketPosts = (sim) => sim.channel.posted.filter(m => /— (Bracket So Far|Final Bracket)$/.test(m.embeds[0]?.toJSON().title || ''));
  const resultPosts = (sim) => sim.channel.posted.filter(m => /- Results$/.test(m.embeds[0]?.toJSON().title || ''));

  test('a whole round closing at its deadline: one bracket image, after the results; the last shows the champion', async () => {
    const sim = new Sim('sim-bracket-after-round');
    await straightBracket(sim, 'Bracket Watch', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    await sim.passDeadlines();

    const [post] = bracketPosts(sim);
    expect(bracketPosts(sim)).toHaveLength(1); // four matchups, one image
    const json = post.embeds[0].toJSON();
    expect(json.title).toBe('🏆 Bracket Watch — Bracket So Far');
    expect(json.image.url).toBe('attachment://bracket.png');
    expect(post.attachments.map(a => a.name)).toEqual(['bracket.png']);
    const posted = sim.channel.posted;
    expect(posted.indexOf(post)).toBeGreaterThan(Math.max(...resultPosts(sim).map(r => posted.indexOf(r))));

    for (let n = 0; n < 2; n++) {
      await sim.bracket('admin', 'open', { duration: '1d' });
      await sim.everyoneVotes(favorite);
      await sim.passDeadlines();
    }
    expect(bracketPosts(sim)).toHaveLength(3); // one per round
    const final = bracketPosts(sim).at(-1).embeds[0].toJSON();
    expect(final.title).toBe('🏆 Bracket Watch — Final Bracket');
    expect(final.description).toBe('**Champion: Alien**');
  });

  test('one matchup at a time: a bracket image after each matchup is decided', async () => {
    const sim = new Sim('sim-bracket-after-each');
    await straightBracket(sim, 'Step by Step', 8, 'movie', HORROR_8);
    for (let n = 1; n <= 3; n++) {
      await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' }); // closes the previous one
      await sim.everyoneVotes(favorite);
      expect(bracketPosts(sim)).toHaveLength(n - 1);
    }
  });

  test('a tie posts no bracket until its tiebreaker decides it (scheduler, or /bracket resolve-tiebreaker)', async () => {
    for (const how of ['deadline', 'resolve-tiebreaker']) {
      const sim = new Sim(`sim-bracket-tie-${how}`, { voters: 4 });
      await straightBracket(sim, 'Tied Up', 8, 'movie', HORROR_8);
      await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' });
      await sim.everyoneVotes((m, v) => (['voter1', 'voter2'].includes(v) ? 1 : 2));
      // The tie closes by its deadline, or by close-matchup: no bracket yet
      if (how === 'deadline') await sim.passDeadlines();
      else await sim.bracket('admin', 'close-matchup', { matchup: '1A' });
      expect(bracketPosts(sim)).toHaveLength(0);

      const tb = sim.tournament().tiebreakers.find(t => t.status === 'active');
      if (how === 'deadline') await sim.passDeadlines();
      else await sim.bracket('admin', 'resolve-tiebreaker', { 'tiebreaker-id': tb.id, winner: 1 });
      expect(bracketPosts(sim)).toHaveLength(1);
    }
  });
});
