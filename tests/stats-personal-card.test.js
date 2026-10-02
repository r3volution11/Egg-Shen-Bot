/**
 * /stats type:My Stats is posted in the channel, so it says whose stats
 * they are: the person's server name in the title and their avatar. It used
 * to say "Your Stats" with no picture, which reads as nobody's to everyone
 * else in the channel.
 *
 * Run with: npm test -- tests/stats-personal-card.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { FakeDiscord } from './harness/fakeDiscord.js';

let stats;
let trackSearch;

beforeAll(async () => {
  stats = await import('../src/commands/stats.js');
  ({ trackSearch } = await import('../src/utils/statsTracker.js'));
});

describe('/stats type:My Stats', () => {
  test('names the person and shows their avatar', async () => {
    const discord = new FakeDiscord({ guildId: 'stats-card-guild' });
    discord.addUser('doug', { nickname: 'Doug', guildAvatar: 'https://cdn.example/guild/doug.png' });
    await trackSearch('stats-card-guild', 'doug', 'doug', 'movie', 'Alien', '1979');

    const i = discord.command('doug', 'stats', { options: { type: 'personal' } });
    await stats.execute(i);

    const embed = i.replyMessage.embeds[0].toJSON();
    expect(embed.title).toBe("📊 Doug's Stats - All Time");
    expect(embed.thumbnail.url).toBe('https://cdn.example/guild/doug.png');
  });
});
