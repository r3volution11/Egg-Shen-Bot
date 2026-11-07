/**
 * Tournament UI: how titles, matchups, standings and ballots read in a card.
 *
 * The live cards here (the standings, a tiebreaker, the ballot) are edited
 * on every vote, so they stay text: emoji-kit bars and pills (emojiKit.js)
 * inside an ordinary embed, never a drawn image. Every renderer takes
 * `{ kit }` (default liveKit()), so a test can draw the same card with a
 * fake registry of uploaded emoji as well as in fallback, which is what
 * every server sees until the kit is uploaded.
 *
 * Custom emoji go only where Discord draws them: an embed's description,
 * field names and field values — never a title, author, footer or button
 * label, and never inside a code span (a `pill`), where they show as raw
 * `<:es_…:…>` text.
 *
 * (2.73.0 removed thirteen helpers nothing called — createProgressBar,
 * getRankEmoji, createMatchupSummary and the like — left from an older
 * standings design.)
 */

import { liveKit, pill } from './emojiKit.js';
import { LIMITS, chooseLayout, messageProblems, clipText } from './embedFit.js';

const plural = (n, word) => `${word}${n === 1 ? '' : 's'}`;

/**
 * Coloured squares for a matchup's vote bars (Doug, 2026-10-04). Discord
 * can't colour text in a card, but it draws emoji in colour, so the bar is
 * built from square emoji: green for the title ahead, orange for the one
 * behind, yellow for both when tied, white for the rest of the bar. White,
 * not black: on Discord's dark theme (the usual one) a black square all
 * but disappears into the card.
 */
export const VOTE_BAR = { lead: '🟩', trail: '🟧', tie: '🟨', empty: '⬜' };

/**
 * One title's vote bar in a two-title matchup, with its count:
 *   🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 7 votes (70%)
 * Its colour comes from how it stands against the other title, whose votes
 * are the rest of totalVotes. The live standings' `squares` layout.
 * @param {number} votes - this title's votes
 * @param {number} totalVotes - both titles' votes together
 * @param {number} length - squares in the bar (default 10)
 * @returns {string}
 */
export function createVoteBar(votes, totalVotes, length = 10) {
  const count = `${votes} vote${votes !== 1 ? 's' : ''}`;
  if (totalVotes === 0) {
    return `${VOTE_BAR.empty.repeat(length)} ${count} (0%)`;
  }

  const rival = totalVotes - votes;
  const fill = votes > rival ? VOTE_BAR.lead : votes < rival ? VOTE_BAR.trail : VOTE_BAR.tie;
  const percentage = Math.round((votes / totalVotes) * 100);
  const filled = Math.round((votes / totalVotes) * length);
  return `${fill.repeat(filled)}${VOTE_BAR.empty.repeat(length - filled)} ${count} (${percentage}%)`;
}

/**
 * A title as people need to see it to tell remakes apart: with its year,
 * "The Town That Dreaded Sundown (1976)" (there's a 2014 one), unless the
 * title already ends with a year. Shortened only when longer than `max`,
 * and then the name is cut, never the year (Doug, 2026-10-05: the live
 * standings cut titles at 25 characters, with room to spare).
 * @param {{title: string, year?: string|number}} entry
 * @param {number} [max] - longest result, in characters
 */
export function displayTitle(entry, max = 80) {
  const title = String(entry?.title || '').trim();
  const year = String(entry?.year || '').slice(0, 4);
  const suffix = /^\d{4}$/.test(year) && !/\(\d{4}\)$/.test(title) ? ` (${year})` : '';
  // A seeded bracket shows the seed, March Madness style: "(1) Halloween".
  // Only seeded brackets stamp entry.seed, so random ones read as before.
  const prefix = entry?.seed ? `(${entry.seed}) ` : '';
  const room = max - prefix.length;
  if (title.length + suffix.length <= room) return prefix + title + suffix;
  return `${prefix}${title.slice(0, Math.max(1, room - suffix.length - 1)).trimEnd()}…${suffix}`;
}

/**
 * The bare title with its seed in front when the bracket is seeded:
 * "(1) Halloween", else "Halloween" — for the places that always showed the
 * bare title, so unseeded tournaments (and ones already running when seeds
 * arrived) read exactly as before.
 * @param {{title: string, seed?: number}} entry
 */
export function seededTitle(entry) {
  const title = String(entry?.title || '');
  return entry?.seed ? `(${entry.seed}) ${title}` : title;
}

/**
 * A decided knockout matchup in one line: "**(2) Hereditary** wins 5–3", or,
 * when a tie went to the better seed (the 'higher-seed' tie rule),
 * "**(2) Hereditary** advances on a 4–4 tie as the higher seed" — so nobody
 * reads a tie as a vote count error.
 * @param {Object} winner - the winning entry
 * @param {number} votes1
 * @param {number} votes2
 * @param {string} [decidedBy] - 'seed' when the tie rule decided it
 */
export function knockoutOutcome(winner, votes1, votes2, decidedBy) {
  const score = `${Math.max(votes1, votes2)}–${Math.min(votes1, votes2)}`;
  return decidedBy === 'seed'
    ? `**${seededTitle(winner)}** advances on a ${score} tie as the higher seed`
    : `**${seededTitle(winner)}** wins ${score}`;
}

/**
 * "🚨 Upset! (12) knocks out (5)" when a worse seed beats a better one, else
 * ''. Unseeded entries (random brackets, groups knockouts) are never upsets.
 * The icon is the kit's: this line goes in a description.
 */
export function upsetNote(winner, loser, { kit = liveKit() } = {}) {
  if (!winner?.seed || !loser?.seed || winner.seed <= loser.seed) return '';
  return `${kit.e('upset')} Upset! (${winner.seed}) knocks out (${loser.seed})`;
}

// ── the live standings ──────────────────────────────────────────────────

/**
 * The live standings' three layouts, most graphic first:
 *
 *   two      a kit bar under each title, with its count and share
 *              **1A** · closes in 2 hours
 *              Sick
 *              ▰▰▱▱▱▱▱▱ `3` votes · 18%
 *              vs
 *              A Nightmare on Elm Street (1984) 🔥
 *              ▰▰▰▰▰▰▰▱ `14` votes · 82%
 *
 *   split    one bar for the matchup, the first title's share from the
 *            left and the second's from the right, between their counts
 *              **1A** · closes in 2 hours
 *              Sick
 *              vs
 *              A Nightmare on Elm Street (1984) 🔥
 *              `3` ▰▰▰▰▰▰▰▰▰▰ `14`
 *
 *   squares  the coloured squares the card has always had (createVoteBar)
 *
 * A custom emoji is up to 37 characters of text where a square is 2, so
 * the graphic layouts fit only so many matchups in Discord's 4,096-character
 * description: STANDINGS_STEPS tries each in turn, and the last step (the
 * squares, titles held to 50 characters) fits a whole round of 32 — sixteen
 * matchups of 80-character titles — whatever the kit.
 */
export const STANDINGS_LAYOUTS = Object.freeze(['two', 'split', 'squares']);

/** What formatStandings tries, in order: a layout and its bar width */
export const STANDINGS_STEPS = Object.freeze([
  Object.freeze({ layout: 'two', width: 8 }),
  Object.freeze({ layout: 'split', width: 10 }),
  Object.freeze({ layout: 'split', width: 6 }),
  Object.freeze({ layout: 'squares', width: 10 }),
  Object.freeze({ layout: 'squares', width: 10, titleMax: 50 }),
]);

/**
 * The vote count every matchup is measured at when the layout is chosen.
 * More votes than any real matchup gets, so the real card is never longer
 * than the one measured.
 */
export const STANDINGS_PROBE_VOTES = 9999;

/** A two-title bar's colour: green ahead, orange behind, gold when level */
const standingColour = (votes, rival) => (votes > rival ? 'green' : votes < rival ? 'orange' : 'gold');

/**
 * One open matchup as the live standings show it — used by the Live
 * Standings card and /bracket status, so the two always match. In the
 * `squares` layout (the default, and what every server sees until the kit
 * is uploaded):
 *   **1A** · closes <t:…:R>
 *   Sick
 *   🟧🟧⬜⬜⬜⬜⬜⬜⬜⬜ 3 votes (18%)
 *   vs
 *   A Nightmare on Elm Street 🔥
 *   🟩🟩🟩🟩🟩🟩🟩🟩⬜⬜ 14 votes (82%)
 * Both titles get their bar and count. (The second one's bar was once
 * built but never printed, so a matchup voted 0–2 read as "0 votes".)
 * The leader's 🔥 and a tie's 🤝 stay Unicode in every layout: they mark
 * the title and the matchup, not the bar.
 * @param {object} matchup - with votes.movie1/movie2 voter lists
 * @param {string} [round] - defaults to the matchup's own
 * @param {object} [opts]
 * @param {string} [opts.layout] - 'two' | 'split' | 'squares'
 * @param {number} [opts.width] - bar width (default 8 for two, 10 otherwise)
 * @param {number} [opts.titleMax] - longest title, in characters
 * @param {[number, number]} [opts.counts] - draw these counts instead of the
 *   real ones (formatStandings measures at STANDINGS_PROBE_VOTES)
 */
export function formatStandingsMatchup(matchup, round = matchup.round, { kit = liveKit(), layout = 'squares', width, titleMax = 80, counts } = {}) {
  const [votes1, votes2] = counts || [matchup.votes?.movie1?.length || 0, matchup.votes?.movie2?.length || 0];
  const total = votes1 + votes2;
  const lead1 = votes1 > votes2 ? ' 🔥' : '';
  const lead2 = votes2 > votes1 ? ' 🔥' : '';
  const tie = votes1 === votes2 && votes1 > 0 ? ' 🤝' : '';
  const closes = matchup.votingDeadline ? ` · closes <t:${Math.floor(matchup.votingDeadline / 1000)}:R>` : '';
  const head = `**${matchupLabel(matchup.position, round)}**${tie}${closes}`;
  const title1 = `${displayTitle(matchup.movie1, titleMax)}${lead1}`;
  const title2 = `${displayTitle(matchup.movie2, titleMax)}${lead2}`;

  if (layout === 'split') {
    // The first title reads first and takes the bar from the left
    const bar = kit.splitBar(votes1, votes2, { width: width ?? 10 });
    return [head, title1, 'vs', title2, `${pill(votes1)} ${bar} ${pill(votes2)}`].join('\n');
  }
  if (layout === 'two') {
    const line = (votes, rival) => {
      const bar = kit.bar(votes, total, { width: width ?? 8, colour: standingColour(votes, rival) });
      const share = total > 0 ? Math.round((votes / total) * 100) : 0;
      return `${bar} ${pill(votes)} ${plural(votes, 'vote')} · ${share}%`;
    };
    return [head, title1, line(votes1, votes2), 'vs', title2, line(votes2, votes1)].join('\n');
  }
  return [head, title1, createVoteBar(votes1, total, width ?? 10), 'vs', title2, createVoteBar(votes2, total, width ?? 10)].join('\n');
}

/**
 * Every open matchup's standings, one block each, in the most graphic
 * layout that fits.
 *
 * The layout is chosen as if every matchup had STANDINGS_PROBE_VOTES votes
 * a side, with the real titles and deadlines: what changes between votes
 * (the counts, the 🔥 moving, a 🤝) is never longer than that, so the card
 * keeps one shape for as long as these matchups are open, instead of
 * jumping from bars to squares on the vote that tipped it over. In
 * fallback (the kit's bars not uploaded) the graphic layouts would only be
 * squares anyway, so it starts at `squares`, today's look.
 *
 * The kit's bar pieces all have the same length of markup (three-letter
 * codes, one length of id), so a bar's length doesn't depend on its
 * colours either.
 *
 * @param {object[]} matchups - in the order to show them
 * @param {string} [round] - the label's round; each matchup's own if omitted
 * @param {object} [opts]
 * @param {number | ((text: string) => object)} [opts.budget] - the
 *   characters the blocks may take, or a function that builds the message
 *   payload around them, measured with messageProblems against every limit
 *   (the 4,096 description and the 6,000 total)
 * @returns {{ text: string, layout: string, step: number }} step indexes
 *   STANDINGS_STEPS
 */
export function formatStandings(matchups, round, { kit = liveKit(), budget = LIMITS.description } = {}) {
  const steps = STANDINGS_STEPS
    .map((s, index) => ({ ...s, index }))
    .filter(s => kit.ready.bar || s.layout === 'squares');
  const render = (step, counts) => matchups
    .map(m => formatStandingsMatchup(m, round ?? m.round, { kit, layout: step.layout, width: step.width, titleMax: step.titleMax, counts }))
    .join('\n\n');
  const fits = typeof budget === 'function'
    ? (text) => messageProblems(budget(text)).length === 0
    : (text) => text.length <= budget;
  const probe = [STANDINGS_PROBE_VOTES, STANDINGS_PROBE_VOTES];
  const { step } = chooseLayout(steps, (s) => render(s, probe), fits);
  const chosen = steps[step];
  return { text: render(chosen), layout: chosen.layout, step: chosen.index };
}

/**
 * The live card's totals, on one line:
 *   🗳️ `12` votes · 👥 `5` voters · ⚔️ `4` matchups
 */
export function standingsTotals({ votes, voters, matchups }, { kit = liveKit() } = {}) {
  return [
    `${kit.e('ballot')} ${pill(votes)} ${plural(votes, 'vote')}`,
    `${kit.e('people')} ${pill(voters)} ${plural(voters, 'voter')}`,
    `${kit.e('vs')} ${pill(matchups)} ${plural(matchups, 'matchup')}`,
  ].join(' · ');
}

/**
 * A bar for one option among several (a tiebreaker vote), without the
 * count: its share of every vote cast, gold for the option in the lead (or
 * every option sharing it), blue for the rest, empty while nobody has
 * voted. The count goes beside it as text.
 * @param {number} votes - this option's votes
 * @param {number[]} allVotes - every option's votes, this one included
 */
export function rankedBar(votes, allVotes, { kit = liveKit(), width = 10 } = {}) {
  const total = allVotes.reduce((a, b) => a + b, 0);
  const top = Math.max(0, ...allVotes);
  return kit.bar(votes, total, { width, colour: total > 0 && votes === top ? 'gold' : 'blue' });
}

/**
 * Puts a title's poster on a result embed as its thumbnail — the smallest
 * image an embed can carry (a small square in the top-right corner), so a
 * result card gains a recognizable cover without becoming a big image post.
 * One thumbnail per embed, so it's the winner's.
 *
 * Skipped when there's no usable image: older tournaments and some sources
 * (board games before their details load) have posterUrl null, and Discord
 * rejects the whole message for a thumbnail that isn't an http(s) URL.
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {{ posterUrl?: string|null }|null|undefined} title
 * @returns the embed, for chaining
 */
export function setTitleThumbnail(embed, title) {
  const url = title?.posterUrl;
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    embed.setThumbnail(url);
  }
  return embed;
}

/**
 * A knockout matchup's label: "1A"–"4H" by region (March Madness style:
 * each round split into 4 regions), or "Finals". The labels people type in
 * /bracket open-matchup and /image matchup. Moved here from bracket.js so
 * every command labels a matchup the same way.
 * @param {number} position - the matchup's position in its round
 * @param {string} round - e.g. 'round_of_32', 'finals'
 */
export function matchupLabel(position, round) {
  if (round === 'finals') return 'Finals';
  const where = matchupRegion(position, round);
  return where ? `${where.region}${where.letter}` : String(position + 1);
}

/**
 * Where a knockout matchup sits: its region (1–4), its letter in that
 * region, and how many matchups each region has in that round. What
 * matchupLabel's "1A" is made of. null for the final, or a round it
 * doesn't know.
 */
export function matchupRegion(position, round) {
  const roundSizes = { round_of_32: 16, round_of_16: 8, quarterfinals: 4, semifinals: 2 };
  const totalMatchups = roundSizes[round];
  if (!totalMatchups) return null;
  const perRegion = totalMatchups / 4;
  return {
    region: Math.floor(position / perRegion) + 1, // 1-4
    letter: String.fromCharCode(65 + (position % perRegion)), // A, B, C...
    perRegion,
  };
}

const ROUND_ORDER = ['round_of_32', 'round_of_16', 'quarterfinals', 'semifinals', 'finals'];

// Room for the vote list in a ballot's description (4096), leaving the
// intro and the closing-time line their space
const VOTE_LIST_MAX = 3000;

/** Markdown in a title (a "*" or "_") would break the bold around it */
const plain = (title) => String(title || '').replace(/([\\*_~`|>])/g, '\\$1');

/**
 * Every knockout vote this person has cast, for their own ballot, in the
 * layout Doug drew (2026-10-03):
 *
 *   **Round 1 · Region 1**
 *   A: ✅ **Session 9** vs A Nightmare on Elm Street
 *   B: Chucky vs ✅ **Halloween (1978)**
 *
 *   **Round 3**
 *   1A: ✅ **Session 9** vs Halloween (1978)
 *
 *   **Final**
 *   ✅ **Session 9** vs Scream
 *
 * The tick is the kit's (`tk1`, ✅ in fallback): up to 37 characters of
 * text a pick once uploaded, which the length guard below measures like
 * any other text.
 *
 * Rounds are numbered from the bracket's first round (an 8-title bracket
 * starts at Round 1), counting every round it has, so the numbers don't
 * shift when someone skips a round. Where a round has several matchups per
 * region, each region gets a heading and its matchups go by letter — a
 * bare "A" would otherwise mean four matchups. Where it has one per region,
 * the full label (1A) does the job under one heading. The last round is
 * the Final. A very long list keeps the latest rounds and says how many it
 * left out.
 * @returns {string|null} null when they haven't voted in the knockout yet
 */
export function formatKnockoutVotes(tournament, userId, { kit = liveKit() } = {}) {
  const votes = tournament?.votes?.[userId] || {};
  const bracket = tournament?.knockoutBracket || [];
  const byOrder = (a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) || a.position - b.position;
  const voted = bracket.filter(m => votes[m.id] === 1 || votes[m.id] === 2).sort(byOrder);
  if (!voted.length) return null;

  const roundsInBracket = ROUND_ORDER.filter(r => bracket.some(m => m.round === r));
  const roundName = (r) => (r === 'finals' ? 'Final' : `Round ${roundsInBracket.indexOf(r) + 1}`);

  const tick = kit.e('tk1');
  const line = (m, label) => {
    const [one, two] = [plain(displayTitle(m.movie1)), plain(displayTitle(m.movie2))];
    const pick = votes[m.id];
    const pair = `${pick === 1 ? `${tick} **${one}**` : one} vs ${pick === 2 ? `${tick} **${two}**` : two}`;
    return label ? `${label}: ${pair}` : pair;
  };

  // One block per round: its heading(s) and lines
  const rounds = [...new Set(voted.map(m => m.round))];
  const blocks = rounds.map(r => {
    const inRound = voted.filter(m => m.round === r);
    if (r === 'finals') return [`**${roundName(r)}**`, ...inRound.map(m => line(m, null))].join('\n');
    const where = (m) => matchupRegion(m.position, m.round);
    if ((where(inRound[0])?.perRegion || 0) > 1) {
      const regions = [...new Set(inRound.map(m => where(m).region))];
      return regions.map(reg => [
        `**${roundName(r)} · Region ${reg}**`,
        ...inRound.filter(m => where(m).region === reg).map(m => line(m, where(m).letter)),
      ].join('\n')).join('\n\n');
    }
    return [`**${roundName(r)}**`, ...inRound.map(m => line(m, matchupLabel(m.position, m.round)))].join('\n');
  });

  // Too long: drop the earliest rounds first, newest votes matter most
  let kept = blocks;
  let dropped = 0;
  while (kept.length > 1 && kept.join('\n\n').length > VOTE_LIST_MAX) {
    dropped += voted.filter(m => m.round === rounds[blocks.length - kept.length]).length;
    kept = kept.slice(1);
  }
  // One round alone still too long: clipText, not a slice, which could cut
  // a custom tick in half and leave `<:es_tk1x…` on screen
  const text = clipText(kept.join('\n\n'), VOTE_LIST_MAX);
  return dropped ? `-# …and ${dropped} earlier vote${dropped === 1 ? '' : 's'}\n${text}` : text;
}
