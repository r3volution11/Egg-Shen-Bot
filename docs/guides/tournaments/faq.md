---
title: Tournament FAQ
description: Answers to common questions about running and voting in Egg Shen Bot tournaments on Discord - ballots, time left, ties, vote bars, results, changing votes and starting over.
faq:
  - q: Why does my ballot show several matchups?
    a: Each row on the ballot is a separate head-to-head vote, one title against one title. Several rows means several matchups are open at once. To show one at a time, an admin opens them with `/bracket open matchups:1`.
  - q: How do I open a matchup with just two titles, one versus one?
    a: Every matchup already is one title against one title. To open just the next one, an admin runs `/bracket open matchups:1`. To open a particular one, use `/bracket open-matchup` and pick it from the list, which shows each matchup's two titles. Opening a matchup closes any earlier one in the round that's still voting.
  - q: How do I see how much time is left?
    a: The ballot and the live standings show a countdown. Anyone can also run `/bracket status` to see every open matchup and its time left, or `/bracket my-votes` for their own votes.
  - q: Can I change my vote?
    a: Yes, until that matchup closes. Press **Start Voting** again and pick the other title. Once a matchup closes, its votes are final.
  - q: Why did my group vote disappear?
    a: In the group stage you pick your top 2 in each group, and both picks count or neither does. A single pick is thrown out when the group closes, so pick a second title before the deadline.
  - q: Who can vote, and who can run the tournament?
    a: Everyone in the server can vote by pressing **Start Voting**. Only members with the Administrator or Timeout Members permission can create, open, close or change a tournament.
  - q: What happens when a matchup ties?
    a: The two titles get a tiebreaker vote, posted in the same channel. When it ends, the winner moves on. If the tiebreaker ties too, including when nobody votes in it, one of the two is picked at random. A seeded bracket can instead send ties straight to the higher seed. The creator picks this with `ties:Higher seed wins` (see [Seeded Bracket](/guides/tournaments/seeded)). A tiebreaker runs for 1 hour by default, and an admin can settle one early with `/bracket resolve-tiebreaker`, leaving `winner` blank to go by the current votes or giving a number to choose the winner. In the group stage, a tie for 3rd is settled at random.
  - q: What do the colours on the vote bars mean?
    a: In a matchup, green is the title ahead, orange the one behind, and gold on both means a tie. On a tiebreaker vote or a survey, the option in the lead is gold and the rest are blue. Once the bot's own emoji are uploaded, the bars are its carved stone bars in the same colours.
  - q: What's the picture posted when a matchup closes?
    a: It's the matchup's result, drawn. The two posters face off across a lightning VS, the winner framed in gold under a WINNER sash and the runner-up dimmed, with the vote split underneath. A worse seed beating a better one gets an UPSET! stamp. See [the results card](/commands/brackets/knockout#the-results-card).
  - q: What do the numbers in brackets next to titles mean?
    a: They're seeds, as in "(1) Halloween". The tournament's creator chose a seeded bracket, ranked by rating or by their own order, so seed 1 is the favourite. When a lower seed wins, the result calls it an upset. See [Seeded Bracket](/guides/tournaments/seeded).
  - q: Can I run it like March Madness, the NFL playoffs or the World Cup?
    a: Close to it. Seeding, tie and size settings get you most of the way, and for some formats (the College Football Playoff and the 2026 World Cup) all the way. See [Sports-style tournaments](/guides/tournaments/sports-styles).
  - q: Why didn't the next round open?
    a: Nothing opens on its own. A round is finished only when every matchup in it has closed, tiebreakers included, and then an admin opens the next one with `/bracket open`. Run `/bracket status` to see what's still open.
  - q: Why does my ballot say too many matchups are open?
    a: A ballot holds 5 matchups. With more open at once it can't show them, so an admin should close some and open the round a few at a time, with `/bracket open matchups:4` or `/bracket open-matchup region:1`. The group stage is the same, with up to 5 groups at once.
  - q: What shapes of tournament are there?
    a: Two. A **straight bracket** holds 2 to 32 titles, with no groups, and has head-to-head matchups from round one. A **groups tournament** has 4 to 12 groups of exactly 4 titles. Members vote in the groups first, then the qualifiers go into a knockout. You choose with `max-titles` when you create the tournament. 2, 4, 8, 16 or 32 makes a straight bracket, and 36, 40, 44 or 48 makes a groups tournament with 9–12 groups. You can change the group count later with `/bracket-setup resize` (4–12). A straight bracket doesn't have to be full. With 12 titles in a 16-title bracket, 4 titles get byes.
  - q: How do wildcards work?
    a: 'Groups tournaments only. The top 2 from each group go through. The best third-place finishers then fill the knockout up to the next power of 2 (4, 8, 16, or 32), at most one per group. For example: 12 groups = 24 + 8 wildcards = 32; 9 groups = 18 + 9 wildcards = 27. Leftover slots (5 of 32 in that case) become byes, and the group winners get them.'
  - q: How many titles can a tournament have?
    a: A straight bracket holds 2 to 32 titles. A groups tournament holds 16 to 48, in 4 to 12 groups of 4.
  - q: How do I set up a tournament with 16 titles?
    a: 'There are two ways. **From a spreadsheet** (quickest for a list): run `/bracket-setup setup-link`, fill in the [straight-bracket CSV](/templates/tournaments/straight-bracket.csv) with your 16 titles, upload it on the form, check the matches and create the tournament. See [set up from a spreadsheet](/guides/tournaments/from-a-spreadsheet). **With commands:** run `/bracket-setup create name:Movie Cup max-titles:16`, then add each title with `/bracket-setup manage-titles action:add type:movie title:Alien` (no `group` needed in a straight bracket). Either way, open voting with `/bracket open matchups:4`: the first round has 8 matchups and a ballot holds 5, so it opens in parts. Run `/bracket open matchups:4` again to close those four and open the other four. For 4 groups of 4 instead, see the [groups tournament guide](/guides/tournaments/groups).'
  - q: Do I have to add titles one at a time?
    a: No. The [setup form](/commands/brackets/import) lets you set up a whole tournament by uploading a CSV or JSON file, or by filling it in. Run `/bracket-setup setup-link` to get a private link to it.
  - q: How do I add a title, and what if several match?
    a: Run `/bracket-setup manage-titles action:add`. It searches TMDB (movies/TV), RAWG (games), BoardGameGeek (board games), or Google Books. One match is added right away. Several matches show a menu so you can pick the right one.
  - q: Can a tournament use TV shows, games, board games or books?
    a: Yes. A tournament holds one type of title. The first title you add sets it, or you choose it in the setup form.
  - q: Can we run more than one tournament at once?
    a: No. One tournament per server. Cancel or finish the current one before starting another.
  - q: How do I start over?
    a: Run `/bracket cancel`. To reuse the same lineup, save it first with `/bracket export format:json`, then load it into the [setup form](/commands/brackets/import).
  - q: Why does opening a new matchup close the previous one?
    a: So votes on earlier matchups can't keep changing after the tournament has moved on. To keep several matchups voting together, open them together, for example with `/bracket open matchups:4`.
---

# Tournament FAQ

<FaqList />

## Still stuck?

The [quick guides](./) walk through the most common setups, and the [command reference](/commands/brackets/commands) covers every option.
