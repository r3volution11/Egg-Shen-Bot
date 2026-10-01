---
title: Tournament FAQ - Egg Shen Bot
description: Answers to common questions about running and voting in Egg Shen Bot tournaments on Discord - ballots, time left, ties, changing votes and starting over.
faq:
  - q: Why does my ballot show several matchups?
    a: Each row on the ballot is a separate head-to-head vote, one title against one title. Several rows means several matchups are open at once. To show one at a time, an admin opens them with `/bracket open matchups:1`.
  - q: How do I see how much time is left?
    a: The ballot and the live standings show a countdown. Anyone can also run `/bracket status` to see every open matchup and its time left, or `/bracket my-votes` for their own votes.
  - q: Can I change my vote?
    a: Yes, until that matchup closes. Press **Start Voting** again and pick the other title. Once a matchup closes, its votes are final.
  - q: Who can vote, and who can run the tournament?
    a: Everyone in the server can vote by pressing **Start Voting**. Only administrators and moderators can create, open, close or change a tournament.
  - q: What happens when a matchup ties?
    a: The two titles get a tiebreaker vote, posted in the same channel. When it ends, the winner moves on. If the tiebreaker ties too, including when nobody votes in it, one of the two is picked at random.
  - q: Why didn't the next round open?
    a: A round moves on only when every matchup in it has closed. If one is waiting on a tiebreaker, the next round opens after that. Run `/bracket status` to see what's still open.
  - q: How many titles can a tournament have?
    a: A straight bracket holds 2 to 32 titles. A groups tournament holds 16 to 48, in 4 to 12 groups of 4.
  - q: Can a tournament use TV shows, games, board games or books?
    a: Yes. A tournament holds one type of title. The first title you add sets it, or you choose it in the setup form.
  - q: How do I start over?
    a: Run `/bracket cancel`. To reuse the same lineup, save it first with `/bracket export format:json`, then load it into the [setup form](/commands/brackets/import).
  - q: Why does opening a new matchup close the previous one?
    a: So votes on earlier matchups can't keep changing after the tournament has moved on. To keep several matchups voting together, open them together, for example with `/bracket open matchups:4`.
---

# Tournament FAQ

<FaqList />

## Still stuck?

The [quick guides](./) walk through the most common setups, and the [command reference](/commands/brackets/commands) covers every option.
