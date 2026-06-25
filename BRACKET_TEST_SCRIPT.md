# Tournament Bracket Testing Script

This guide will walk you through testing all the tournament bracket features, including search integration with selection menus and AI image generation.

---

## 🧪 Test 1: Create Tournament with Movie Search Integration

**Commands:**

```
/bracket create name:"Horror Movie Showdown" groups:4
/bracket add-title group:A type:movie title:The Thing
/bracket add-title group:A type:movie title:Alien
/bracket add-title group:A type:movie title:The Fly
/bracket add-title group:A type:movie title:Evil Dead
```

**Expected Results:**

- ✅ Tournament created successfully
- ✅ Bot searches TMDB for each movie title
- ✅ If single match found, auto-adds with year and metadata
- ✅ If multiple matches, shows selection menu (dropdown with options)
- ✅ User selects exact title from menu
- ✅ Group A displays with proper titles and years: "The Thing (1982)", "Alien (1979)", etc.
- ✅ Progress shown: "1/4 titles", "2/4 titles", "3/4 titles", "4/4 titles - Group complete!"
- ✅ Metadata (poster URLs, IDs) stored in tournament data

**What This Tests:** TMDB search integration, selection menu workflow, metadata storage, progress tracking

---

## 🧪 Test 2: Add TV Shows to Tournament

**Commands:**

```
/bracket create name:"Best TV Shows" groups:4
/bracket add-title group:A type:tv title:Breaking Bad
/bracket add-title group:A type:tv title:The Wire
/bracket add-title group:A type:tv title:The Sopranos
/bracket add-title group:A type:tv title:Mad Men
```

**Expected Results:**

- ✅ Bot searches TV shows via TMDB
- ✅ Shows selection menus if multiple matches
- ✅ Displays show titles with first air year
- ✅ Stores TV show metadata (posters, ratings, IDs)

**What This Tests:** TV show search integration, selection menu for TV

---

## 🧪 Test 3: Add Video Games to Tournament

**Commands:**

```
/bracket create name:"Best Action Games" groups:4
/bracket add-title group:A type:game title:Doom Eternal
/bracket add-title group:A type:game title:Resident Evil 4
/bracket add-title group:A type:game title:Halo 3
/bracket add-title group:A type:game title:Bioshock
```

**Expected Results:**

- ✅ Bot searches RAWG API for games
- ✅ Shows selection menu if multiple versions/editions exist
- ✅ Displays game titles with release years
- ✅ Stores game metadata (images, ratings, platforms)

**What This Tests:** Video game search integration (RAWG)

---

## 🧪 Test 4: Ambiguous Title Handling with Selection Menu

**Commands:**

```
/bracket create name:"Spider-Man Tournament" groups:4
/bracket add-title group:A type:movie title:Spider-Man
```

**Expected Results:**

- ✅ Bot finds multiple matches for "Spider-Man"
- ✅ Shows selection menu with all Spider-Man movies
- ✅ Each option shows: Title, year, and description
- ✅ User selects "Spider-Man (2002)" from dropdown
- ✅ Confirms selection with thumbnail: "✅ Added to Group A: Spider-Man (2002)"
- ✅ Shows progress: "1/4 titles"

**What This Tests:** Multiple search result handling, selection menu UX

---

## 🧪 Test 5: Complete a Group with Specific Titles

**Commands:**

```
/bracket add-title group:A type:movie title:Spider-Man
# (select 2002 version from menu)
/bracket add-title group:A type:movie title:The Batman
# (select 2022 version from menu)
/bracket add-title group:A type:movie title:Superman
# (select 1978 version from menu)
/bracket add-title group:A type:movie title:Iron Man
# (select 2008 version from menu)
```

**Expected Results:**

- ✅ Selection menus shown for each ambiguous title
- ✅ User picks exact version they want
- ✅ Titles added with correct years
- ✅ Progress indicator updates: 1/4, 2/4, 3/4, 4/4
- ✅ Final message: "Group A is complete! Add more groups or use /bracket open-groups"
- ✅ Metadata properly stored

**What This Tests:** Search specificity, year-based disambiguation

---

## 🧪 Test 6: Freeform AI Image Generation (No Tournament)

**Commands:**

```
/bracket image title1:"The Thing" title2:"Alien"
```

**Expected Results:**

- ✅ Works WITHOUT an active tournament
- ✅ Generates DALL-E 3 image for "The Thing vs Alien"
- ✅ Takes 10-30 seconds
- ✅ Displays epic split-screen "VS" poster
- ✅ Shows context: "Freeform"
- ✅ Cost: $0.04 per image

**What This Tests:** Freeform image generation (new feature!)

---

## 🧪 Test 7: AI Image During Group Stage

**Commands:**

```
/bracket create name:"Test Tournament" groups:4
/bracket add-title group:A type:movie title:The Thing
/bracket add-title group:A type:movie title:Alien
/bracket add-title group:A type:movie title:The Fly
/bracket add-title group:A type:movie title:Evil Dead
/bracket image title1:"Predator" title2:"Terminator"
```

**Expected Results:**

- ✅ Image generation works EVEN during group stage (no more knockout-only restriction!)
- ✅ Generates image for any two titles
- ✅ No error about knockout phase

**What This Tests:** Removal of knockout-only restriction

---

## 🧪 Test 8: Tournament Matchup AI Image

**Commands:**

```
/bracket open-groups groups:"A,B,C,D"
/bracket close-groups groups:"A,B,C,D"
/bracket advance-knockout
/bracket image matchup:"The Thing vs Alien"
```

**Expected Results:**

- ✅ Finds matchup from active tournament
- ✅ Generates AI image with tournament context
- ✅ Shows round information (e.g., "Quarterfinals")
- ✅ Works as before but now with freeform option too

**What This Tests:** Tournament-based matchup images

---

## 🧪 Test 9: Image Help Menu

**Commands:**

```
/bracket image
```

**Expected Results:**

- ✅ Shows help message with two options:
  1. Tournament matchups (if any exist)
  2. Custom freeform generation syntax: `/bracket image title1:"X" title2:"Y"`
- ✅ Helpful guidance for both modes

**What This Tests:** User-friendly help system

---

## 🧪 Test 10: Mixed Tournament Types (Error Test)

**Commands:**

```
/bracket create name:"Mixed Tournament" groups:4
/bracket add-group group:A type:movie title1:"The Thing" title2:"Alien" title3:"The Fly" title4:"Evil Dead"
/bracket add-group group:B type:tv title1:"Breaking Bad" title2:"The Wire" title3:"Stranger Things" title4:"Westworld"
```

**Expected Results:**

- ✅ Group A added successfully (movies)
- ✅ Group B addition FAILS with error: "Tournament type mismatch. This tournament is for movies, but you're trying to add tvs."
- ✅ Tournament maintains single type consistency

**What This Tests:** Type validation, consistent tournament types

---

## 🧪 Quick Smoke Test (5 Minutes)

For a quick validation that everything works:

1. **Create Tournament:**

   ```
   /bracket create name:"Quick Test" groups:4
   ```

2. **Add Group with Search:**

   ```
   /bracket add-group group:A type:movie title1:"The Thing 1982" title2:"Alien 1979" title3:"The Fly 1986" title4:"Evil Dead 1981"
   ```

3. **Freeform AI Image:**

   ```
   /bracket image title1:"Godzilla" title2:"King Kong"
   ```

4. **Check Status:**

   ```
   /bracket status
   ```

5. **Cancel:**

   ```
   /bracket cancel
   ```

**All should work without errors!**

```
/bracket create name:"Ultimate Action Tournament" groups:12
```

**Expected Results:**

- ✅ Success message showing tournament created
- ✅ Display shows "0/48 movies" (12 groups × 4 movies)
- ✅ Shows "Groups: A, B, C, D, E, F, G, H, I, J, K, L"
- ✅ All 12 group letters displayed

**What This Tests:** Maximum group size validation, letter range expansion

---

## 🧪 Test 4: Try Invalid Group Sizes

**Commands:**

```
/bracket create name:"Too Small" groups:3
/bracket create name:"Too Large" groups:13
```

**Expected Results:**

- ✅ Discord should show validation error before command sends
- ✅ Interface should indicate valid range is 4-12
- ✅ Commands should not be submitted

**What This Tests:** Discord's built-in parameter validation

---

## 🧪 Test 5: Add Movies to Groups (Use 4-Group Tournament)

**Commands:**

```
/bracket add-group tournament:"Horror Movie Showdown" group:A movie:"The Thing"
/bracket add-group tournament:"Horror Movie Showdown" group:A movie:"Alien"
/bracket add-group tournament:"Horror Movie Showdown" group:A movie:"The Shining"
/bracket add-group tournament:"Horror Movie Showdown" group:A movie:"Halloween"
```

**Expected Results:**

- ✅ Each movie adds successfully
- ✅ Progress shows "1/16", "2/16", "3/16", "4/16"
- ✅ After 4th movie: "Group A is complete (4/4 movies)"

**What This Tests:** Movie addition, progress tracking, group completion detection

---

## 🧪 Test 6: Try Invalid Group Letter

**Commands:**

```
/bracket add-group tournament:"Horror Movie Showdown" group:E movie:"Scream"
```

**Expected Results:**

- ✅ Error message: "Invalid group ID. This tournament only has groups A through D."
- ✅ Movie is not added to tournament

**What This Tests:** Group validation based on tournament size

---

## 🧪 Test 7: Fill All Groups (Continue with Horror Tournament)

Add 4 movies each to Groups B, C, and D (12 more movies total). You can use any movie names.

**Quick Movie Ideas:**

- Group B: Evil Dead, The Exorcist, Poltergeist, Nightmare on Elm Street
- Group C: The Ring, Get Out, It, The Conjuring
- Group D: Hereditary, Scream, The Witch, Midsommar

**Expected Results:**

- ✅ Progress counter increases: 8/16, 12/16, 16/16
- ✅ When complete: "All groups complete! Ready to close groups."

**What This Tests:** Full tournament population, completion detection

---

## 🧪 Test 8: Close Groups & Check Wildcard Count (4 Groups)

**Commands:**

```
/bracket close-groups tournament:"Horror Movie Showdown"
```

**Expected Results:**

- ✅ Success message
- ✅ Footer shows: "8 wildcards will advance to Round of 16"
- ✅ 16 buttons (A1, A2, B1, B2, etc.) appear for voting
- ✅ Correct wildcard calculation: 4 groups × 2 winners = 8 direct, need 16 total = 8 wildcards

**What This Tests:** Dynamic wildcard calculation (4 groups → 16 participants)

---

## 🧪 Test 9: Create & Close 8-Group Tournament

**Commands:**

```
/bracket create name:"Action Tournament Test" groups:8
```

Then add 32 movies (8 groups × 4 movies) using `/bracket add-group`, then:

```
/bracket close-groups tournament:"Action Tournament Test"
```

**Expected Results:**

- ✅ Footer shows: "16 wildcards will advance to Round of 32"
- ✅ 32 buttons appear for voting
- ✅ Correct calculation: 8 groups × 2 = 16 direct, need 32 total = 16 wildcards

**What This Tests:** Dynamic wildcard calculation (8 groups → 32 participants)

---

## 🧪 Test 10: Create & Close 12-Group Tournament

**Commands:**

```
/bracket create name:"Comedy Championship" groups:12
```

Then add 48 movies (12 groups × 4 movies) using `/bracket add-group`, then:

```
/bracket close-groups tournament:"Comedy Championship"
```

**Expected Results:**

- ✅ Footer shows: "8 wildcards will advance to Round of 32"
- ✅ 48 buttons appear for voting
- ✅ Correct calculation: 12 groups × 2 = 24 direct, need 32 total = 8 wildcards

**What This Tests:** Dynamic wildcard calculation (12 groups → 32 participants)

---

## 🧪 Test 11: Advance Through Knockout Rounds

After selecting winners and wildcards in any tournament:

**Commands:**

```
/bracket advance-knockout tournament:"Horror Movie Showdown"
```

**Expected Results:**

- ✅ 4 groups (16 total) → Displays "Round of 16" ← **Check this!**
- ✅ 8 groups (32 total) → Displays "Round of 32" ← **Check this!**
- ✅ Shows correct number of matchups (8 for R16, 16 for R32)
- ✅ Shows wildcard count in matchup list

**What This Tests:** Dynamic starting round detection

---

## 🧪 Test 12: Status Command at Different Phases

**Commands:**

```
/bracket status tournament:"Horror Movie Showdown"
```

Run this at different stages:

- After creation (empty groups)
- After adding some movies
- After closing groups
- During knockout phase

**Expected Results:**

- ✅ Shows correct phase (Group Stage / Knockout Stage)
- ✅ Shows dynamic group count ("8 groups" or "4 groups" etc.)
- ✅ Shows progress appropriately
- ✅ Shows current round name in knockout phase

**What This Tests:** Status display accuracy across all phases

---

## 🧪 Test 13: List Multiple Tournaments

**Commands:**

```
/bracket list
```

**Expected Results:**

- ✅ Shows all active tournaments with names
- ✅ Shows creator and current phase
- ✅ Shows different group counts per tournament

**What This Tests:** Tournament listing with varied configurations

---

## 🧪 Test 14: Delete Tournament

**Commands:**

```
/bracket delete tournament:"Comedy Championship"
```

**Expected Results:**

- ✅ Confirmation message
- ✅ Tournament removed from `/bracket list`

**What This Tests:** Tournament deletion

---

## 📊 Summary Checklist

After completing all tests, verify:

- [ ] **4-group tournaments** create successfully with 16 total movies
- [ ] **8-group tournaments** create successfully with 32 total movies (default)
- [ ] **12-group tournaments** create successfully with 48 total movies
- [ ] **Invalid sizes** (3, 13) are rejected
- [ ] **Group validation** prevents adding to non-existent groups
- [ ] **Wildcard counts** are correct:
  - 4 groups = 8 wildcards (to reach 16)
  - 8 groups = 16 wildcards (to reach 32)
  - 12 groups = 8 wildcards (to reach 32)
- [ ] **Starting rounds** are correct:
  - 16 participants = Round of 16
  - 32 participants = Round of 32
- [ ] **Status displays** show dynamic group counts
- [ ] **All subcommands work** (create, add-group, close-groups, advance-knockout, status, list, delete)

---

## 🐛 What to Report

If anything doesn't match the expected results above, please note:

1. **What command** you ran
2. **What you expected** to see
3. **What actually happened**
4. **Group size** you were testing with
5. **Tournament name** (if applicable)

---

## 💡 Quick Test Path (Minimal)

If you want to do a quick smoke test:

1. Create 4-group tournament: `/bracket create name:"Quick Test" groups:4`
2. Add 16 movies (4 per group A-D)
3. Close groups: `/bracket close-groups tournament:"Quick Test"`
4. Verify footer says "8 wildcards will advance to Round of 16"
5. Select winners
6. Advance: `/bracket advance-knockout tournament:"Quick Test"`
7. Verify it says "Round of 16" (not "Quarterfinals" or "Semifinals")

If all 7 steps work correctly, the core functionality is solid! ✅
