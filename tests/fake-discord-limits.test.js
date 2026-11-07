/**
 * The test fake must refuse what Discord refuses. A card that grows with its
 * data (leaderboard, survey, tournament standings) passed every test while
 * the real API answered 50035 and posted nothing, because the fake accepted
 * any size. Both halves matter: the throw (what the code under test sees)
 * and the record in `discord.violations` (what the simulators assert on,
 * because production code often catches a failed send and only logs it).
 *
 * Run with: npm test -- tests/fake-discord-limits.test.js
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { FakeDiscord } from './harness/fakeDiscord.js';

let discord;
beforeEach(() => {
  discord = new FakeDiscord();
  discord.addUser('u1');
});

/** Assert the promise is rejected the way Discord rejects, and recorded */
async function expectRejected(promise, fragment, where = null) {
  const err = await promise.then(() => null, e => e);
  expect(err).not.toBeNull();
  expect(err.code).toBe(50035);
  expect(err.status).toBe(400);
  expect(err.message).toMatch(/^Invalid Form Body/);
  expect(err.message).toContain(fragment);
  expect(discord.violations).toHaveLength(1);
  expect(discord.violations[0]).toContain(fragment);
  if (where) expect(discord.violations[0]).toContain(where); // who sent it, for the sim's report
  return err;
}

const embedOf = (description) => new EmbedBuilder().setDescription(description);

describe('channel.send', () => {
  test('a valid message goes through, with nothing recorded', async () => {
    const msg = await discord.channel.send({
      content: 'x'.repeat(2000),
      embeds: [new EmbedBuilder().setTitle('t').setDescription('d'.repeat(4096)).addFields({ name: 'n', value: 'v'.repeat(1024) })],
    });
    expect(msg.content).toHaveLength(2000);
    expect(discord.channel.posted).toHaveLength(1);
    expect(discord.violations).toEqual([]);
  });

  test('2001 characters of content is rejected, and nothing is posted', async () => {
    await expectRejected(discord.channel.send({ content: 'x'.repeat(2001) }), 'content is 2001 characters');
    expect(discord.channel.posted).toHaveLength(0);
  });

  test('embeds totalling 6001 characters are rejected', async () => {
    await expectRejected(
      discord.channel.send({ embeds: [embedOf('x'.repeat(3000)), embedOf('x'.repeat(3001))] }),
      'embeds total 6001 characters',
    );
  });

  test('a 1025-character field value is rejected', async () => {
    // Plain JSON: EmbedBuilder refuses this one itself, the API's check is what's modelled
    await expectRejected(discord.channel.send({ embeds: [{ fields: [{ name: 'n', value: 'v'.repeat(1025) }] }] }), 'field 1 value is 1025 characters');
  });

  test('an 11th embed is rejected', async () => {
    const embeds = Array.from({ length: 11 }, (_, i) => new EmbedBuilder().setTitle(`e${i}`));
    await expectRejected(discord.channel.send({ embeds }), '11 embeds');
  });

  test('an empty field value is rejected', async () => {
    // Plain JSON: EmbedBuilder itself refuses an empty value, the API's own check is what's modelled here
    await expectRejected(discord.channel.send({ embeds: [{ fields: [{ name: 'n', value: '' }] }] }), 'field 1 has no value');
  });

  test('the violation says which channel it was headed for', async () => {
    await expectRejected(discord.channel.send({ content: 'x'.repeat(2001) }), 'content is 2001', `channel ${discord.channel.id}`);
  });
});

describe('interaction replies and edits', () => {
  test('a reply over the limit throws, is recorded with the command, and leaves the interaction unanswered', async () => {
    const i = discord.command('u1', 'demo', {});
    await expectRejected(i.reply({ content: 'x'.repeat(2001) }), 'content is 2001', '/demo');
    expect(i.answered()).toBe(false);
    expect(discord.ephemeral('u1')).toHaveLength(0);
    expect(discord.channel.posted).toHaveLength(0);
  });

  test('editReply is checked too', async () => {
    const i = discord.command('u1', 'demo', {});
    await i.deferReply();
    await expectRejected(i.editReply({ embeds: [embedOf('x'.repeat(3000)), embedOf('x'.repeat(3001))] }), 'embeds total 6001');
    // the rejected edit changed nothing
    expect(i.replyMessage.embeds).toHaveLength(0);
  });

  test('a components-only edit is measured against the message it leaves, not the partial payload', async () => {
    // A message that is valid, then (as if grown by a bug elsewhere) not: an
    // edit that touches only components must still be judged on the whole
    const msg = await discord.channel.send({ content: 'ok', embeds: [embedOf('fine')] });
    msg.content = 'x'.repeat(2001);
    await expectRejected(msg.edit({ components: [] }), 'content is 2001 characters');
  });

  test('an edit that keeps the message within limits is accepted', async () => {
    const msg = await discord.channel.send({ content: 'ok', embeds: [embedOf('fine')] });
    await msg.edit({ content: 'still ok' });
    expect(msg.content).toBe('still ok');
    expect(msg.embeds).toHaveLength(1);
    expect(discord.violations).toEqual([]);
  });
});

describe('components', () => {
  // A group ballot drew one row of buttons per open group, and Discord takes
  // five: with 9–12 groups open every ballot was refused, while the fake,
  // which counted no rows, let it through
  const button = (id, label = id) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Secondary);
  const row = (...items) => new ActionRowBuilder().addComponents(...items);
  const rows = (n, perRow = 1) => Array.from({ length: n }, (_, r) => row(...Array.from({ length: perRow }, (__, b) => button(`b${r}_${b}`))));
  const select = (id, n = 1) => ({ type: 3, custom_id: id, options: Array.from({ length: n }, (_, i) => ({ label: `o${i}`, value: `v${i}` })) });

  test('5 rows of 5 buttons, and a row with one select, are accepted', async () => {
    await discord.channel.send({ content: 'ok', components: rows(5, 5) });
    await discord.channel.send({ content: 'ok', components: [row(button('a')), { type: 1, components: [select('s', 25)] }] });
    expect(discord.violations).toEqual([]);
  });

  test('a sixth action row is rejected, and nothing is posted', async () => {
    await expectRejected(discord.channel.send({ content: 'ballot', components: rows(6) }), '6 action rows (limit 5)');
    expect(discord.channel.posted).toHaveLength(0);
  });

  test('a sixth button in a row is rejected', async () => {
    await expectRejected(discord.channel.send({ content: 'x', components: rows(1, 6) }), 'row 1 has 6 buttons (limit 5)');
  });

  test('a second select in a row, or a select beside buttons, is rejected', async () => {
    await expectRejected(discord.channel.send({ content: 'x', components: [{ type: 1, components: [select('s1'), select('s2')] }] }), 'row 1 has 2 select menus');
    discord.violations.length = 0;
    await expectRejected(discord.channel.send({ content: 'x', components: [{ type: 1, components: [select('s1'), button('b').toJSON()] }] }), 'row 1 mixes a select menu with buttons');
  });

  test('a custom id used twice, or over 100 characters, is rejected', async () => {
    await expectRejected(discord.channel.send({ content: 'x', components: [row(button('same')), row(button('same'))] }), 'custom_id "same" is already used');
    discord.violations.length = 0;
    // Plain JSON: ButtonBuilder refuses this itself; the API's check is what's modelled
    await expectRejected(discord.channel.send({ content: 'x', components: [{ type: 1, components: [{ type: 2, style: 2, label: 'l', custom_id: 'c'.repeat(101) }] }] }), 'custom_id is 101 characters');
  });

  test('a select with 26 options, or an option value over 100 characters, is rejected', async () => {
    await expectRejected(discord.channel.send({ content: 'x', components: [{ type: 1, components: [select('s', 26)] }] }), 'has 26 options');
    discord.violations.length = 0;
    const long = { type: 3, custom_id: 's', options: [{ label: 'l', value: 'v'.repeat(101) }] };
    await expectRejected(discord.channel.send({ content: 'x', components: [{ type: 1, components: [long] }] }), 'option 1 value is 101 characters');
  });

  test('a reply or update with a sixth row is rejected and leaves the interaction unanswered', async () => {
    const i = discord.command('u1', 'demo', {});
    await expectRejected(i.reply({ content: 'ballot', components: rows(6), flags: 64 }), '6 action rows', '/demo');
    expect(i.answered()).toBe(false);
    expect(discord.ephemeral('u1')).toHaveLength(0);

    discord.violations.length = 0;
    const msg = await discord.channel.send({ content: 'card', components: rows(1) });
    const click = discord.button('u1', msg, 'b0_0');
    await expectRejected(click.update({ components: rows(6) }), '6 action rows', 'button b0_0');
    expect(msg.components).toHaveLength(1); // the rejected edit changed nothing
  });

  test('an edit that leaves components alone is measured with the ones the message keeps', async () => {
    const msg = await discord.channel.send({ content: 'ok', components: rows(5) });
    await msg.edit({ content: 'still ok' });
    expect(msg.components).toHaveLength(5);
    expect(discord.violations).toEqual([]);
  });
});

describe('autocomplete respond', () => {
  const choices = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ name: `c${i}`, value: `v${i}`, ...over }));

  test('25 well-formed choices are accepted', async () => {
    const i = discord.autocomplete('u1', 'demo', { focused: { name: 'q', value: '' } });
    await i.respond(choices(25, { name: 'n'.repeat(100), value: 'v'.repeat(100) }));
    expect(i.choices).toHaveLength(25);
    expect(discord.violations).toEqual([]);
  });

  test('26 choices are rejected', async () => {
    const i = discord.autocomplete('u1', 'demo', { focused: { name: 'q', value: '' } });
    await expectRejected(i.respond(choices(26)), '26 autocomplete choices');
    expect(i.choices).toBeNull();
  });

  test('a choice name of 101 characters, or none, is rejected', async () => {
    const i = discord.autocomplete('u1', 'demo', { focused: { name: 'q', value: '' } });
    await expectRejected(i.respond([{ name: 'n'.repeat(101), value: 'v' }]), 'name is 101 characters');
    discord.violations.length = 0;
    await expectRejected(i.respond([{ name: '', value: 'v' }]), 'name is 0 characters');
  });

  test('a string value over 100 characters is rejected; a number is fine', async () => {
    const i = discord.autocomplete('u1', 'demo', { focused: { name: 'q', value: '' } });
    await expectRejected(i.respond([{ name: 'n', value: 'v'.repeat(101) }]), 'value is 101 characters');
    discord.violations.length = 0;
    await i.respond([{ name: 'n', value: 12345 }]);
    expect(i.choices).toHaveLength(1);
  });
});
