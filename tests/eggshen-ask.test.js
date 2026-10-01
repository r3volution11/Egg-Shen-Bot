/**
 * /eggshen-ask: questions answered from the bot's own docs (docs/).
 *
 * Uses the real docs and the real command definitions; only OpenAI is
 * mocked. The command checker gets the most attention: it is what stops an
 * AI answer that names a command that doesn't exist from ever being shown,
 * and its first version missed commands in code blocks or quotes.
 *
 * Run with: npm test -- tests/eggshen-ask.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.DOCS_EMBEDDINGS_FILE = path.join(os.tmpdir(), `eggshen-ask-embeddings-${process.pid}.json`);

const mockAnswerFromDocs = jest.fn();
const mockEmbedTexts = jest.fn();
const mockIsOpenAIAvailable = jest.fn(() => true);

// Every command file is loaded (for the real command catalog), and several
// import other aiService functions — so stub every function it exports,
// read from the file itself, and override the ones these tests drive.
const aiServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/services/aiService.js'), 'utf8');
const aiServiceStubs = Object.fromEntries(
  [...aiServiceSource.matchAll(/export (?:async )?function (\w+)/g)].map(([, name]) => [name, jest.fn()])
);
jest.unstable_mockModule('../src/services/aiService.js', () => ({
  ...aiServiceStubs,
  answerFromDocs: mockAnswerFromDocs,
  embedTexts: mockEmbedTexts,
  isOpenAIAvailable: mockIsOpenAIAvailable,
  EMBEDDING_MODEL: 'test-embedding',
  EMBEDDING_DIMENSIONS: 8,
}));

let docsIndex;
let docsAnswer;
let ask;
let configAi;
let guildConfig;
let commands;

beforeAll(async () => {
  docsIndex = await import('../src/utils/docsIndex.js');
  docsAnswer = await import('../src/utils/docsAnswer.js');
  ask = await import('../src/commands/eggshen-ask.js');
  configAi = await import('../src/commands/eggshen-config-ai.js');
  guildConfig = await import('../src/utils/guildConfig.js');
  commands = [];
  for (const f of fs.readdirSync(path.join(process.cwd(), 'src/commands')).filter(f => f.endsWith('.js'))) {
    const m = await import(`../src/commands/${f}`);
    if (m.data) commands.push(m);
  }
});

/** A deterministic fake embedding: which of a few topic words the text mentions. */
const TOPICS = ['matchup', 'timer', 'spam', 'rate', 'watchlist', 'tournament', 'image', 'command'];
const fakeEmbed = (texts) => texts.map(t => TOPICS.map(w => (String(t).toLowerCase().includes(w) ? 1 : 0.01)));

beforeEach(() => {
  mockAnswerFromDocs.mockReset();
  mockEmbedTexts.mockReset().mockImplementation(async (texts) => fakeEmbed(texts));
  mockIsOpenAIAvailable.mockReset().mockReturnValue(true);
  docsIndex.resetDocsIndex();
  if (fs.existsSync(process.env.DOCS_EMBEDDINGS_FILE)) fs.unlinkSync(process.env.DOCS_EMBEDDINGS_FILE);
});

describe('the docs index', () => {
  test('covers the "using the bot" pages and leaves out the changelog and self-hosting', () => {
    const pages = new Set(docsIndex.getDocsIndex().sections.map(s => s.pageUrl.replace(/^https:\/\/[^/]+/, '')));
    for (const p of ['/guides/tournaments/faq.html', '/commands/watch-party.html', '/features/event-requests.html', '/commands/configuration.html']) {
      expect(pages).toContain(p);
    }
    // ask.html too: its example questions matched every question asked
    for (const p of ['/changelog.html', '/installation.html', '/api-keys.html', '/api/reference.html', '/commands/ask.html']) {
      expect(pages).not.toContain(p);
    }
  });

  test('FAQ entries and guide steps come from frontmatter, with working anchors', () => {
    const { sections } = docsIndex.getDocsIndex();
    const faq = sections.find(s => s.kind === 'faq' && s.heading === 'Why does my ballot show several matchups?');
    expect(faq.url).toMatch(/\/guides\/tournaments\/faq\.html#why-does-my-ballot-show-several-matchups$/);
    const steps = sections.find(s => s.kind === 'steps' && s.page === 'One Matchup at a Time');
    expect(steps.text).toContain('1. **Set up the tournament.**');
  });

  test('links inside the docs become full addresses for Discord', () => {
    const steps = docsIndex.getDocsIndex().sections.find(s => s.kind === 'steps' && s.page === 'One Matchup at a Time');
    expect(steps.text).toContain('](https://eggshenbot.com/commands/brackets/import.html)');
  });

  test('slugify matches VitePress heading anchors', () => {
    expect(docsIndex.slugify('/bracket open-matchup')).toBe('bracket-open-matchup');
    expect(docsIndex.slugify('1. Start a Watch Party Timer')).toBe('_1-start-a-watch-party-timer');
    expect(docsIndex.slugify("Why didn't the next round open?")).toBe('why-didn-t-the-next-round-open');
  });

  test('"stop people spamming" finds the spam protection docs, not /timer stop', () => {
    // The stemmer made it "spamm", and "stop" then matched the timer pages
    const top = docsIndex.searchDocs('how do I stop people spamming the bot')[0];
    expect(top.page).toMatch(/rate limit|moderation/i);
    // ...while stopping a timer still finds the timer
    expect(docsIndex.searchDocs('how do I stop the timer')[0].text).toContain('/timer stop');
  });

  test('a 16-team setup question finds an answer that gives both ways', () => {
    // It used to give only the commands: the FAQ mentioned the setup form in
    // passing, without /bracket setup-link, so the answer left it out
    const top = docsIndex.searchDocs('How do I set up a 16 team tournament?')[0];
    expect(top.heading).toBe('How do I set up a tournament with 16 titles?');
    expect(top.text).toContain('/bracket setup-link');
    expect(top.text).toContain('/bracket create');
  });

  test('"open a matchup with only 2 titles" finds the matchup answer, not tournament setup', () => {
    // A live answer read "2 titles" as a two-title tournament and gave setup steps
    const top = docsIndex.searchDocs('How do i Open a matchup with only 2 titles?')[0];
    expect(top.heading).toBe('How do I open a matchup with just two titles, one versus one?');
    expect(top.text).toContain('/bracket open matchups:1');
  });

  test('keyword search finds the right FAQ', () => {
    expect(docsIndex.searchDocs('why does my ballot show several matchups')[0].heading).toBe('Why does my ballot show several matchups?');
  });
});

describe('semantic search', () => {
  test('embeds each section once and caches it; later questions embed only the question', async () => {
    await docsIndex.searchDocsSemantic('start a matchup');
    const sectionCount = docsIndex.getDocsIndex().sections.length;
    expect(mockEmbedTexts.mock.calls[0][0]).toHaveLength(sectionCount);
    expect(Object.keys(JSON.parse(fs.readFileSync(process.env.DOCS_EMBEDDINGS_FILE, 'utf8')))).toHaveLength(sectionCount);

    docsIndex.resetDocsIndex(); // as after a restart: cache file, no memory
    mockEmbedTexts.mockClear();
    await docsIndex.searchDocsSemantic('pause the timer');
    expect(mockEmbedTexts).toHaveBeenCalledTimes(1);
    expect(mockEmbedTexts.mock.calls[0][0]).toEqual(['pause the timer']);
  });

  test('falls back to keyword search if embedding fails', async () => {
    mockEmbedTexts.mockResolvedValue(null);
    const results = await docsIndex.searchDocsSemantic('why does my ballot show several matchups');
    expect(results[0].heading).toBe('Why does my ballot show several matchups?');
  });
});

describe('the command checker', () => {
  let catalog;
  beforeAll(() => { catalog = docsAnswer.buildCommandCatalog(commands); });
  const check = (t) => docsAnswer.checkCommands(t, catalog);

  test('real commands pass, wherever and however they are written', () => {
    expect(check('Run `/bracket open matchups:1`.').unknown).toEqual([]);
    expect(check("Run `'/bracket create name:\"Cup\" max-titles:16'`.").unknown).toEqual([]);
    expect(check('```\n/timer start label:The Lord of the Rings duration:190\n```').unknown).toEqual([]);
    expect(check('Use /bracket to run tournaments, see [guide](/guides/tournaments/) or https://eggshenbot.com/commands/').unknown).toEqual([]);
    // A title with a colon is one value, not a "Rings" option (a real answer was dropped for this)
    expect(check('```\n/timer start label:The Lord of the Rings: The Fellowship of the Ring duration:190\n```').unknown).toEqual([]);
    // Placeholders, choice names as well as values, and punctuation after prose
    expect(check('`/eggshen-config commands toggle setting:<command> enabled:<true/false>`').unknown).toEqual([]);
    expect(check('`/eggshen-config commands toggle setting:Survey Command enabled:false`').unknown).toEqual([]);
    expect(check('Run /bracket open matchups:1, then again.').unknown).toEqual([]);
    // A quoted time is one value, not an option "8" (a real answer was dropped for this)
    expect(check('```\n/announce party title1:"Tales From the Crypt" time:"8:00 PM EST"\n```').unknown).toEqual([]);
    expect(check('Run `"/announce party title1:Jaws time:"8:00 PM""`').unknown).toEqual([]);
    // A closing quote that pairs up stays, or "one:" would be read as an option
    expect(check('```\n/timer start label:"part one: alien"\n```').unknown).toEqual([]);
    // A time in a sentence isn't an option either
    expect(check('Run /timer start label:Jaws at 8:30 tonight').unknown).toEqual([]);
  });

  test('a backslash for the slash is corrected, then checked like any other', () => {
    const fixed = docsAnswer.fixSlashes('1. Run `\\bracket open matchups:1`.\n2. Then `\\tournament go`, not C:\\bracket', catalog);
    expect(fixed).toBe('1. Run `/bracket open matchups:1`.\n2. Then `\\tournament go`, not C:\\bracket');
    // A space inside the backticks, as a live answer had
    expect(docsAnswer.fixSlashes('Run ` /bracket open-matchup` now', catalog)).toBe('Run `/bracket open-matchup` now');
    expect(check(fixed).unknown).toEqual([]);
  });

  test('a group on its own is a fine thing to name', () => {
    expect(check('Settings are under `/eggshen-config-watch-party rate-limit`.').unknown).toEqual([]);
    expect(check('`/eggshen-config-watch-party rate-limit bogus`').unknown).toHaveLength(1);
  });

  test('values are checked where the definition pins them down', () => {
    expect(check('`/bracket open matchups:9`').unknown).toHaveLength(1); // 1–5
    expect(check('`/bracket open matchups:two`').unknown).toHaveLength(1);
    expect(check('`/eggshen-config commands toggle setting:all enabled:true`').unknown).toHaveLength(1); // the master switch is "enabled"
    expect(check('`/eggshen-config commands toggle setting:movie enabled:yes`').unknown).toHaveLength(1);
    expect(check('`/timer start theme:retro`').unknown).toHaveLength(1);
    // Free text isn't second-guessed
    expect(check('`/bracket open-groups groups:A,B duration:2d`').unknown).toEqual([]);
  });

  test('the model sees option details for the commands the excerpts show', () => {
    const lines = docsAnswer.catalogLinesFor(catalog, [{ heading: 'Open groups', text: 'Run `/bracket open-groups groups:A,B`' }]);
    const at = lines.findIndex(l => l.startsWith('/bracket open-groups —'));
    expect(lines.slice(at + 1, at + 3)).toEqual([
      '    groups (required): Groups to open (e.g., "A,B,C,D")',
      expect.stringMatching(/^ {4}duration: /),
    ]);
    // Others stay one line each
    expect(lines).toContain(catalog.lines.find(l => l.startsWith('/timer start [')));
    expect(lines.some(l => l.startsWith('    theme:'))).toBe(false);
  });

  test('invented commands and options are caught, in code blocks and quotes too', () => {
    expect(check('```\n/bracket start-matchup title:Alien\n```').unknown).toHaveLength(1);
    expect(check('Run `/bracket open speed:fast`').unknown).toHaveLength(1);
    expect(check("Run `'/tournament start'`").unknown).toHaveLength(1);
    expect(check('Try /tournament-start now').unknown).toHaveLength(1);
    // Not in code, but a hyphenated subcommand claim all the same
    expect(check('Run /bracket start-matchup to begin').unknown).toHaveLength(1);
    // While a real one in prose is fine
    expect(check('Run /bracket open-matchup to pick one').unknown).toEqual([]);
  });

  test('the catalog comes from the live definitions', () => {
    expect(catalog.paths.get('/bracket open')).toEqual(new Set(['duration', 'matchups']));
    expect(catalog.paths.has('/eggshen-ask')).toBe(true);
    expect(catalog.paths.has('/eggshen-config-ai ai-ask feature-toggle')).toBe(true);
  });

  test('admin-only commands are recognised', () => {
    const subs = { bracket: ['open', 'create'] };
    expect(docsAnswer.needsAdmin('Run `/bracket open matchups:1`', subs)).toBe(true);
    expect(docsAnswer.needsAdmin('Run `/eggshen-config commands toggle`', subs)).toBe(true);
    expect(docsAnswer.needsAdmin('Run `/bracket status`', subs)).toBe(false);
  });
});

describe('answers', () => {
  const askIt = (question, { config = {}, isManager = false } = {}) =>
    docsAnswer.answerQuestion({ question, guildConfig: config, commands, isManager, adminSubcommands: { bracket: ['open'] } });

  test('AI on: a valid answer is used, linked to the docs that show its command', async () => {
    mockAnswerFromDocs.mockResolvedValue({ text: 'Run `/bracket open matchups:1`, then run it again for the next one.', sources: [] });
    const r = await askIt('I want to start a matchup between two titles');
    expect(r.mode).toBe('ai');
    expect(r.answer).toContain('/bracket open matchups:1');
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.sources.join(' ')).toMatch(/eggshenbot\.com/);
    expect(r.adminNote).toBe(true);
    // ...and the model was shown /bracket open's options in full
    expect(mockAnswerFromDocs.mock.calls[0][0].catalogLines).toContain('    matchups: Knockout: open just the next N matchups, in order (1 = one at a time) 1–5.');
  });

  test('an AI answer written with backslashes is shown with slashes', async () => {
    mockAnswerFromDocs.mockResolvedValue({ text: 'Run `\\bracket open matchups:1`.', sources: [] });
    const r = await askIt('I want to start a matchup between two titles');
    expect(r.mode).toBe('ai');
    expect(r.answer).toBe('Run `/bracket open matchups:1`.');
  });

  test('an AI answer naming a command that does not exist is never shown', async () => {
    mockAnswerFromDocs.mockResolvedValue({ text: 'Run `/bracket start-matchup` to begin.', sources: [1] });
    const r = await askIt('why does my ballot show several matchups');
    expect(r.mode).toBe('search');
    expect(r.answer).not.toContain('start-matchup');
    expect(r.answer).toContain('separate head-to-head vote');
  });

  test('when the docs do not cover it, it says so and links the docs home, not unrelated pages', async () => {
    mockAnswerFromDocs.mockResolvedValue({ notCovered: true });
    const r = await askIt('what is the weather tomorrow');
    expect(r.mode).toBe('none');
    expect(r.sources).toEqual([]);
    expect(r.answer).toContain("couldn't find that in the docs");
  });

  test('with the server switch off, no AI is used: the best docs section is shown as written', async () => {
    const r = await askIt('why does my ballot show several matchups', { config: { aiAsk: { enabled: false } } });
    expect(mockAnswerFromDocs).not.toHaveBeenCalled();
    expect(mockEmbedTexts).not.toHaveBeenCalled();
    expect(r.mode).toBe('search');
    expect(r.answer).toContain('separate head-to-head vote');
  });

  test('without an API key, same as switched off', async () => {
    mockIsOpenAIAvailable.mockReturnValue(false);
    const r = await askIt('how do I see how much time is left');
    expect(mockAnswerFromDocs).not.toHaveBeenCalled();
    expect(r.mode).toBe('search');
  });

  test('admins and mods are not told they need an admin', async () => {
    mockAnswerFromDocs.mockResolvedValue({ text: 'Run `/bracket open matchups:1`.', sources: [] });
    const r = await askIt('start a matchup', { isManager: true });
    expect(r.adminNote).toBe(false);
  });
});

describe('/eggshen-ask', () => {
  function interaction({ question = 'why does my ballot show several matchups', isPublic = null, admin = false } = {}) {
    return {
      guildId: 'eggshen-ask-guild',
      member: { permissions: { has: () => admin } },
      client: { commands: new Map(commands.map(c => [c.data.name, c])) },
      options: {
        getString: (n) => (n === 'question' ? question : null),
        getBoolean: (n) => (n === 'public' ? isPublic : null),
      },
      deferred: false,
      replied: false,
      deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
      editReply: jest.fn().mockResolvedValue(undefined),
      deleteReply: jest.fn().mockResolvedValue(undefined),
      channel: { send: jest.fn().mockResolvedValue({ id: 'm' }) },
    };
  }

  test('answers privately by default', async () => {
    mockAnswerFromDocs.mockResolvedValue({ text: 'Each row is its own vote. Run `/bracket open matchups:1` to show one.', sources: [] });
    const i = interaction();
    await ask.execute(i);

    expect(i.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(i.channel.send).not.toHaveBeenCalled();
    const embed = i.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.title).toBe('🤔 why does my ballot show several matchups');
    expect(embed.description).toContain('/bracket open matchups:1');
    expect(embed.description).toContain('🔒 Some of this needs an administrator or moderator.');
    expect(embed.fields[0].name).toBe('📖 From the docs');
  });

  test('public:true posts it in the channel', async () => {
    mockAnswerFromDocs.mockResolvedValue({ text: 'Run `/bracket status`.', sources: [] });
    const i = interaction({ isPublic: true });
    await ask.execute(i);

    expect(i.channel.send).toHaveBeenCalledTimes(1);
    expect(i.channel.send.mock.calls[0][0].embeds[0].toJSON().description).toContain('/bracket status');
  });
});

describe('/eggshen-config-ai ai-ask', () => {
  function adminInteraction(sub, enabled) {
    return {
      guildId: 'eggshen-ask-config-guild',
      member: { permissions: { has: () => true } },
      options: {
        getSubcommandGroup: () => 'ai-ask',
        getSubcommand: () => sub,
        getBoolean: () => enabled,
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };
  }

  test('the switch is saved per server and defaults to on', async () => {
    expect(guildConfig.getAiAskEnabled({})).toBe(true);
    await configAi.execute(adminInteraction('feature-toggle', false));
    const saved = await guildConfig.loadGuildConfig('eggshen-ask-config-guild');
    expect(saved.aiAsk.enabled).toBe(false);
    expect(guildConfig.getAiAskEnabled(saved)).toBe(false);
  });

  test('it is separate from AI announcement text', async () => {
    await configAi.execute(adminInteraction('feature-toggle', false));
    const saved = await guildConfig.loadGuildConfig('eggshen-ask-config-guild');
    expect(guildConfig.getAiTextEnabled(saved)).toBe(true);
  });
});
