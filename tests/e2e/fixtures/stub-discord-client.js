import { Collection } from 'discord.js';

/**
 * Builds a minimal fake discord.js Client sufficient to drive src/api/server.js
 * end-to-end without a real bot connection.
 *
 * Uses discord.js's own Collection (not a plain Map) for guilds.cache/channels.cache,
 * since server.js calls .filter()/.map() on those caches — a plain Map lacks those
 * methods and will throw. Also implements guild.members.fetch(), which
 * checkGuildMembership() in server.js depends on.
 *
 * @param {Array<object>} guildDefs - see tests/e2e/fixtures/scenarios.js for shape
 */
export function createStubClient(guildDefs) {
  const guilds = new Collection();

  for (const g of guildDefs) {
    const channels = new Collection(
      g.channels.map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          type: c.type, // 0 = text, 2 = voice, 13 = stage
          isTextBased: () => c.type === 0,
          send: async (payload) => ({ id: `msg_${Date.now()}_${c.id}`, ...payload }),
        },
      ])
    );

    const memberIds = new Set(g.memberIds);

    guilds.set(g.id, {
      id: g.id,
      name: g.name,
      channels: { cache: channels },
      members: {
        fetch: async (userId) => {
          if (!memberIds.has(userId)) {
            throw new Error('Unknown Member');
          }
          return { id: userId };
        },
      },
      scheduledEvents: {
        create: async (opts) => ({ id: 'stub-event-id', url: 'https://discord.com/events/stub', ...opts }),
      },
    });
  }

  return {
    user: { tag: 'E2EStubBot#0000' },
    guilds: { cache: guilds },
    channels: {
      fetch: async () => {
        throw new Error('Stub client: channels.fetch() is not implemented (not used by the tested routes)');
      },
    },
  };
}
