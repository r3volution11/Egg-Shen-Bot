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

import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { loadSim, finishSim, clock, favorite, useFakeKit, longestRegistry } from './harness/tournamentSim.js';

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
  test('from /bracket-setup create to a champion on the watchlist', async () => {
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

describe('the ballot\'s streak counts rounds voted in a row, not votes', () => {
  // It added one for every vote within 48 hours of the last: 4 votes in
  // the quarterfinals and 2 in the semifinals read "Streak: 6 rounds"
  const streakOf = (ballot) => /🔥 \*\*Streak:\*\* [^\n]*/.exec(ballot.embeds[0].description)?.[0] ?? null;
  const voteAll = async (sim, v, pick = 1) => {
    const ballot = await sim.openBallot(v);
    for (const m of sim.openMatchups()) await sim.voteMatchup(v, ballot, m.id, pick);
    return ballot;
  };

  test('one a round, however many votes; a round missed starts it again; a ballot doesn\'t show a broken streak', async () => {
    const sim = new Sim('sim-ballot-streak', { voters: 3 });
    await straightBracket(sim, 'Streaks', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });

    // Quarterfinals: voter1 votes in all four, and changes one twice;
    // voter2 votes; voter3 doesn't
    const ballot = await voteAll(sim, 'voter1');
    expect(streakOf(ballot)).toBe('🔥 **Streak:** 1 round');
    for (const pick of [2, 1]) await sim.voteMatchup('voter1', ballot, sim.openMatchups()[0].id, pick);
    expect(streakOf(ballot)).toBe('🔥 **Streak:** 1 round');
    await voteAll(sim, 'voter2');
    await sim.passDeadlines();

    // Semifinals: voter1 and voter3 vote, voter2 sits it out
    await sim.bracket('admin', 'open', { duration: '1d' });
    expect(sim.tournament().phase).toBe('semifinals');
    expect(streakOf(await voteAll(sim, 'voter1'))).toBe('🔥 **Streak:** 2 rounds');
    expect(streakOf(await voteAll(sim, 'voter3'))).toBe('🔥 **Streak:** 1 round');
    await sim.passDeadlines();

    // The final
    await sim.bracket('admin', 'open', { duration: '1d' });
    expect(sim.tournament().phase).toBe('finals');
    // Before voting: voter3's streak from the semifinals is alive; voter2's
    // ended when the semifinals went by without a vote
    expect(streakOf(await sim.openBallot('voter3'))).toBe('🔥 **Streak:** 1 round');
    expect(streakOf(await sim.openBallot('voter2'))).toBeNull();
    expect(streakOf(await voteAll(sim, 'voter1'))).toBe('🔥 **Streak:** 3 rounds');
    expect(streakOf(await voteAll(sim, 'voter2'))).toBe('🔥 **Streak:** 1 round');
    expect(streakOf(await voteAll(sim, 'voter3'))).toBe('🔥 **Streak:** 2 rounds');
    expect(sim.tournament().statistics.highestStreak).toBe(3);
  });

  test('in a groups tournament the group stage is one round, however many groups and clicks', async () => {
    const sim = new Sim('sim-ballot-streak-groups', { voters: 5 });
    await openGroups(sim);
    await voteInGroups(sim, ['A', 'B', 'C', 'D']);
    expect(sim.tournament().participation.voter1.streak).toBe(1);
    await sim.passDeadlines();
    // 4 groups: the knockout starts at the quarterfinals, the round after the groups
    await sim.bracket('admin', 'open', { duration: '1d' });
    expect(sim.tournament().phase).toBe('quarterfinals');
    expect(streakOf(await voteAll(sim, 'voter1'))).toBe('🔥 **Streak:** 2 rounds');
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
    const { displayTitle } = mods.tournamentUI;
    const line = (m, pick) => `${mods.tournamentUI.matchupLabel(m.position, m.round)}: `
      + (pick === 1 ? `✅ **${displayTitle(m.movie1)}** vs ${displayTitle(m.movie2)}` : `${displayTitle(m.movie1)} vs ✅ **${displayTitle(m.movie2)}**`);

    // Before voting: no list yet
    const ballot = await sim.openBallot('voter1');
    expect(ballot.embeds[0].description).toContain('Cast your first vote below!');
    expect(ballot.embeds[0].description).not.toContain('Total votes');

    // Vote two ways; the ballot answers with both, in bracket order, under Round 1
    const [a, b] = sim.openMatchups();
    await sim.voteMatchup('voter1', ballot, b.id, 2);
    await sim.voteMatchup('voter1', ballot, a.id, 1);
    expect(votesOn(ballot)).toBe(['**Round 1**', line(a, 1), line(b, 2)].join('\n'));
    expect(line(a, 1)).toMatch(/^1A: ✅ \*\*.+ \(\d{4}\)\*\* vs .+ \(\d{4}\)$/);

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

describe('with the emoji kit uploaded: a whole 32-title tournament', () => {
  // Every card a tournament posts, drawn with the longest custom emoji
  // there can be (37 characters each), through the real flow. The fake
  // rejects anything over Discord's limits, and the simulator checks after
  // every step that no custom emoji sits where Discord would show it raw:
  // a title, author, footer, button label, or inside a code span.
  test('live standings, ballots, status, voting posts, results and a tiebreaker all fit, with the kit only where it renders', async () => {
    const restore = useFakeKit();
    try {
      mods.bracket.resetVotingPostCooldowns();
      const reg = longestRegistry();
      const E = (code) => `<:${reg.get(code).name}:${reg.get(code).id}>`;
      const sim = new Sim('sim-kit-32', { voters: 4 });
      await straightBracket(sim, 'Kit Cup', 32, 'movie', HORROR_32);
      const standingsCards = () => sim.channel.posted.filter(m => /Live Standings/.test(m.embeds[0]?.toJSON().title || ''));
      const split = (m, voter) => (['voter1', 'voter2'].includes(voter) ? 1 : 2);

      let tiebreakers = 0;
      for (let n = 0; n < 20 && sim.tournament().status !== 'completed'; n++) {
        await sim.bracket('admin', 'open', { matchups: 4, duration: '1d' });
        if (sim.tournament().status === 'completed') break;
        // The first batch has one 2–2 matchup, which goes to a tiebreaker vote
        const tieId = n === 0 ? sim.openMatchups()[0].id : null;
        await sim.everyoneVotes((m, v) => (m.id === tieId ? split(m, v) : favorite(m)));
        await sim.bracket('voter1', 'status');
        await sim.bracket('voter2', 'my-votes');

        if (n === 0) {
          // Four open matchups with real titles: the two-bar layout, kit bars
          // and pills, the totals line with kit icons
          const live = standingsCards(sim).pop().embeds[0].toJSON().description;
          expect(live).toContain(`${E('bgl')}`);
          expect(live).toMatch(/> `\d+` votes? · \d+%\n/);
          expect(live).toContain(`${E('ballot')} \`${4 * 4}\` votes · ${E('people')} \`4\` voters · ${E('vs')} \`4\` matchups`);
          const ballot = await sim.openBallot('voter3');
          expect(ballot.embeds[0].description).toContain(`${E('tk1')} **`);
          const post = await sim.bracket('voter3', 'voting-post');
          const card = post.reply.embeds[0].toJSON();
          expect(card.description.startsWith(`${E('ballot')} **Kit Cup**`)).toBe(true);
          expect(card.description).toMatch(new RegExp(`${E('clock')} Voting closes <t:\\d+:R>`));
        }

        await sim.passDeadlines();
        if (tieId) {
          const post = sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_'))).pop();
          expect(post).toBeTruthy();
          const option1 = post.allComponents.find(c => c.customId.endsWith('_0'));
          for (const v of sim.voters) await sim.click(v, post, option1.customId);
          // The leader's bar: gold kit pieces, cap to cap
          expect(post.embeds[0].toJSON().description).toContain(`${E('byl')}${E('bym').repeat(8)}${E('byr')} ${sim.voters.length} votes`);
          await sim.passDeadlines();
          tiebreakers++;
        }
      }

      const t = sim.tournament();
      expect(t.status).toBe('completed');
      expect(tiebreakers).toBe(1);
      expect(t.knockoutBracket.filter(m => m.status === 'closed')).toHaveLength(31);

      // The scheduler's result cards: a split bar between the counts, kit
      // icons on the fields, the title and footer plain
      const results = sim.channel.posted.map(m => m.embeds[0]?.toJSON()).filter(e => / - Results$/.test(e?.title || ''));
      expect(results.length).toBeGreaterThan(0);
      for (const card of results) {
        expect(card.description).toMatch(/Voting has closed!\n`\d+` (<:es_b[a-z]{2}xxx_ab12:\d+>){10} `\d+`/);
        expect(card.fields.map(f => f.name)).toEqual([`${E('trophy')} Winner`, `${E('med2')} Runner-up`]);
        expect(card.fields[0].value).toMatch(/^\*\*.+\*\*\n`\d+` votes?$/);
      }
      expect(sim.discord.violations).toEqual([]);
      sim.writeTranscript('kit-32');
    } finally {
      restore();
    }
  }, 120_000);
});

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
    // Votes in: the leader's bar is gold (rankedBar; plain squares, as no
    // kit is uploaded here), the other option's empty
    const counted = post.embeds[0].toJSON().description;
    expect(counted).toContain(`${'🟨'.repeat(10)} ${sim.voters.length} votes`);
    expect(counted).toContain(`${'⬜'.repeat(10)} 0 votes`);
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

describe('/bracket my-votes in the group stage', () => {
  // Every group record was read as two picks: one pick showed
  // "#NaN (undefined)", and none (both deselected) "#NaN (undefined) and #NaN (undefined)"
  const fieldOf = (reply, prefix) => (reply.embeds[0].toJSON().fields || []).find(f => f.name.startsWith(prefix))?.value;

  test('one pick, two picks and none each read as what they are', async () => {
    const sim = new Sim('sim-my-votes-groups', { voters: 1 });
    await openGroups(sim);
    const [a0, a1] = sim.tournament().groups.A.movies;
    const b0 = sim.tournament().groups.B.movies[0];
    const ballot = await sim.openBallot('voter1');
    await sim.click('voter1', ballot, 'group_vote_A_0');
    await sim.click('voter1', ballot, 'group_vote_A_1');
    await sim.click('voter1', ballot, 'group_vote_B_0');
    await sim.click('voter1', ballot, 'group_vote_C_2');
    await sim.click('voter1', ballot, 'group_vote_C_2'); // and takes it back

    const mine = await sim.bracket('voter1', 'my-votes');
    expect(mine.reply.ephemeralFor).toBe('voter1');
    expect(mine.reply.text).not.toMatch(/NaN|undefined/);
    expect(fieldOf(mine.reply, '✅ Groups Voted')).toBe(
      `**Group A** - Voted for #1 (${a0.title}) and #2 (${a1.title})\n⏰ 2d 0h remaining\n\n` +
      `**Group B** - Picked #1 (${b0.title}). Pick 1 more: a single pick isn't counted\n⏰ 2d 0h remaining`,
    );
    expect(fieldOf(mine.reply, '✅ Groups Voted').startsWith('**Group A**')).toBe(true);
    expect(mine.reply.embeds[0].toJSON().fields.find(f => f.name.startsWith('✅ Groups Voted')).name).toBe('✅ Groups Voted (2)');
    // C, with its pick taken back, is still to vote, with D
    expect(fieldOf(mine.reply, '🗳️ Groups Available')).toMatch(/^\*\*Group C\*\* - ⏰ 2d 0h remaining\n\*\*Group D\*\* - ⏰ 2d 0h remaining\n\n/);
  });
});

describe('/bracket help says what the bot does', () => {
  // It said picks show blue (they're purple: ButtonStyle.Primary) and
  // promised "1-hour warnings", which only votes of 2 to 6 hours get
  const fieldOf = (reply, name) => reply.embeds[0].toJSON().fields.find(f => f.name === name).value;

  test('purple picks, and the reminder timing the scheduler really uses', async () => {
    const sim = new Sim('sim-help', { voters: 1 });
    const help = await sim.bracket('voter1', 'help');
    expect(help.reply.ephemeralFor).toBe('voter1');
    const auto = fieldOf(help.reply, '⚡ Automatic Features').split('\n');
    expect(auto).toContain('✅ **"Closing soon" reminder** 2 hours before the deadline (1 hour before for votes of 2-6h; 5-10 minutes in for shorter ones)');
    expect(auto).toContain('✅ **Button feedback** - selected votes show purple');
    expect(fieldOf(help.reply, '🗳️ How to Vote (Everyone)')).toContain('• Select your **top 2** in each group - your picks turn purple, and ✅ marks a group once you have both');
    expect(fieldOf(help.reply, '🎮 Smart Commands (Admin)')).toContain('• `/bracket open` - Opens next round (any phase; groups 5 at a time, as a ballot holds 5)');
    expect(help.reply.text).not.toMatch(/blue|1-hour warning|checkmarks show your picks/i);
  });

  // The reminder the help describes, as the scheduler sends it
  const MIN = 60 * 1000;
  for (const [duration, lengthMs, remindAt, says] of [
    ['1d', 24 * 60 * MIN, 22 * 60 * MIN, '2 hours before'],
    ['4h', 4 * 60 * MIN, 3 * 60 * MIN, '1 hour before'],
    ['1h', 60 * MIN, 10 * MIN, '10 minutes in'],
    ['20m', 20 * MIN, 5 * MIN, '5 minutes in'],
  ]) {
    test(`a ${duration} vote is reminded ${says}`, async () => {
      const sim = new Sim(`sim-help-reminder-${duration}`, { voters: 1 });
      await straightBracket(sim, 'Reminders', 2, 'movie', HORROR_8.slice(0, 2));
      await sim.bracket('admin', 'open', { duration });
      expect(sim.openMatchups()[0].votingDeadline - clock.now).toBe(lengthMs);
      const reminders = () => sim.channel.posted.filter(m => m.embeds[0]?.toJSON().title === '⏰ Voting Closing Soon!');
      await sim.advance(remindAt - MIN);
      expect(reminders()).toHaveLength(0);
      await sim.advance(MIN);
      expect(reminders()).toHaveLength(1);
    });
  }
});

describe('a tie\'s vote runs for the tournament\'s own tiebreaker time', () => {
  // The setup form's "Tiebreaker time" was used only by the close
  // commands. A tie found at the deadline, by opening the next matchup, or
  // with a Close button always got 1 hour.
  const HOUR = 60 * 60 * 1000;
  const split = (m, voter) => (['voter1', 'voter2'].includes(voter) ? 1 : 2);
  const tiebreakerPost = (sim) => sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_'))).pop();

  /** An 8-movie bracket saved by the setup form with these settings. */
  async function bracketFromForm(sim, settings) {
    const results = await mods.tournamentImport.resolveRows('movie', HORROR_8.map(([title, year]) => ({ title, year: String(year), id: '' })));
    const rows = results.map((r, i) => ({ entry: r.status === 'matched' ? r.entry : r.candidates.find(c => String(c.year) === String(HORROR_8[i][1])), group: '' }));
    const saved = mods.tournamentImport.saveImportedTournament(sim.guildId, { settings: { name: 'Tie Time', type: 'movie', ...settings }, rows, creatorId: 'admin' });
    expect(saved.errors).toBeUndefined();
  }

  /** The tie's stored deadline is `ms` after it was found, and its card says so. */
  function expectTiebreakerRuns(sim, ms) {
    const [tb] = sim.tournament().tiebreakers.filter(t => t.status === 'active');
    expect(tb.deadline - tb.createdAt).toBe(ms);
    expect(tb.createdAt).toBe(clock.now);
    const closes = tiebreakerPost(sim).embeds[0].toJSON().fields.find(f => f.name === '⏰ Closes');
    expect(closes.value).toBe(`<t:${Math.floor((clock.now + ms) / 1000)}:R>`);
  }

  test('the setup form stores its default as 1h, and a tie with nothing set gets 1 hour', async () => {
    const sim = new Sim('sim-tie-time-default', { voters: 4 });
    await bracketFromForm(sim, { tiebreakerDuration: '' });
    expect(sim.tournament().tiebreakerDuration).toBe('1h');
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    await sim.passDeadlines();
    expectTiebreakerRuns(sim, HOUR);
  });

  for (const how of ['the deadline', 'opening the next matchup', 'the Close button', '/bracket close']) {
    test(`a knockout tie found by ${how} gets the form's 3h`, async () => {
      const sim = new Sim(`sim-tie-time-${how.replace(/\W+/g, '-')}`, { voters: 4 });
      await bracketFromForm(sim, { tiebreakerDuration: '3h' });
      await sim.bracket('admin', 'open', how === 'opening the next matchup' ? { duration: '1d', matchups: 1 } : { duration: '1d' });
      const [tied] = sim.openMatchups();
      await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
      if (how === 'the deadline') await sim.passDeadlines();
      else if (how === 'opening the next matchup') await sim.bracket('admin', 'open', { duration: '1d', matchups: 1 });
      else if (how === '/bracket close') await sim.bracket('admin', 'close', {});
      else {
        const picker = await sim.bracket('admin', 'close-matchup', {});
        await sim.click('admin', picker.reply, `close_matchup_${tied.id}`);
      }
      expect(sim.tournament().knockoutBracket.find(m => m.id === tied.id).status).toBe('tiebreaker');
      expectTiebreakerRuns(sim, 3 * HOUR);
    });
  }

  test('a group tie found at the deadline gets the form\'s 3h', async () => {
    const sim = new Sim('sim-tie-time-groups', { voters: 5 });
    await groupsFromForm(sim, 4, 'Group Tie Time', { tiebreakerDuration: '3h' });
    await sim.bracket('admin', 'open', { duration: '2d' });
    await groupVotesWithTieInA(sim);
    await sim.passDeadlines();
    expect(sim.tournament().groups.A.status).toBe('tiebreaker');
    expectTiebreakerRuns(sim, 3 * HOUR);
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

describe('/bracket-setup (split out of /bracket in 2.62.0)', () => {
  test('a tournament set up under its real name runs on /bracket', async () => {
    const sim = new Sim('sim-setup-command');
    await sim.command('admin', 'bracket-setup', 'create', { name: 'Split Decision', 'max-titles': 4, seeding: 'ordered' });
    for (const [title, year] of HORROR_8.slice(0, 4)) await sim.addTitle('movie', title, year);
    expect(sim.titleCount()).toBe(4);
    await sim.command('admin', 'bracket', 'open', { duration: '1d' });
    expect(sim.openMatchups().map(m => [m.movie1.seed, m.movie2.seed])).toEqual([[1, 4], [2, 3]]);
  });

  test('members are refused, and the server toggle turns it off with /bracket', async () => {
    const sim = new Sim('sim-setup-gate');
    // Discord hides it from members without Moderate Members (admins see all)
    expect(mods.bracketSetup.data.toJSON().default_member_permissions).toBe((1n << 40n).toString());
    const denied = await sim.command('voter1', 'bracket-setup', 'create', { name: 'Not Mine' });
    expect(denied.reply.text).toMatch(/administrators and moderators/i);
    expect(sim.tournament()).toBeFalsy();

    // Defaults leave /bracket on; turning it off for members turns off both
    await sim.configure(cfg => { cfg.commandPermissions.bracket = false; });
    const off = await sim.command('voter1', 'bracket-setup', 'setup-link');
    expect(off.reply.text).toContain('`/bracket-setup` command is currently disabled');
  });

  test('Discord never sends a setup subcommand to /bracket any more', async () => {
    const sim = new Sim('sim-setup-moved');
    await expect(sim.command('admin', 'bracket', 'create', { name: 'Old Habits' })).rejects.toThrow(/no "create" subcommand/);
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

describe('with the emoji kit uploaded: a groups tournament', () => {
  test('group results get kit medals and ticks, a group tiebreaker its kit bars, to a champion', async () => {
    const restore = useFakeKit();
    try {
      const reg = longestRegistry();
      const E = (code) => `<:${reg.get(code).name}:${reg.get(code).id}>`;
      const sim = new Sim('sim-kit-groups');
      await openGroups(sim);
      await groupVotesWithTieInA(sim);
      await sim.passDeadlines();

      // Group A tied for first: its tiebreaker, voted through the real
      // handler, which redraws the bars with the kit
      const [post] = tiebreakerPosts(sim);
      expect(post).toBeTruthy();
      const option1 = post.allComponents.find(c => c.customId.endsWith('_0'));
      for (const v of sim.voters) await sim.click(v, post, option1.customId);
      expect(post.embeds[0].toJSON().description).toContain(`${E('byl')}${E('bym').repeat(8)}${E('byr')} ${sim.voters.length} votes`);
      await sim.passDeadlines();

      // B, C and D were decided outright: medals in the field names, the
      // counts in pills, a kit tick on the two that go through
      const results = sim.channel.posted.map(m => m.embeds[0]?.toJSON()).filter(e => /^📊 Group [BCD] Results/.test(e?.title || ''));
      expect(results).toHaveLength(3);
      for (const card of results) {
        const g = card.title.match(/Group ([BCD])/)[1];
        const first = HORROR_16['ABCD'.indexOf(g) * 4][0];
        expect(card.fields[0].name).toBe(`${E('med1')} ${first}`);
        expect(card.fields.slice(1, 3).map(f => f.name.split(' ')[0])).toEqual([E('med2'), E('med3')]);
        expect(card.fields[0].value).toMatch(new RegExp(`^\`\\d+\` votes?\\n${E('tk1')} \\*\\*Advances\\*\\*$`));
        expect(card.fields[2].value).toMatch(/^`\d+` votes?$/);
      }

      for (let n = 0; n < 4 && sim.tournament().status !== 'completed'; n++) {
        await sim.bracket('admin', 'open', { duration: '1d' });
        await sim.everyoneVotes(favorite);
        await sim.passDeadlines();
      }
      expect(sim.tournament().status).toBe('completed');
      expect(sim.discord.violations).toEqual([]);
      sim.writeTranscript('kit-groups');
    } finally {
      restore();
    }
  }, 120_000);
});

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

/** A groups tournament of `groupCount` × 4 recorded movies, from the setup form (Sim.groupsFromForm). */
async function groupsFromForm(sim, groupCount, name = 'World Cup of Horror', settings = {}) {
  const entries = await sim.groupsFromForm(HORROR_32, groupCount, { name, ...settings });
  expect(entries).toHaveLength(groupCount * 4);
  return entries;
}

const groupsVoting = (sim) => Object.entries(sim.tournament().groups).filter(([, g]) => g.votingOpen).map(([id]) => id).sort();

/** The groups a ballot shows, in order, from its vote buttons (a row each). */
const ballotGroups = (ballot) => ballot.components.map(row => /^group_vote_([A-L])_\d$/.exec(row.components[0].customId)?.[1]);

/**
 * Each voter opens a ballot from the newest voting post and votes in every
 * group on it: voters 1–3 pick titles 1 and 2, the rest titles 1 and 3, so
 * title 1 wins each group outright. Checks every ballot shows `letters`, a
 * row each, when opened and after every click.
 */
async function voteInGroups(sim, letters) {
  const post = sim.votingPost();
  for (const v of sim.voters) {
    const ballot = await sim.openBallot(v, post);
    expect(ballotGroups(ballot)).toEqual(letters);
    for (const g of letters) {
      for (const idx of (['voter1', 'voter2', 'voter3'].includes(v) ? [0, 1] : [0, 2])) {
        await sim.click(v, ballot, `group_vote_${g}_${idx}`);
        expect(ballotGroups(ballot)).toEqual(letters);
      }
    }
  }
}

describe('a 48-title groups tournament: 12 groups, at most 5 voting at once', () => {
  // A member's ballot is a row of buttons per group, and Discord shows 5
  // rows. /bracket open used to open all 12 groups at once, and Discord
  // refused every ballot ("This interaction failed"); /bracket open-groups
  // opened any number, and with 10 or more its card went past 10 embeds.

  test('/bracket open opens the groups five at a time, every ballot fits, and it runs to a champion', async () => {
    const sim = new Sim('sim-groups-12', { voters: 5 });
    await groupsFromForm(sim, 12);
    expect(sim.tournament().groupCount).toBe(12);

    const first = await sim.bracket('admin', 'open', { duration: '2d' });
    expect(groupsVoting(sim)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(first.reply.text).toContain('**Opened groups:** A, B, C, D, E');
    expect(first.reply.text).toContain('**Still to come:** F, G, H, I, J, K, L.');
    expect(sim.votingPost().findComponent('start_group_voting_A,B,C,D,E')).toBeTruthy();
    await voteInGroups(sim, ['A', 'B', 'C', 'D', 'E']);

    // No sixth group while five vote, by either command, and nothing changes
    const more = await sim.bracket('admin', 'open-groups', { groups: 'F', duration: '1d' });
    expect(more.reply.text).toContain('A ballot holds 5 groups');
    expect(more.reply.text).toContain('5 are voting now (A, B, C, D, E), so none can open until some close.');
    const again = await sim.bracket('admin', 'open', { duration: '1d' });
    expect(again.reply.text).toContain('5 groups are already voting** (A, B, C, D, E)');
    expect(groupsVoting(sim)).toEqual(['A', 'B', 'C', 'D', 'E']);

    await sim.passDeadlines();
    expect(Object.keys(sim.tournament().groupResults).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);

    // The next five with /bracket open, the last two with /bracket open-groups
    const second = await sim.bracket('admin', 'open', { duration: '2d' });
    expect(groupsVoting(sim)).toEqual(['F', 'G', 'H', 'I', 'J']);
    expect(second.reply.text).toContain('**Still to come:** K, L.');
    await voteInGroups(sim, ['F', 'G', 'H', 'I', 'J']);
    await sim.passDeadlines();
    const kl = await sim.bracket('admin', 'open-groups', { groups: 'K,L', duration: '2d' });
    expect(groupsVoting(sim)).toEqual(['K', 'L']);
    await voteInGroups(sim, ['K', 'L']);
    await sim.passDeadlines();
    // Its card closed once for both groups: K and L each closing added
    // another "🔒 CLOSED". (Its emoji was a broken character, too.)
    expect(kl.reply.embeds[0].toJSON().title).toBe('🗳️ Group Stage Voting is Now Open! 🔒 CLOSED');
    expect(kl.reply.allComponents.every(c => c.disabled)).toBe(true);

    const t = sim.tournament();
    expect(Object.keys(t.groupResults)).toHaveLength(12);
    for (const g of mods.bracket.GROUP_LETTERS) expect(t.groupResults[g].first.title).toBe(t.groups[g].movies[0].title);

    // 24 through and 8 wildcards: a Round of 32, opened four at a time
    for (let n = 0; n < 16 && sim.tournament().status !== 'completed'; n++) {
      await sim.bracket('admin', 'open', { duration: '1d', matchups: 4 });
      if (n === 0) expect(sim.tournament().phase).toBe('round_of_32');
      await sim.everyoneVotes(favorite);
      await sim.passDeadlines();
    }
    expect(sim.tournament().status).toBe('completed');
    expect(sim.discord.violations).toEqual([]);
    sim.writeTranscript('groups-12');
  }, 60_000);

  test('/bracket open-groups with more than 5 groups is refused and opens nothing', async () => {
    const sim = new Sim('sim-groups-10-at-once', { voters: 2 });
    await groupsFromForm(sim, 10);
    const i = await sim.bracket('admin', 'open-groups', { groups: 'A,B,C,D,E,F,G,H,I,J', duration: '1d' });
    expect(i.reply.text).toContain('A ballot holds 5 groups');
    expect(i.reply.text).toContain('Nothing was opened.');
    expect(groupsVoting(sim)).toEqual([]);
    expect(sim.hasVotingPost()).toBe(false);

    // Five is fine: its card has the opening embed and one per group, 6 of Discord's 10
    const ok = await sim.bracket('admin', 'open-groups', { groups: 'A,B,C,D,E', duration: '1d' });
    expect(ok.reply.embeds).toHaveLength(6);
    expect(groupsVoting(sim)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  test('batches opened one after another: each ballot keeps its own groups, and a sixth group is refused', async () => {
    const sim = new Sim('sim-groups-batches', { voters: 2 });
    await groupsFromForm(sim, 9);
    await sim.bracket('admin', 'open-groups', { groups: 'A,B,C', duration: '1d' });
    const firstPost = sim.votingPost();
    const ballot = await sim.openBallot('voter1', firstPost);
    expect(ballotGroups(ballot)).toEqual(['A', 'B', 'C']);

    await sim.bracket('admin', 'open-groups', { groups: 'D,E', duration: '1d' });
    expect(groupsVoting(sim)).toEqual(['A', 'B', 'C', 'D', 'E']);
    // A click on the first ballot redraws A–C, not every group now open
    await sim.click('voter1', ballot, 'group_vote_A_0');
    expect(ballotGroups(ballot)).toEqual(['A', 'B', 'C']);
    expect(sim.tournament().votes.voter1.A).toEqual([0]);
    // ...and the second batch's ballot shows its own
    expect(ballotGroups(await sim.openBallot('voter2'))).toEqual(['D', 'E']);

    const sixth = await sim.bracket('admin', 'open-groups', { groups: 'F', duration: '1d' });
    expect(sixth.reply.text).toContain('none can open until some close');
    expect(groupsVoting(sim)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  test('a voting card an earlier version posted for 12 open groups gets a clear refusal, not a failed interaction', async () => {
    const sim = new Sim('sim-groups-12-legacy', { voters: 1 });
    // What 2.74.1's /bracket open left behind: all 12 groups voting, one card
    sim.groupsVotingLimit = 12;
    await groupsFromForm(sim, 12);
    const letters = mods.bracket.GROUP_LETTERS;
    mods.bracketManager.openGroupVoting(sim.guildId, letters, clock.now + DAY, sim.channel.id);
    await sim.channel.send({
      content: 'Group Stage Voting Opened',
      components: [{ type: 1, components: [{ type: 2, style: 3, label: '🗳️ Start Voting', custom_id: `start_group_voting_${letters.join(',')}` }] }],
    });
    const click = await sim.click('voter1', sim.votingPost(), `start_group_voting_${letters.join(',')}`);
    const [answer] = click.responses;
    expect(answer.ephemeralFor).toBe('voter1');
    expect(answer.text).toBe('❌ **Too many groups open** (12)\n\nA ballot holds 5 groups: Discord shows 5 rows of buttons. Ask an admin to close some groups and open the rest 5 at a time.');
    expect(answer.components).toHaveLength(0);
  });
});

describe('closing groups by command posts their results', () => {
  // As the deadline does (a results card per group) and close-groups did
  // (top three per group). /bracket close replied only "Closed groups: A, B,
  // C, D", so a group stage closed with it never said who went through.
  const fieldsOf = (reply) => reply.embeds[0].toJSON().fields || [];
  const top3 = (sim, g) => {
    const [first, second, third] = sim.tournament().groups[g].movies;
    return `🥇 **${first.title}** (5 votes)\n🥈 **${second.title}** (3 votes)\n🥉 **${third.title}** (2 votes)`;
  };

  test('/bracket close in the group stage posts every group\'s top three', async () => {
    const sim = new Sim('sim-close-group-results');
    await openGroups(sim);
    await voteInGroups(sim, ['A', 'B', 'C', 'D']);
    const close = await sim.bracket('admin', 'close', {});
    const card = close.reply.embeds[0].toJSON();
    expect(card.title).toBe('🏁 Group A, B, C, D Results');
    expect(fieldsOf(close.reply)).toEqual(['A', 'B', 'C', 'D'].map(g => ({ name: `Group ${g}`, value: top3(sim, g), inline: false })));
    expect(Object.values(sim.tournament().groups).every(g => g.status === 'closed')).toBe(true);
  });

  test('/bracket close-groups with a tie in one group still posts the others\' results, and the tie\'s vote', async () => {
    const sim = new Sim('sim-close-groups-tie-results');
    await openGroups(sim);
    await groupVotesWithTieInA(sim);
    const close = await sim.bracket('admin', 'close-groups', { groups: 'A,B,C,D' });
    const fields = fieldsOf(close.reply);
    // B, C and D are decided: their top three, as with no tie
    expect(fields.filter(f => /^Group [BCD]$/.test(f.name)).map(f => f.name)).toEqual(['Group B', 'Group C', 'Group D']);
    expect(fields.find(f => f.name === 'Group B').value).toBe(top3(sim, 'B'));
    // A isn't: its tie is named, and its vote posted
    const [a0, a1] = sim.tournament().groups.A.movies;
    const tie = fields.find(f => f.name === '🔀 Tiebreakers');
    expect(tie.value).toContain(`**Group A** - 1st place tie: ${a0.title} vs ${a1.title}`);
    expect(tiebreakerPosts(sim)).toHaveLength(1);
  });

  test('a group closed on a tie takes no more votes, so its places can\'t change before the tiebreaker decides it', async () => {
    const sim = new Sim('sim-tied-group-closed');
    await openGroups(sim);
    const ballots = await groupVotesWithTieInA(sim);
    await sim.bracket('admin', 'close', {});
    const before = JSON.stringify(sim.tournament().groups.A.movies.map(m => m.votes));
    // voter1 picked titles 1 and 2 in A; dropping title 2 would have been
    // counted, and finalizing the tiebreaker reads 2nd and 3rd from the votes
    await sim.click('voter1', ballots.voter1, 'group_vote_A_1');
    expect(JSON.stringify(sim.tournament().groups.A.movies.map(m => m.votes))).toBe(before);
    expect(sim.tournament().groups.A.votingOpen).toBe(false);
    // ...and closing it again, either way, doesn't (a second tiebreaker)
    await sim.bracket('admin', 'close', {});
    const again = await sim.bracket('admin', 'close-groups', { groups: 'A' });
    expect(again.reply.text).toBe('❌ Group A isn\'t open for voting.');
    expect(sim.tournament().tiebreakers.filter(t => t.groupId === 'A')).toHaveLength(1);
  });

  test('a tied group an earlier version saved still marked open is treated as waiting on its tiebreaker', async () => {
    const sim = new Sim('sim-tied-group-legacy');
    await openGroups(sim);
    const ballots = await groupVotesWithTieInA(sim);
    await sim.bracket('admin', 'close-groups', { groups: 'A' });
    // As 2.74.1 left a tie: status 'tiebreaker', votingOpen still true
    const t = sim.tournament();
    t.groups.A.votingOpen = true;
    mods.bracketManager.saveTournament(sim.guildId, t);

    const before = JSON.stringify(sim.tournament().groups.A.movies.map(m => m.votes));
    await sim.click('voter1', ballots.voter1, 'group_vote_A_1');
    expect(JSON.stringify(sim.tournament().groups.A.movies.map(m => m.votes))).toBe(before);
    // Status and the voting card don't list it as voting
    const status = await sim.bracket('voter1', 'status');
    expect(status.reply.text).not.toContain('**Group A**');
    expect(status.reply.text).toContain('**Group B**');
    const card = await sim.bracket('admin', 'voting-post');
    expect(card.reply.text).toContain('**Groups:** B, C, D');
    // /bracket close takes B, C and D, not A again
    const close = await sim.bracket('admin', 'close', {});
    expect(close.reply.embeds[0].toJSON().title).toBe('🏁 Group B, C, D Results');
    expect(sim.tournament().tiebreakers.filter(x => x.groupId === 'A')).toHaveLength(1);
  });
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

describe('seeding options: by rating, visible seeds, ties to the higher seed', () => {
  const split = (m, voter) => (['voter1', 'voter2'].includes(voter) ? 1 : 2);
  const tiebreakerPosts = (sim) => sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_')));

  async function seededBracket(sim, name, options) {
    await sim.bracket('admin', 'create', { name, 'max-titles': 8, ...options });
    for (const [title, year] of HORROR_8) await sim.addTitle('movie', title, year);
  }

  test('/bracket-setup create seeding:rating seeds by the recorded TMDB ratings and shows them', async () => {
    const sim = new Sim('sim-seed-rating');
    await seededBracket(sim, 'Rated', { seeding: 'rating' });
    const byRating = [...sim.tournament().titles]
      .sort((a, b) => mods.bracketManager.titleRating(b) - mods.bracketManager.titleRating(a))
      .map(t => t.title);
    expect(sim.tournament().titles.every(t => mods.bracketManager.titleRating(t) > 0)).toBe(true);
    // The ranking isn't just the order they were added, or this proves nothing
    expect(byRating).not.toEqual(HORROR_8.map(r => r[0]));

    await sim.bracket('admin', 'open', { duration: '1d' });
    const seed = (n) => byRating[n - 1];
    expect(sim.openMatchups().map(m => [m.movie1.title, m.movie2.title]))
      .toEqual([[seed(1), seed(8)], [seed(4), seed(5)], [seed(2), seed(7)], [seed(3), seed(6)]]);
    // Voters see the seeds on their ballot
    const ballot = await sim.openBallot('voter1');
    expect(ballot.allComponents.map(c => c.label).join('\n')).toContain(`(1) ${seed(1)}`);
  });

  test('ties:higher-seed — a tie goes straight to the better seed, which keeps its seed', async () => {
    const sim = new Sim('sim-seed-tie', { voters: 4 });
    await seededBracket(sim, 'Chalk', { seeding: 'ordered', ties: 'higher-seed' });
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    expect([tied.movie1.seed, tied.movie2.seed]).toEqual([1, 8]);
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    await sim.passDeadlines();

    expect(tiebreakerPosts(sim)).toHaveLength(0);
    const t = sim.tournament();
    const decided = t.knockoutBracket.find(m => m.id === tied.id);
    expect(decided.winner.title).toBe(HORROR_8[0][0]);
    expect(t.knockoutResults[tied.id]).toMatchObject({ wasTie: true, decidedBy: 'seed' });
    expect(sim.channelText()).toContain('Tied 2–2: the higher seed advances.');
    // Seed 1 carries its seed into the semifinal
    const semi = t.knockoutBracket.find(m => m.round === 'semifinals' && m.movie1?.title === HORROR_8[0][0]);
    expect(semi.movie1.seed).toBe(1);
  });

  test('a worse seed winning is called out as an upset', async () => {
    const sim = new Sim('sim-seed-upset');
    await seededBracket(sim, 'Cinderella', { seeding: 'ordered' });
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [first] = sim.openMatchups();
    await sim.everyoneVotes((m) => (m.id === first.id ? 2 : 1));
    await sim.passDeadlines();
    expect(sim.channelText()).toContain('🚨 Upset! (8) knocks out (1)');
    expect(sim.channelText()).not.toContain('(5) knocks out (4)'); // the favourites won elsewhere
  });

  test('with random seeding, higher-seed ties still get a runoff and no seeds are shown', async () => {
    const sim = new Sim('sim-seed-random-tie', { voters: 4 });
    await seededBracket(sim, 'Lottery', { ties: 'higher-seed' });
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    await sim.passDeadlines();
    expect(tiebreakerPosts(sim)).toHaveLength(1);
    expect(sim.channelText()).not.toMatch(/\(\d\) /);
  });

  test('a tournament saved before seeding options runs exactly as before: runoff, no seeds', async () => {
    const sim = new Sim('sim-seed-legacy', { voters: 4 });
    await straightBracket(sim, 'Old Timer', 8, 'movie', HORROR_8);
    // Strip what this release added, as in a file written by an older version
    const t = sim.tournament();
    delete t.seeding;
    delete t.ties;
    mods.bracketManager.saveTournament(sim.guildId, t);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    await sim.passDeadlines();
    expect(tiebreakerPosts(sim)).toHaveLength(1);
    expect(sim.channelText()).not.toMatch(/\(\d\) /);
    expect(sim.channelText()).not.toContain('Upset');
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

describe('the drawn result image on each matchup result (cardImages.js)', () => {
  const resultPosts = (sim) => sim.channel.posted.filter(m => /- Results$/.test(m.embeds[0]?.toJSON().title || ''));
  const split = (m, voter) => (['voter1', 'voter2'].includes(voter) ? 1 : 2);
  const posterOf = (sim, title) => sim.tournament().titles.find(t => t.title === title).posterUrl;

  test('each result card carries matchup.png, drawn from that matchup: the winner, the votes, an upset, a tie', async () => {
    const draw = mods.cardImages.generateMatchupResultImage;
    draw.mockClear();
    const sim = new Sim('sim-result-image', { voters: 4 });
    await sim.bracket('admin', 'create', { name: 'Picture Cup', 'max-titles': 8, seeding: 'ordered', ties: 'higher-seed' });
    for (const [title, year] of HORROR_8) await sim.addTitle('movie', title, year);
    await sim.bracket('admin', 'open', { duration: '1d' });
    // 1A (1 v 8) ties 2–2 and goes to seed 1; 1B (4 v 5) is won by seed 5, an upset
    const [tied, upset] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : m.id === upset.id ? 2 : favorite(m)));
    await sim.passDeadlines();

    const posts = resultPosts(sim);
    expect(posts).toHaveLength(4);
    for (const post of posts) {
      const card = post.embeds[0].toJSON();
      expect(post.attachments.map(a => a.name)).toEqual(['matchup.png']);
      expect(card.image.url).toBe('attachment://matchup.png');
      // The image replaces the poster thumbnail
      expect(card.thumbnail).toBeUndefined();
    }

    // What was drawn is the matchup that closed, as stored
    expect(draw).toHaveBeenCalledTimes(4);
    const closed = sim.tournament().knockoutBracket.filter(m => m.round === 'quarterfinals');
    for (const m of closed) {
      const [data] = draw.mock.calls.find(([d]) => d.label === mods.tournamentUI.matchupLabel(m.position, m.round));
      const loser = m.winner.title === m.movie1.title ? m.movie2 : m.movie1;
      const [high, low] = [m.votes1Count, m.votes2Count].sort((a, b) => b - a);
      expect(data).toMatchObject({
        round: 'quarterfinals',
        winner: { title: m.winner.title, posterUrl: posterOf(sim, m.winner.title), seed: m.winner.seed, votes: high },
        loser: { title: loser.title, posterUrl: posterOf(sim, loser.title), seed: loser.seed, votes: low },
      });
      expect(data.winner.posterUrl).toMatch(/^https:\/\/image\.tmdb\.org\//);
      expect(data.upset).toBe(m.id === upset.id);
      expect(data.tieBrokenBySeed).toBe(m.id === tied.id);
    }
    expect(sim.discord.violations).toEqual([]);
  });

  test('/bracket close-matchup with a typed label posts each result card with its picture, as the Close button does', async () => {
    // It closed through bracketManager on its own and answered with its
    // reply alone: matchups closed by label never got their result card,
    // picture and all, nor had their voting message marked closed
    const draw = mods.cardImages.generateMatchupResultImage;
    draw.mockClear();
    const sim = new Sim('sim-close-matchup-image', { voters: 3 });
    await straightBracket(sim, 'Typed Close', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    const [a, b] = sim.openMatchups();
    const label = (m) => mods.tournamentUI.matchupLabel(m.position, m.round);
    await sim.bracket('admin', 'close-matchup', { matchup: `${label(a)},${label(b)}` });

    const posts = resultPosts(sim);
    expect(posts.map(p => p.embeds[0].toJSON().title)).toEqual([a, b].map(m => `📊 Quarterfinals - Match ${m.position + 1} - Results`));
    for (const post of posts) {
      expect(post.attachments.map(x => x.name)).toEqual(['matchup.png']);
      expect(post.embeds[0].toJSON().image.url).toBe('attachment://matchup.png');
    }
    expect(draw.mock.calls.map(([d]) => d.label)).toEqual([label(a), label(b)]);
    for (const m of [a, b]) {
      const closed = sim.tournament().knockoutBracket.find(x => x.id === m.id);
      const [data] = draw.mock.calls.find(([d]) => d.label === label(m));
      expect(data.winner).toMatchObject({ title: closed.winner.title, votes: 3 });
    }
    // The two still voting are left alone
    expect(sim.openMatchups().map(m => m.id)).toEqual(sim.tournament().knockoutBracket.filter(m => m.round === 'quarterfinals' && ![a.id, b.id].includes(m.id)).map(m => m.id));
    expect(sim.discord.violations).toEqual([]);
  });

  test('a typed close of a tie and a decided matchup: the tie\'s vote, the other\'s result card, both in the reply, and the bracket', async () => {
    const sim = new Sim('sim-close-matchup-tie-and-win', { voters: 4 });
    await straightBracket(sim, 'Typed Mixed', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    const [tied, won] = sim.openMatchups();
    await sim.everyoneVotes((m, v) => (m.id === tied.id ? split(m, v) : favorite(m)));
    const label = (m) => mods.tournamentUI.matchupLabel(m.position, m.round);
    const close = await sim.bracket('admin', 'close-matchup', { matchup: `${label(tied)},${label(won)}` });

    const reply = close.reply.embeds[0].toJSON();
    expect(reply.title).toBe('🔀 Tiebreaker Voting Started');
    // Seeding is random: the 4–0 is title 1's or title 2's
    const decided = sim.tournament().knockoutBracket.find(m => m.id === won.id);
    const counts = decided.winner.title === decided.movie1.title ? '4 vs 0' : '0 vs 4';
    expect(reply.fields.find(f => f.name === '🏆 Decided').value).toBe(`**${label(won)}**: ${decided.winner.title} wins (${counts})`);
    expect(resultPosts(sim).map(p => p.embeds[0].toJSON().title)).toEqual([`📊 Quarterfinals - Match ${won.position + 1} - Results`]);
    expect(sim.channel.posted.filter(m => /— Bracket So Far$/.test(m.embeds[0]?.toJSON().title || ''))).toHaveLength(1);
  });

  test('when the image fails, the text card still posts exactly as before, with the poster thumbnail', async () => {
    const draw = mods.cardImages.generateMatchupResultImage;
    const warnings = jest.spyOn(console, 'warn').mockImplementation(() => {});
    draw.mockRejectedValue(new Error('Matchup image took longer than 5000 ms'));
    try {
      const sim = new Sim('sim-result-image-fails');
      await straightBracket(sim, 'Text Only Cup', 8, 'movie', HORROR_8);
      await sim.bracket('admin', 'open', { duration: '1d' });
      await sim.everyoneVotes(favorite);
      await sim.passDeadlines();

      const posts = resultPosts(sim);
      expect(posts).toHaveLength(4);
      for (const post of posts) {
        const card = post.embeds[0].toJSON();
        const winner = sim.tournament().knockoutBracket.find(m => card.title.includes(`Match ${m.position + 1} `) && m.round === 'quarterfinals').winner;
        expect(post.attachments).toEqual([]);
        expect(card.image).toBeUndefined();
        expect(card.thumbnail?.url).toBe(posterOf(sim, winner.title));
        expect(card.description).toMatch(/Voting has closed!\n`\d+` .+ `\d+`/);
        expect(card.fields[0].value).toContain(winner.title);
      }
      // Logged as a warning: the simulator fails a step on any console.error
      expect(warnings.mock.calls.some(([msg]) => /Matchup image for .+ not drawn/.test(String(msg)))).toBe(true);
      expect(sim.discord.violations).toEqual([]);
    } finally {
      draw.mockImplementation(async () => Buffer.from('png'));
      warnings.mockRestore();
    }
  });

  test("a channel that won't take attachments (no Attach Files) still gets every result card", async () => {
    const warnings = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const sim = new Sim('sim-result-image-no-attach');
    await straightBracket(sim, 'No Files Cup', 8, 'movie', HORROR_8);
    await sim.bracket('admin', 'open', { duration: '1d' });
    await sim.everyoneVotes(favorite);
    // Discord refuses a message with a file where the bot can't attach one
    const send = sim.channel.send.bind(sim.channel);
    const refused = [];
    sim.channel.send = async (payload) => {
      if (payload?.files?.some(f => f.name === 'matchup.png')) {
        refused.push(payload);
        throw Object.assign(new Error('Missing Permissions'), { code: 50013 });
      }
      return send(payload);
    };
    try {
      await sim.passDeadlines();
    } finally {
      sim.channel.send = send;
      warnings.mockRestore();
    }
    expect(refused).toHaveLength(4);
    const posts = resultPosts(sim);
    expect(posts).toHaveLength(4);
    for (const post of posts) {
      const card = post.embeds[0].toJSON();
      expect(post.attachments).toEqual([]);
      expect(card.image).toBeUndefined();
      expect(card.thumbnail?.url).toMatch(/^https:\/\/image\.tmdb\.org\//);
    }
    expect(sim.discord.violations).toEqual([]);
  });
});
