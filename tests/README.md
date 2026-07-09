# Tournament Testing Suite

Automated testing for the bracket/tournament system to catch bugs before human testing.

> This doc covers the bracket/tournament Jest suite specifically. Service-layer unit
> tests live in `tests/services/` (same `npm test` run). Browser end-to-end tests for
> the Event Request web form live in `tests/e2e/` (Playwright) — see
> [`tests/e2e/README.md`](../e2e/README.md).

## Quick Start

### 1. Install Testing Dependencies

```bash
npm install
```

This installs Jest and testing utilities.

### 2. Run the Simulation Script (Recommended First Step)

```bash
npm run test:simulate
```

This runs a complete tournament from start to finish:
- Creates tournament with 4 groups (16 movies)
- Adds realistic horror movie titles
- Simulates 5 users voting in each group
- Closes groups and calculates results
- Calculates wildcards
- Generates knockout bracket
- Opens knockout voting
- Simulates 10 users voting in matchups
- Closes matchups and advances winners

**Benefits:**
- Visual, colorized output showing each step
- Creates a real tournament JSON file you can inspect
- Tests the full happy path
- Easy to understand what's happening

### 3. Run Unit Tests

```bash
npm test
```

Runs comprehensive Jest unit tests covering:
- Tournament creation
- Adding/removing titles
- Group voting
- Tiebreaker system
- Knockout bracket generation
- Knockout voting

### 4. Run Tests with Coverage

```bash
npm run test:coverage
```

Shows code coverage report - which lines of code are tested.

### 5. Watch Mode (During Development)

```bash
npm run test:watch
```

Re-runs tests automatically when you change code.

## What Gets Tested

### ✅ Tournament Creation
- Creating new tournament
- Preventing duplicate tournaments
- Different group counts (4-12)

### ✅ Title Management
- Adding titles to groups
- Preventing more than 4 titles per group
- Tracking title count

### ✅ Group Voting
- Opening groups for voting
- Closing groups and calculating results
- Point calculation (3pts for 1st choice, 2pts for 2nd)

### ✅ Tiebreaker System
- Creating tiebreakers when ties detected
- Voting in tiebreakers
- Closing tiebreakers with winner
- Random selection if tiebreaker also ties

### ✅ Knockout Bracket
- Generating bracket from group results
- Validating all groups closed before advancing
- Opening knockout matchups
- Closing matchups and advancing winners

## Test Files

- **`bracketManager.test.js`** - Unit tests for core tournament logic
- **`event-request-system.test.js`** - Unit tests for event request system (API endpoints, OAuth, configuration)
- **`discord-limits.test.js`** - Tests for Discord API limits and constraints
- **`simulate-tournament.js`** - Full simulation script with visual output

## Tips

### For Bug Fixes
1. Run simulation first to see if the bug exists: `npm run test:simulate`
2. Write a specific unit test that reproduces the bug
3. Fix the code
4. Verify the test passes: `npm test`

### For New Features
1. Write tests for the new feature first (TDD)
2. Implement the feature
3. Run tests to verify it works
4. Run simulation to see it in action

### Before Deployment
```bash
npm test && npm run test:simulate
```

This runs all tests and the simulation to ensure everything works.

## Interpreting Results

### Simulation Output

```
=======================================================
🏆 TOURNAMENT SIMULATION START
=======================================================

=======================================================
Step 1: Create Tournament
=======================================================
✓ Tournament created: Horror Movie Madness (Simulated)
  Groups: 4
  Status: setup
```

- ✓ Green checkmarks = success
- ❌ Red X = failure  
- Yellow text = section headers
- Cyan text = details

### Jest Output

```
PASS  tests/bracketManager.test.js
  Tournament Creation
    ✓ should create a new tournament (15 ms)
    ✓ should prevent creating duplicate tournament (8 ms)
  Group Voting
    ✓ should open group for voting (5 ms)
    
Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
```

- PASS = all tests in file passed
- Numbers show execution time
- Summary at bottom

## Troubleshooting

### Tests Fail with "Cannot find module"
Make sure you installed dependencies:
```bash
npm install
```

### Simulation Creates Tournament But Nothing Happens
Check the JSON file created in `guild_tournaments/simulation-guild.json` to see the tournament state.

### Want to Test Specific Scenarios
Modify `simulate-tournament.js` to:
- Change number of groups
- Change vote patterns
- Force specific tie scenarios
- Test edge cases

## Next Steps After Automated Testing

Once automated tests pass:
1. ✅ Deploy to production server
2. ✅ Have 2-3 real users test voting UX
3. ✅ Confirm buttons work correctly
4. ✅ Test on mobile devices
5. ✅ Verify Discord message formatting looks good

Automated tests catch logic bugs. Human testing catches UX issues.
