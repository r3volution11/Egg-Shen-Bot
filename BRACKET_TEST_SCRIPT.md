# Tournament Bracket Testing Script

This guide will walk you through testing all the tournament bracket features, including the new flexible group sizing system.

---

## 🧪 Test 1: Create Small Tournament (4 Groups - Minimum)

**Commands:**
```
/bracket create name:"Horror Movie Showdown" groups:4
```

**Expected Results:**
- ✅ Success message showing tournament created
- ✅ Display shows "0/16 movies" (4 groups × 4 movies)
- ✅ Shows "Groups: A, B, C, D"
- ✅ Instructions to add movies with `/bracket add-group`

**What This Tests:** Minimum group size validation, dynamic movie count calculation

---

## 🧪 Test 2: Create Default Tournament (8 Groups)

**Commands:**
```
/bracket create name:"Best Sci-Fi Films"
```
*(Notice: no groups parameter = uses default)*

**Expected Results:**
- ✅ Success message showing tournament created
- ✅ Display shows "0/32 movies" (8 groups × 4 movies)
- ✅ Shows "Groups: A, B, C, D, E, F, G, H"
- ✅ Default of 8 groups applied automatically

**What This Tests:** Default group size behavior

---

## 🧪 Test 3: Create Large Tournament (12 Groups - Maximum)

**Commands:**
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
