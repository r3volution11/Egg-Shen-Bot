---
title: Tips & Strategies - Tournament Brackets
description: Strategies for tournament pacing and engagement, plus utility commands for extending voting deadlines, matchup images, and cancelling a tournament.
---

# Tips & Strategies

Utility commands, plus ideas for pacing and keeping members engaged at different tournament sizes.

## Utility Commands

### Extend Voting Deadline

```
/bracket extend-voting type:<group|knockout> duration:<time> group:<letter>
```

**Parameters:**

- `type` (required)
  - `group` - A group in the group stage
  - `knockout` - Every open matchup in the current knockout round
- `duration` (required) - The new time left, from now. 5m to 30d. Examples: `30m`, `12h`, `2d`.
- `group` (required when `type` is `group`) - The group letter, e.g., `A`

**Who can use:** Administrators and Moderators only

**How it works:**

- The new deadline is **now + `duration`**. It replaces the old deadline rather than adding to it, so `duration:12h` on a group with 20h left shortens it to 12h.
- Group voting is extended one group at a time.
- Knockout voting is extended for every open matchup in the current round at once.
- You can run it as many times as you like.
- The original voting messages aren't edited; the reply shows the new deadline.

**Examples:**

```
# Group A closes 24 hours from now
/bracket extend-voting type:group duration:24h group:A

# Every open matchup in this round closes 12 hours from now
/bracket extend-voting type:knockout duration:12h
```

**Output:**

```
✅ Extended voting for Group A

⏰ New deadline: 23h 59m
📅 Exact time: June 28, 2026 11:30 PM
```

The exact time shows in each reader's own time zone.

**Requirements:**

- **Groups:** the group must be open for voting.
- **Knockout:** the tournament must be in the knockout with at least one matchup open.

---

### Matchup Images

Versus images for matchups are made with the separate `/image` command, not `/bracket`:

```
/image matchup:1A
/image title1:"Godzilla" title2:"King Kong"
/image
```

Start typing in `matchup:` to pick from this tournament's matchups, voting ones first.

`/image` with no options lists the active tournament's current matchups. It needs an OpenAI API key and has per-user and per-server limits. See [AI Image Generation](/commands/ai-images) for all options, limits, and configuration.

---

### Cancel Tournament

```
/bracket cancel
```

**Who can use:** Administrators and Moderators only

- Ends the active tournament right away. It can't be undone.
- Clears the tournament's votes and voting stats.
- Lets you create a new tournament.

**When to use:**

- The tournament stalled with no participation
- You want to start over with different titles or a different format

---

## Pacing Strategies

### Fast (1–2 Weeks)

**Best for:** Active communities, live events, quick competitions

**Group stage:**
- Up to 5 groups: `/bracket open duration:24h` opens them all, and they close the next day
- More groups: a batch of up to 5 a day with `/bracket open-groups` (a ballot holds 5 groups)
- Done in 1–3 days

**Knockout:**
- `/bracket open duration:24h` for each round of 5 matchups or fewer
- Round of 32 and Round of 16 don't fit on one ballot. Run `/bracket open matchups:4 duration:24h` each day: it closes the last four and opens the next four
- Done in about a week

**Example timeline (8 groups):**
- Days 1–2: Group stage, groups A–E then F–H
- Days 3–4: Round of 16, four matchups a day
- Day 5: Quarterfinals
- Day 6: Semifinals
- Day 7: Finals

---

### Medium (2–4 Weeks)

**Best for:** Most Discord communities

**Group stage:**
- Open 4 groups at a time with `/bracket open-groups groups:A,B,C,D duration:48h`
- Open the next batch when the last one closes, to keep steady activity. A ballot holds 5 groups, so batches mustn't overlap.
- Done in about a week

**Knockout:**
- Split big rounds across days by region: `/bracket open-matchup region:1` Monday, `region:2` Tuesday, and so on. Opening a region closes the one before, so each region votes for a day.
- 48h voting for the rounds that fit on one ballot
- Done in about 2 weeks

**Example timeline:**
- Week 1: Group stage (4 groups every 2 days)
- Week 2: Round of 16 (region by region)
- Week 3: Quarterfinals and Semifinals
- Week 4: Finals (48–72h voting)

---

### Slow (1–2 Months)

**Best for:** Building anticipation, feature-focused events

**Group stage:**
- Open 2 groups at a time with 2–3 day voting
- Done in 2–3 weeks

**Knockout:**
- `/bracket open matchups:1 duration:3d` to feature one matchup at a time, in order, or `/bracket open-matchup matchup:1A` to pick one
- 3–7 day voting
- Build a "match of the week" around each one

**Example timeline:**
- Weeks 1–3: Group stage (2 groups every 3 days)
- Weeks 4–5: Round of 16 (a few matchups a week)
- Weeks 6–7: Quarterfinals and Semifinals
- Week 8: Finals (7-day voting)

---

## Choosing a Size

### Straight Bracket (2–32 titles)

**Structure:**
- No groups; head-to-head from round one
- 8 titles start at the Quarterfinals, 16 at the Round of 16, 32 at the Round of 32
- A bracket that isn't full gives byes (e.g., 12 titles in a 16 bracket: 4 byes)

**Tips:**
- 8 or 16 titles is a good weekend or monthly event.
- Want the favorites kept apart until late? Create it with `seeding:By rating`, or `seeding:The order I add them` to set the order yourself (the [setup form](./import) has the same choices). Seed 1 meets the lowest seed, byes go to the top seeds, and upsets are called out. Otherwise seeding is random. See [Seeded bracket](/guides/tournaments/seeded).

---

### Small Groups Tournament (4 groups, 16 titles)

**Structure:**
- 4 groups of 4
- Top 2 go through = 8 titles
- No wildcards needed
- Knockout starts at the Quarterfinals

`/bracket-setup create` makes groups tournaments of 9–12 groups; use `/bracket-setup resize groups:4` during setup to shrink one, or set it up with the [setup form](./import).

**Tips:**
- Open all groups at once.
- Can finish in under a week.

---

### Medium Groups Tournament (8 groups, 32 titles)

**Structure:**
- 8 groups of 4
- Top 2 go through = 16 titles
- No wildcards needed
- Knockout starts at the Round of 16

**Tips:**
- Open 4 groups per day (2 batches).
- Open the Round of 16 by region.

---

### Large Groups Tournament (12 groups, 48 titles)

**Structure:**
- 12 groups of 4
- Top 2 go through = 24 titles
- Best 8 third-place finishers = 8 wildcards
- 32 titles start at the Round of 32

**Tips:**
- Open 4 groups at a time (3 batches). A ballot holds 5 groups, so never open them all at once.
- Use 48h voting for the group stage.
- Mix region and single-matchup opening in the knockout.
- Plan for 3–4 weeks.

**Challenges:**
- Needs more admin attention
- Risk of voter fatigue
- Needs steady promotion

---

## Engagement Tips

### Keep Members Involved

**During the group stage:**
- Announce when new groups open
- Post reminders 6–12h before close
- Share interesting voting trends

**During the knockout:**
- Build hype for marquee matchups
- Each decided matchup gets a drawn result picture (posters, the vote split, an UPSET! stamp when there is one), and the bot posts the bracket after it. Share them, or draw the bracket any time with `/bracket view`
- Highlight close votes
- Start prediction threads

### Use Matchup Images

**When:**
- Key matchups (semifinals, finals)
- Possible upsets
- Community-requested battles

**Tips:**
- Add a `prompt` to `/image` for a themed look
- Make the image before the matchup opens
- Save images for a recap post

### Use the Regions

**Build narratives:**
- "Region 3 is the bracket of death"
- "Region 4 has all the underdogs"
- "1A is the match of the week"

**Create rivalries:**
- Predict which region's winner takes the title
- Track which region performs best

---

## Quick Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/bracket extend-voting` | Set a new deadline | Low turnout, requests for more time |
| `/image matchup:` | Versus image for a matchup | Hype key battles |
| `/bracket cancel` | End the tournament | Stalled tournament, need to restart |
| `/bracket status` | Check progress | Regular monitoring |
| `/bracket my-votes` | A member's own votes | Help members track their votes |

---

**Related Pages:**
- [← Back to Brackets Overview](./)
- [Tournament Setup →](./setup)
- [Knockout Rounds →](./knockout)
- [Command Reference →](./commands)
