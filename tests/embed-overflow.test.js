/**
 * Places that put user-written text into an embed slot Discord caps, and
 * what they do at the cap. A raw `.slice` there can cut a custom emoji in
 * half (raw `<:name:id` on screen), and an append can push a title over 256
 * so Discord rejects the whole edit.
 *
 * Run with: npm test -- tests/embed-overflow.test.js
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { createPoll, createPollEmbed } from '../src/utils/pollManager.js';
import { updateVotingMessageClosed } from '../src/utils/tournamentScheduler.js';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { messageProblems } from '../src/utils/embedFit.js';

const POLLS_DIR = process.env.GUILD_POLLS_DIR || path.join(process.cwd(), 'guild_polls');
const GUILD = 'embed-overflow-test-guild';
const cleanup = () => {
  const file = path.join(POLLS_DIR, `${GUILD}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
};
beforeEach(cleanup);
afterEach(cleanup);

describe('survey card description', () => {
  const EMOJI = '<:es_pie_3fa9:123456789012345678>';

  /** A survey whose description has a custom emoji straddling character 4096 */
  function surveyWithEmojiAtTheEdge() {
    const poll = createPoll(GUILD, 'chan', 'msg', 'user', 'Q?', ['A', 'B']);
    poll.options[1].text = EMOJI;
    const L = createPollEmbed(poll).data.description.length - EMOJI.length; // text before the emoji
    poll.options[0].text = 'a'.repeat(poll.options[0].text.length + (4090 - L)); // emoji now starts at 4090
    return poll;
  }

  test('an over-long survey is cut within 4096 without splitting a custom emoji', () => {
    const description = createPollEmbed(surveyWithEmojiAtTheEdge()).data.description;
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).not.toContain('<:es_pie'); // the emoji went whole, not in part
    expect(description.endsWith('…')).toBe(true);
    expect(description.indexOf('<')).toBe(-1);
  });

  test('a survey that fits is untouched', () => {
    const poll = createPoll(GUILD, 'chan', 'msg', 'user', 'Q?', ['A', 'B']);
    const description = createPollEmbed(poll).data.description;
    expect(description).toContain('A');
    expect(description).not.toContain('…');
  });
});

describe('tournament voting message closed', () => {
  async function postVotingMessage(title) {
    const discord = new FakeDiscord();
    const embed = new EmbedBuilder().setTitle(title).setDescription('Vote!');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('vote_1').setLabel('Vote').setStyle(ButtonStyle.Primary));
    const message = await discord.channel.send({ embeds: [embed], components: [row] });
    return { discord, message };
  }
  const closeIt = (discord, message) =>
    updateVotingMessageClosed(discord.guild, { messageChannelId: discord.channel.id, messageId: message.id }, 'm1', 'matchup');

  test('a title already at 256 characters still gets the CLOSED marker, within 256', async () => {
    const { discord, message } = await postVotingMessage('T'.repeat(256));
    await closeIt(discord, message);
    expect(discord.violations).toEqual([]);
    const title = message.embeds[0].title;
    expect(title).toHaveLength(256);
    expect(title.endsWith(' 🔒 CLOSED')).toBe(true);
    expect(message.findComponent('vote_1').disabled).toBe(true);
  });

  test('a normal title is just given the marker', async () => {
    const { discord, message } = await postVotingMessage('Round 1: A vs B');
    await closeIt(discord, message);
    expect(message.embeds[0].title).toBe('Round 1: A vs B 🔒 CLOSED');
    expect(messageProblems({ embeds: message.embeds })).toEqual([]);
  });
});
