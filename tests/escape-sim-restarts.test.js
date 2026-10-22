/**
 * Escape Velocity across bot restarts. Deploys restart the bot mid-event
 * (CLAUDE.md), and everything the game needs — runs, the draft being set up,
 * which card is today's — must come back from disk, without a duplicate post.
 *
 * Shares the simulator's recording; re-record with:
 *   SIM_RECORD=1 npm test -- --runInBand tests/escape-sim.test.js tests/escape-sim-restarts.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadSim, finishSim, clock, restartBot } from './harness/escapeSim.js';

let mods;

beforeAll(async () => {
  clock.install();
  mods = await loadSim();
});

afterAll(() => finishSim());

const cards = (sim) => sim.channel.posted.filter(m => m.text.includes('ESCAPE VELOCITY'));

// Every scenario sets up the same event (films, Crime) from the same seed, so
// they build the same question pool and share one set of recorded responses.

describe('restarts', () => {
  test('setup survives a restart between the menus', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new mods.Sim('ev-r-setup', { seed: 21 });
    const create = await sim.command('admin', 'escape-setup', 'create', { name: 'Restart Launch', days: 2 });
    const screen = create.reply;
    await sim.choose('admin', screen, 'ev_setup_media', ['movie']);

    await restartBot();

    await sim.choose('admin', screen, 'ev_setup_genres', ['crime']);
    await sim.click('admin', screen, 'ev_setup_go');
    expect(screen.text).toMatch(/is live in/);
    expect(sim.data().event).toMatchObject({ media: ['movie'], genres: ['crime'], status: 'live' });
  }, 60_000);

  test('a run resumes at the same stage after a restart', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new mods.Sim('ev-r-run', { seed: 21 });
    await sim.setUp({ media: ['movie'], genres: ['crime'] });
    let dash = await sim.launch('pilot1');
    await sim.answer('pilot1', dash);
    await sim.answer('pilot1', dash);
    const before = sim.activeRun('pilot1');

    await restartBot();

    dash = await sim.launch('pilot1');
    expect(dash.text).toContain('Picking up where you left off');
    expect(dash.text).toContain('Stage 3 of 15');
    expect(sim.activeRun('pilot1').id).toBe(before.id);
    // The old dashboard's buttons still work too: they carry run and stage
    await sim.answer('pilot1', dash);
    expect(sim.activeRun('pilot1').stage).toBe(4);
  }, 60_000);

  test('the day\'s card is posted once, however often the bot restarts', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new mods.Sim('ev-r-day', { seed: 21 });
    await sim.setUp({ media: ['movie'], genres: ['crime'] });
    expect(cards(sim)).toHaveLength(1);

    clock.now = Date.UTC(2026, 9, 21, 0, 1, 0);
    await sim.tick();
    expect(cards(sim)).toHaveLength(2);

    await restartBot();
    await sim.tick();
    clock.now += 60_000;
    await sim.tick();
    expect(cards(sim)).toHaveLength(2);
  }, 60_000);

  test('a pending standings refresh edits the same card after a restart', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new mods.Sim('ev-r-card', { seed: 21 });
    await sim.setUp({ media: ['movie'], genres: ['crime'] });
    const dash = await sim.launch('pilot1');
    await sim.answer('pilot1', dash, { right: false });
    expect(sim.data().event.card.dirty).toBe(true);

    await restartBot();
    clock.now += 61_000;
    await sim.tick();

    expect(cards(sim)).toHaveLength(1);
    expect(cards(sim)[0].text).toContain('<@pilot1>');
    expect(sim.data().event.card.dirty).toBe(false);
  }, 60_000);
});
