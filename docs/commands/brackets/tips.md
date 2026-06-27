---
title: Tips & Strategies - Tournament Brackets
description: Expert strategies for managing tournament pacing, engagement, and utility commands including voting extensions, AI images, and tournament cancellation.
---

# Tips & Strategies

**Master tournament management** with utility commands and expert strategies for pacing, engagement, and handling different tournament sizes. From extending voting deadlines to generating AI matchup images, these tools help you run smooth, engaging tournaments.

## Utility Commands

### Extend Voting Deadline

```
/bracket extend-voting type:[group|knockout] duration:[time] group:[letter]
```

**Parameters:**

- `type` (required) - Which voting type to extend
  - `group` - Extend group stage voting
  - `knockout` - Extend current knockout round voting
- `duration` (required) - Additional time to add to deadline
  - Format: Number + unit (m=minutes, h=hours, d=days)
  - Examples: "5m", "2h", "24h", "3d", "7d"
  - Range: 5 minutes to 30 days
- `group` (optional) - Group letter (required only when type is "group")
  - Examples: "A", "B", "C"

**Who can use:** Administrators and Moderators only

**Features:**

- **Extend active voting** after it's already opened
- **Group voting:** Extend specific groups by letter
- **Knockout voting:** Extends all matchups in current round
- **Shows updated deadline** with time remaining and exact timestamp
- **Flexible adjustments** - Add more time if voting is slow or members request it
- **No limit** on how many times you can extend (as long as deadline stays within 5m-30d range)

**Examples:**

```
# Extend Group A voting by 24 hours
/bracket extend-voting type:group duration:24h group:A

# Extend Group B voting by 2 days
/bracket extend-voting type:group duration:2d group:B

# Extend current knockout round by 12 hours
/bracket extend-voting type:knockout duration:12h

# Add just 30 more minutes to knockout round
/bracket extend-voting type:knockout duration:30m
```

**Output:**

```
✅ Extended voting for Group A

⏰ New deadline: 1d 12h
📅 Exact time: 6/28/2026, 11:30:00 PM
```

**Use Cases:**

- Members request more time due to busy schedules
- Voting participation is lower than expected
- Want to align deadline with specific time (e.g., end of weekend)
- Technical issues delayed announcement
- Community engagement warrants extended discussion period

**Requirements:**

- **For groups:** Group must be currently open for voting
- **For knockout:** Tournament must be in knockout phase with active voting
- New deadline must be between 5 minutes and 30 days from now

**Tips:**

- Can extend multiple times if needed
- Each extension adds time from NOW (not from original deadline)
- Extension applies to all matchups in current knockout round
- For groups, must extend each group individually
- Original messages are not edited, but tournament data updates

---

### Generate AI Matchup Image

```
/bracket image [title1:"Title A"] [title2:"Title B"] [prompt:"details"]
/bracket image [matchup:"Title A vs Title B"]
```

**Parameters:**

- `title1` (optional) - First title for freeform generation (validates through APIs)
- `title2` (optional) - Second title for freeform generation (validates through APIs)
- `matchup` (optional) - Tournament matchup to visualize (e.g., "The Thing vs Alien")
- `prompt` (optional) - Additional details for image generation (e.g., "set in space with stars")

**Who can use:** All server members (subject to rate limits)

**Features:**

- **Smart Search Validation** - Automatically searches TMDB, RAWG, BGG, and Google Books to validate titles
- **Custom Prompt Details** - Add specific style/setting instructions
- **Cross-Type Support** - Compare movies vs games, TV shows vs books, etc.
- **Freeform generation** - Create AI images for ANY two titles, anytime!
- **Works without tournament** - No need for active tournament or knockout phase
- **Tournament support** - Still works with active tournament matchups
- Generates AI-powered "vs" poster mashups using OpenAI
- Creates dramatic split-screen compositions with bold VS text
- **Strict Layout** - Title 1 always on left, VS center, Title 2 always on right
- Wide format (1792x1024) perfect for epic showdowns
- Standard quality ($0.04 per image, cost shown in embed)
- Cinematic style with high contrast and dramatic lighting
- **Rate Limited** - Default: 5-min cooldown, 10/day per user, 50/day per server
- **Requires OpenAI API key** configuration

**Freeform Generation:**

```
/bracket image title1:"Godzilla" title2:"King Kong"
/bracket image title1:"The Exorcist" title2:"The Shining"
/bracket image title1:"Breaking Bad" title2:"The Wire"
```

**With Custom Prompt Details:**

```
/bracket image title1:"Alien" title2:"The Thing" prompt:"in deep space with stars"
/bracket image title1:"Batman" title2:"Spider-Man" prompt:"cyberpunk city at night"
```

**Cross-Type Mashups:**

```
/bracket image title1:"Halo" title2:"Star Wars"  # Game vs Movie
/bracket image title1:"Dune" title2:"Dune"  # Book vs Movie (auto-detects types)
```

**Tournament Matchup:**

```
/bracket image matchup:"The Thing vs Alien"
```

**Help Menu:**

```
/bracket image
```

Shows: Available tournament matchups (if any) + freeform generation syntax

**Smart Search Process:**

1. **Validation:** Bot searches TMDB (movies/TV), RAWG (games), BGG (board games), Google Books
2. **Disambiguation:** If multiple matches found, shows selection menu (like `/movie` command)
3. **Rich Context:** Uses metadata (overview, type) to create better prompts
4. **Generation:** Creates cinematic prompt for OpenAI (takes 2-3 minutes)
5. **Result:** Returns epic poster mashup image with embed

**Rate Limiting:**

- **Default:** 5-minute cooldown, 10 images/user/day, 50 images/server/day
- **Admins:** Bypass cooldown by default (still subject to daily limits)
- **Whitelist:** Server admins can grant unlimited access to contributors
- **Configurable:** All limits adjustable via `/eggshen-config ai-images`

See [AI Image Generation](/commands/ai-images.md) for full documentation on rate limits and configuration.

**Example Prompt Generated:**
> "Epic movie poster mashup: 'The Thing' versus 'Alien'. Split screen composition with dramatic lighting, cinematic style, high contrast. Left side represents The Thing, right side represents Alien. Bold 'VS' text in the center. Movie poster aesthetic, professional design, 4K quality."

---

### Cancel Tournament

```
/bracket cancel
```

**Parameters:** None

**Who can use:** Administrators and Moderators only

**Features:**

- Immediately cancels the active tournament
- Cannot be undone
- Allows starting a new tournament
- All data is preserved in JSON (status: "cancelled")

**Example:**

```
/bracket cancel
```

**When to Use:**

- Tournament stalled with no participation
- Need to start over with different movies
- Technical issues or format changes needed

---

## Pacing Strategies

### Fast-Paced Tournaments (1-2 Weeks)

**Best for:** Active communities, live events, quick competitions

**Group Stage:**
- Open 4-8 groups at once with 24h voting
- Close groups next day and immediately open next batch
- Complete group stage in 2-3 days

**Knockout Stage:**
- Use `/bracket open-knockout` for entire rounds
- 24h voting per round
- Close and advance daily
- Complete knockouts in 5-7 days

**Example Timeline:**
- Day 1-3: Group stage (all 8 groups)
- Day 4: Round of 16
- Day 5: Quarterfinals
- Day 6: Semifinals
- Day 7: Finals

---

### Medium-Paced Tournaments (2-4 Weeks)

**Best for:** Most Discord communities, balanced engagement

**Group Stage:**
- Open 4 groups at a time with 24-48h voting
- Stagger opening to maintain consistent activity
- Complete group stage in 1 week

**Knockout Stage:**
- Use `/bracket open-region` to split rounds across days
- Open Region 1 (left) Monday, Region 2 (right) Wednesday
- 48h voting periods
- Complete knockouts in 2 weeks

**Example Timeline:**
- Week 1: Group stage (4 groups every 2 days)
- Week 2: Round of 16 (split by region)
- Week 3: Quarterfinals + Semifinals
- Week 4: Finals (48-72h voting)

---

### Slow-Paced Tournaments (1-2 Months)

**Best for:** Building anticipation, feature-focused events

**Group Stage:**
- Open 2 groups at a time with 2-3 day voting
- Allow extended discussion periods
- Complete group stage in 2-3 weeks

**Knockout Stage:**
- Use `/bracket open-matchup` for individual matchups
- Feature one "match of the week"
- 3-7 day voting periods
- Build hype around each battle

**Example Timeline:**
- Weeks 1-3: Group stage (2 groups every 3 days)
- Weeks 4-5: Round of 16 (1-2 matchups per week)
- Weeks 6-7: Quarterfinals + Semifinals
- Week 8: Finals (7-day voting)

---

## Managing Different Tournament Sizes

### Small Tournaments (16 entries - 4 groups)

**Structure:**
- 4 groups of 4 entries each
- Top 2 advance = 8 entries
- No wildcards needed (already power of 2)
- Start at Quarterfinals

**Advantages:**
- Quick to set up
- Easy to manage
- Good for testing or themed mini-tournaments

**Tips:**
- Open all groups at once
- Can complete in under a week
- Perfect for monthly recurring tournaments

---

### Medium Tournaments (32 entries - 8 groups)

**Structure:**
- 8 groups of 4 entries each
- Top 2 advance = 16 entries
- No wildcards needed (already power of 2)
- Start at Round of 16

**Advantages:**
- Balanced size for most communities
- 2-3 week tournament feels substantial
- Enough variety without overwhelming voters

**Tips:**
- Open 4 groups per day (2 batches)
- Use regional opening for knockouts
- Sweet spot for engagement

---

### Large Tournaments (48 entries - 12 groups)

**Structure:**
- 12 groups of 4 entries each
- Top 2 advance = 24 entries
- Best 8 third-place = 8 wildcards
- Total 32 entries starting at Round of 32

**Advantages:**
- Epic scale for special events
- Showcases wide variety of content
- Wildcards add drama and second chances

**Tips:**
- Open 4 groups at a time (3 batches)
- Extend deadlines to 48h for group stage
- Use mix of region and individual matchup opening
- Plan for 3-4 week timeline minimum
- Consider this your flagship annual tournament

**Challenges:**
- Requires more admin attention
- Risk of voter fatigue
- Need consistent promotion

---

## Engagement Tips

### Keep Members Involved

**During Group Stage:**
- Announce when new groups open
- Post reminders 6-12h before close
- Share interesting voting trends
- Encourage discussion in chat

**During Knockout Stage:**
- Build hype for marquee matchups
- Share `/bracket view` bracket images
- Highlight close votes
- Create prediction threads

### Use AI Images Strategically

**When to Generate:**
- Key matchups (semifinals, finals)
- Upset potential matchups
- Community-requested battles
- Social media promotion

**Tips:**
- Use custom `prompt` parameter for themed aesthetics
- Generate images before matchup opens
- Share in announcement channels
- Save images for tournament recap posts

### Leverage Regional Labels

**Build Narratives:**
- "Region 1 (left) is the bracket of death"
- "Region 2 has all the underdogs"
- "1A is the match of the week"

**Create Rivalries:**
- Left side vs right side predictions
- Region champions discussions
- Track which region performs better

---

## Quick Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/bracket extend-voting` | Add time to active voting | Low participation, requests for more time |
| `/bracket image` | Generate AI matchup poster | Hype key battles, social promotion |
| `/bracket cancel` | End tournament immediately | Stalled tournament, need to restart |
| `/bracket status` | Check tournament progress | Regular monitoring, troubleshooting |
| `/bracket my-votes` | View member's voting status | Help members track their votes |

---

**Related Pages:**
- [← Back to Brackets Overview](index.md)
- [Tournament Setup →](setup.md)
- [Knockout Rounds →](knockout.md)
- [All Commands →](/commands/)
