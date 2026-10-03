/**
 * Form guidance: each server's own advice on its event request form
 * (src/utils/eventRequestGuidance.js). Admins write it in a Discord pop-up;
 * these tests have the real command open the pop-up, then submit that
 * pop-up's own fields back to the real handler — the shape that catches a
 * customId or field id that doesn't line up.
 *
 * How it shows on the form: tests/e2e/site-guidance.spec.js. What the API
 * returns: tests/event-request-system.test.js.
 *
 * Run with: npm test -- tests/event-request-guidance.test.js
 */

import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';
import { getEventRequestGuidance, DEFAULT_GUIDANCE } from '../src/utils/eventRequestGuidance.js';

const GUILD = 'guidance-guild';
let eventsConfig;
let discord;

beforeAll(async () => {
  eventsConfig = await import('../src/commands/eggshen-config-events.js');
});

beforeEach(async () => {
  const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  await saveGuildConfig(GUILD, { eventRequests: { enabled: true }, website: { url: 'https://example.com' } });
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('admin', { admin: true });
  discord.addUser('member');
});

/** Run the real command; returns the interaction (its .modal is the pop-up) */
async function open(userId, part) {
  const i = discord.command(userId, 'eggshen-config-events', { group: 'event-requests', subcommand: 'guidance', options: { part } });
  await eventsConfig.execute(i);
  return i;
}

/** The pop-up's boxes as { customId: { label, value, max } } */
function boxes(modal) {
  return Object.fromEntries(modal.components.map(row => {
    const c = row.components[0];
    return [c.custom_id, { label: c.label, value: c.value ?? '', max: c.max_length }];
  }));
}

/** Submit a pop-up as Discord would: every box, typed or not */
async function submit(userId, modal, typed) {
  const values = Object.fromEntries(Object.keys(boxes(modal)).map(id => [id, typed[id] ?? boxes(modal)[id].value]));
  const i = discord.modalSubmit(userId, modal.custom_id, values);
  await eventsConfig.handleGuidanceModal(i);
  return i.replyMessage;
}

const stored = async () => (await loadGuildConfig(GUILD)).eventRequests.guidance;

describe('reading guidance', () => {
  test('a config without it: every default', () => {
    expect(getEventRequestGuidance({})).toEqual(DEFAULT_GUIDANCE);
  });

  test('the defaults are generic: no genre, no channel names', () => {
    const all = JSON.stringify(DEFAULT_GUIDANCE);
    expect(all).not.toMatch(/horror|shudder|#[a-z]/i);
  });

  test('own text is trimmed and capped; false hides a piece; junk falls back to the default', () => {
    const g = getEventRequestGuidance({ eventRequests: { guidance: {
      intro: '  a\r\nb  ', footer: false, fields: { title: 'x'.repeat(500), when: '   ', frequency: ['no'] },
    } } });
    expect(g.intro).toBe('a\nb');
    expect(g.footer).toBeNull();
    expect(g.fields.title).toHaveLength(400);
    expect(g.fields.when).toBe(DEFAULT_GUIDANCE.fields.when);
    expect(g.fields.frequency).toBe(DEFAULT_GUIDANCE.fields.frequency);
  });
});

describe('editing it in a pop-up', () => {
  test('the pop-up opens with what the form shows now: the defaults', async () => {
    const i = await open('admin', 'fields');
    expect(i.modal.custom_id).toBe('evguidance_fields');
    const b = boxes(i.modal);
    expect(Object.keys(b)).toEqual(['title', 'description', 'image', 'when', 'frequency']);
    for (const key of Object.keys(b)) expect(b[key].value).toBe(DEFAULT_GUIDANCE.fields[key]);
  });

  test('rewriting a box saves that piece only; the rest stay defaults, stored as nothing', async () => {
    const i = await open('admin', 'fields');
    const reply = await submit('admin', i.modal, { title: 'Keep it horror or horror-adjacent.' });
    expect(reply.ephemeralFor).toBe('admin');
    expect(reply.content.split('\n').slice(0, 2)).toEqual(['✅ Form guidance saved:', '✏️ Under "Event Title"']);
    expect(await stored()).toEqual({ fields: { title: 'Keep it horror or horror-adjacent.' } });
    const shown = getEventRequestGuidance(await loadGuildConfig(GUILD));
    expect(shown.fields.title).toBe('Keep it horror or horror-adjacent.');
    expect(shown.fields.when).toBe(DEFAULT_GUIDANCE.fields.when);
  });

  test('reopening shows the server\'s own text; emptying a box goes back to the default', async () => {
    await submit('admin', (await open('admin', 'page')).modal, { intro: 'Hello.' });
    const again = await open('admin', 'page');
    expect(boxes(again.modal).intro.value).toBe('Hello.');
    expect(boxes(again.modal).footer.value).toBe(DEFAULT_GUIDANCE.footer);

    const reply = await submit('admin', again.modal, { intro: '' });
    expect(reply.content).toContain('↩️ Intro (top of the form): back to the default');
    expect(getEventRequestGuidance(await loadGuildConfig(GUILD)).intro).toBe(DEFAULT_GUIDANCE.intro);
    expect(await stored()).toEqual({ fields: {} });
  });

  test('"none" hides a piece', async () => {
    const reply = await submit('admin', (await open('admin', 'page')).modal, { footer: 'None' });
    expect(reply.content).toContain('🙈 Footer (bottom of the form): hidden');
    expect(getEventRequestGuidance(await loadGuildConfig(GUILD)).footer).toBeNull();
    // …and reopening shows it empty, not "none"
    expect(boxes((await open('admin', 'page')).modal).footer.value).toBe('');
  });

  test('one part never touches the other', async () => {
    await submit('admin', (await open('admin', 'page')).modal, { intro: 'Hello.' });
    await submit('admin', (await open('admin', 'fields')).modal, { image: 'Mods may crop it.' });
    expect(await stored()).toEqual({ intro: 'Hello.', fields: { image: 'Mods may crop it.' } });
  });

  test('submitting it as it opened says so and saves nothing', async () => {
    const i = await open('admin', 'fields');
    expect((await submit('admin', i.modal, {})).content).toBe('Nothing changed.');
    expect((await loadGuildConfig(GUILD)).eventRequests.guidance).toBeUndefined();
  });

  test('members can\'t open it, or submit one', async () => {
    const opened = await open('member', 'fields');
    expect(opened.modal).toBeUndefined();
    expect(opened.replyMessage.content).toMatch(/need Administrator/);

    const forged = discord.modalSubmit('member', 'evguidance_page', { intro: 'Pwned', footer: '' });
    await eventsConfig.handleGuidanceModal(forged);
    expect(forged.replyMessage.content).toMatch(/Only administrators and moderators/);
    expect((await loadGuildConfig(GUILD)).eventRequests.guidance).toBeUndefined();
  });

  test('view says which pieces differ from the defaults', async () => {
    const view = async () => {
      const i = discord.command('admin', 'eggshen-config-events', { group: 'event-requests', subcommand: 'view' });
      await eventsConfig.execute(i);
      return i.replyMessage.embeds[0].fields.find(f => f.name === 'Form Guidance').value;
    };
    expect(await view()).toBe('The defaults');
    await submit('admin', (await open('admin', 'fields')).modal, { title: 'Keep it horror.', frequency: 'none' });
    expect(await view()).toBe('Defaults, except: title, frequency (hidden)');
  });
});
