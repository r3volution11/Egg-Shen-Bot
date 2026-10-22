/**
 * Escape Velocity, end to end: whole events through the real commands,
 * handlers and scheduler (tests/harness/escapeSim.js). The admin's menus are
 * driven with their own option values, and answers are clicked on the
 * buttons the real dashboard built.
 *
 * Record:  SIM_RECORD=1 npm test -- tests/escape-sim.test.js
 * Run:     npm test -- tests/escape-sim.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadSim, finishSim, clock } from './harness/escapeSim.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let Sim;

beforeAll(async () => {
  clock.install();
  ({ Sim } = await loadSim());
});

afterAll(() => finishSim());

describe('a whole event', () => {
  test('setup to final results', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new Sim('ev-whole', { seed: 11 });

    // Setup: create, pick from the menus, build — starts now, so it launches
    const screen = await sim.setUp({ days: 2 });
    expect(screen.text).toMatch(/is live in/);
    const card = sim.missionCard();
    expect(card).toBeTruthy();
    expect(card.text).toContain('Mission day 1 of 2');

    // pilot1 climbs past separation 5, then misses at stage 7
    let dash = await sim.launch('pilot1');
    expect(dash.ephemeralFor).toBe('pilot1');
    expect(dash.text).toContain('Stage 1 of 15');
    for (let i = 0; i < 6; i++) await sim.answer('pilot1', dash);
    expect(dash.text).toContain('Stage 7 of 15');
    expect(dash.text).toContain('2,000'); // banked after six
    await sim.answer('pilot1', dash, { right: false });
    expect(dash.text).toContain('Mission failed');
    expect(dash.text).toContain('1,000');
    expect(dash.allComponents).toHaveLength(0);

    // No second launch today: Launch shows today's result instead
    const again = await sim.launch('pilot1');
    expect(again.text).toContain('Mission failed');
    expect(again.allComponents).toHaveLength(0);

    // pilot2 banks two stages and aborts
    dash = await sim.launch('pilot2');
    await sim.answer('pilot2', dash);
    await sim.answer('pilot2', dash);
    const run = sim.activeRun('pilot2');
    await sim.click('pilot2', dash, `ev_abort_${run.id}_3`);
    expect(dash.text).toContain('Aborted');
    expect(dash.text).toContain('200');

    // The card's standings catch up on the next pass (at most once a minute)
    clock.now += 61_000;
    await sim.tick();
    const standings = sim.missionCard().text;
    expect(standings.indexOf('<@pilot1>')).toBeLessThan(standings.indexOf('<@pilot2>'));
    expect(standings).toContain('**1,000**');

    // A new UTC day: a fresh card (it notifies), and the old one loses its buttons
    clock.now = Date.UTC(2026, 9, 21, 0, 0, 30);
    await sim.tick();
    const today = sim.missionCard();
    expect(today).not.toBe(card);
    expect(card.allComponents).toHaveLength(0);
    expect(today.text).toContain('Mission day');
    dash = await sim.launch('pilot1');
    expect(dash.text).toContain('Stage 1 of 15');

    // The end: pilot1's open run keeps its bank, results ping the podium
    await sim.answer('pilot1', dash);
    clock.now = Date.UTC(2026, 9, 22, 15, 0, 30);
    await sim.tick();
    const results = sim.channel.posted.at(-1);
    expect(results.text).toContain('mission complete');
    expect(results.allowedMentions.users).toEqual(['pilot1', 'pilot2']);
    expect(sim.data().event.status).toBe('finished');
    expect(today.allComponents).toHaveLength(0);

    const play = await sim.command('pilot3', 'escape', 'play');
    expect(play.reply.text).toContain('no Escape Velocity mission running');
  }, 60_000);
});

describe('a scheduled launch', () => {
  test('posts the mission card once, when its time comes', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new Sim('ev-scheduled', { seed: 12 });
    const screen = await sim.setUp({ startsInHours: 2, genres: ['comedy'] });
    expect(screen.text).toMatch(/scheduled to launch/);
    expect(sim.missionCard()).toBeUndefined();

    const early = await sim.command('pilot1', 'escape', 'play');
    expect(early.reply.text).toContain('launches');

    clock.now += HOUR;
    await sim.tick();
    expect(sim.missionCard()).toBeUndefined();

    clock.now += HOUR;
    await sim.tick();
    await sim.tick();
    const cards = sim.channel.posted.filter(m => m.text.includes('ESCAPE VELOCITY'));
    expect(cards).toHaveLength(1);
  }, 60_000);
});

describe('milestones', () => {
  test('separation 10 and orbit are announced as new messages', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new Sim('ev-orbit', { seed: 13 });
    await sim.setUp({ media: ['movie'], genres: ['scifi'] });

    const dash = await sim.launch('pilot1');
    for (let i = 0; i < 15; i++) await sim.answer('pilot1', dash);
    expect(dash.text).toContain('ORBIT');
    expect(dash.text).toContain('1,000,000');

    const news = sim.channel.posted.map(m => m.text);
    expect(news.some(t => t.includes('cleared stage separation 10'))).toBe(true);
    expect(news.some(t => t.includes('reached **ORBIT**'))).toBe(true);
    // Their news, not a summons: displayed, never pinged
    const orbit = sim.channel.posted.find(m => m.text.includes('ORBIT'));
    expect(orbit.allowedMentions).toEqual({ parse: [] });
    // Never two questions about the same title in one run
    const run = Object.values(sim.data().runs)[0];
    const titles = run.asked.map(id => sim.data().questions[id].source.id);
    expect(new Set(titles).size).toBe(15);
  }, 60_000);
});

describe('who may do what', () => {
  test('setup is for admins only, from the command and its menus', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new Sim('ev-perms', { seed: 14 });
    const attempt = await sim.command('pilot1', 'escape-setup', 'create', { name: 'Mine', days: 1 });
    expect(attempt.reply.text).toContain('Only admins');
    expect(sim.data()).toBeNull();
  });

  test('turning the game off closes the Launch button too', async () => {
    clock.now = Date.UTC(2026, 9, 20, 15, 0, 0);
    const sim = new Sim('ev-switch', { seed: 15 });
    await sim.setUp({ genres: ['war'] });
    const { loadGuildConfig, saveGuildConfig } = await import('../src/utils/guildConfig.js');
    const cfg = await loadGuildConfig('ev-switch');
    cfg.commandPermissions.escape = false;
    await saveGuildConfig('ev-switch', cfg);

    const i = await sim.click('pilot1', sim.missionCard(), 'ev_launch');
    expect(i.replyMessage.text).toContain('turned off');
    expect(sim.data().players.pilot1).toBeUndefined();
  }, 60_000);
});
