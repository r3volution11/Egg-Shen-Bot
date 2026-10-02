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
import { loadSim, finishSim, clock, favorite, restartBot } from './harness/tournamentSim.js';

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
