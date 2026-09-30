/**
 * The tournament setup form: the page `/bracket setup-link` points to, and the
 * API behind it. Kept out of server.js, which was already long.
 *
 * Every request carries the link's token (`?token=` for the page, the
 * `X-Setup-Token` header for the API) and is re-verified; the guild comes
 * from the token, never from the request. Title lookups go through
 * tournamentImport → bracketTitles, the same path `/bracket manage-titles`
 * uses. See tournamentImport.js for the format itself.
 */

import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionFlagsBits } from 'discord.js';
import { loadGuildConfig } from '../utils/guildConfig.js';
import { config } from '../config.js';
import * as bracketManager from '../utils/bracketManager.js';
import { fetchEntryById, searchTitleCandidates, buildEntryFromResult, TITLE_TYPES } from '../utils/bracketTitles.js';
import {
  parseImportFile, resolveRows, saveImportedTournament, buildExport,
  MAX_ROWS, GROUP_LETTERS,
} from '../utils/tournamentImport.js';
import { verifySetupToken } from '../utils/tournamentSetupLinkToken.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_DIR = path.join(__dirname, '../../public/tournament-setup');

// Entries the form has been shown, so saving doesn't look every title up a
// second time. Keyed by guild too, so one server's lookups never stand in
// for another's. An hour matches the link's lifetime.
const ENTRY_CACHE_TTL_MS = 60 * 60 * 1000;
const entryCache = new Map();

function cacheKey(guildId, type, id) {
  return `${guildId}:${type}:${id}`;
}

function remember(guildId, type, entry) {
  if (entry?.id == null) return;
  entryCache.set(cacheKey(guildId, type, entry.id), { entry, at: Date.now() });
}

function recall(guildId, type, id) {
  const hit = entryCache.get(cacheKey(guildId, type, id));
  if (!hit) return null;
  if (Date.now() - hit.at > ENTRY_CACHE_TTL_MS) {
    entryCache.delete(cacheKey(guildId, type, id));
    return null;
  }
  return hit.entry;
}

/** What the page needs to show a title — never the whole stored entry. */
function forPage(entry) {
  return {
    id: entry.id,
    title: entry.title,
    year: entry.year ? String(entry.year) : '',
    posterUrl: entry.customImageUrl || entry.posterUrl || null,
    overview: (entry.metadata?.overview || '').slice(0, 200),
  };
}

function isEditable(tournament) {
  return !tournament || ['setup', 'completed', 'cancelled'].includes(tournament.status);
}

/**
 * @param {express.Application} app
 * @param {import('discord.js').Client} client
 */
export function registerTournamentSetupRoutes(app, client) {
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: 'Too many requests. Please wait a minute and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.get('host') || 'unknown-host'}:${ipKeyGenerator(req.ip)}`,
  });

  // Scoped like /crop-assets: never a blanket mount of public/
  app.use('/tournament-setup-assets', express.static(PAGE_DIR));

  function requireToken(req, res, next) {
    const result = verifySetupToken(req.get('X-Setup-Token'));
    if (!result.valid) {
      const message = result.reason === 'expired'
        ? 'This setup link has expired. Run /bracket setup-link in Discord for a new one.'
        : 'This setup link is not valid. Run /bracket setup-link in Discord for a new one.';
      return res.status(403).json({ error: message });
    }
    req.setup = { guildId: result.guildId, userId: result.userId, exp: result.exp };
    next();
  }

  /**
   * A link outlives a role change, so saving re-checks the person can still
   * manage tournaments. Returns false only when we know they can't; if the
   * guild isn't reachable we fall back to the check done when the link was
   * issued.
   */
  async function canStillManage(guildId, userId) {
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) return true;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    return member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ModerateMembers);
  }

  app.get('/tournament-setup', async (req, res) => {
    const result = verifySetupToken(req.query.token);
    if (!result.valid) {
      return res.status(403).type('text/plain').send(
        result.reason === 'expired'
          ? 'This setup link has expired. Run /bracket setup-link in Discord for a new one.'
          : 'This setup link is not valid. Run /bracket setup-link in Discord for a new one.'
      );
    }
    try {
      const guildConfig = await loadGuildConfig(result.guildId);
      const theme = guildConfig.website?.theme || 'default';
      const html = await fs.readFile(path.join(PAGE_DIR, 'setup.html'), 'utf8');
      res.type('html').send(html.replace('/shared-assets/bootstrap.min.css', `/shared-assets/themes/${theme}/bootstrap.min.css`));
    } catch (error) {
      console.error('[TournamentSetup] Error serving themed page:', error);
      res.sendFile(path.join(PAGE_DIR, 'setup.html'));
    }
  });

  // The current tournament, if any, in the form's own shape
  app.get('/api/tournament-setup/state', limiter, requireToken, (req, res) => {
    const { guildId, exp } = req.setup;
    const tournament = bracketManager.loadTournament(guildId);
    const guild = client?.guilds?.cache?.get(guildId);
    const base = {
      guildName: guild?.name || null,
      docsUrl: config.docsUrl,
      linkExpiresAt: exp,
      types: TITLE_TYPES,
    };

    if (!tournament || tournament.status === 'completed' || tournament.status === 'cancelled') {
      return res.json({ ...base, tournament: null, editable: true });
    }

    const exported = buildExport(tournament);
    const stored = tournament.mode === 'bracket'
      ? tournament.titles || []
      : GROUP_LETTERS.slice(0, tournament.groupCount || 0).split('').flatMap(l => tournament.groups?.[l]?.movies || []);
    stored.forEach(entry => remember(guildId, tournament.type, entry));

    res.json({
      ...base,
      editable: isEditable(tournament),
      tournament: {
        name: tournament.name,
        status: tournament.status,
        settings: {
          name: exported.name,
          type: exported.type,
          seeding: exported.seeding,
          votingDuration: exported.votingDuration,
          tiebreakerDuration: exported.tiebreakerDuration,
          announcement: exported.announcement,
        },
        rows: exported.titles.map((t, i) => ({
          title: t.title,
          year: t.year ? String(t.year) : '',
          group: t.group || '',
          id: t.id != null ? String(t.id) : '',
          imageUrl: t.imageUrl || '',
          match: { status: 'matched', entry: forPage(stored[i] || t) },
        })),
      },
    });
  });

  // Read an uploaded file. The page sends the text; nothing is saved.
  app.post('/api/tournament-setup/parse', limiter, requireToken, (req, res) => {
    const text = req.body?.text;
    if (typeof text !== 'string') return res.status(400).json({ error: 'No file content was sent.' });
    res.json(parseImportFile(text));
  });

  // Match rows to titles
  app.post('/api/tournament-setup/resolve', limiter, requireToken, async (req, res) => {
    const { type, rows } = req.body || {};
    if (!TITLE_TYPES.includes(type)) return res.status(400).json({ error: 'Choose a type first.' });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'There are no rows to match.' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `A tournament holds at most ${MAX_ROWS} titles.` });

    const clean = rows.map(r => ({
      title: String(r?.title ?? '').trim(),
      year: String(r?.year ?? '').trim(),
      id: String(r?.id ?? '').trim(),
    }));
    const results = await resolveRows(type, clean);
    const { guildId } = req.setup;

    res.json({
      results: results.map(r => {
        if (r.status === 'matched') {
          remember(guildId, type, r.entry);
          return { status: 'matched', entry: forPage(r.entry) };
        }
        if (r.status === 'choose') {
          r.candidates.forEach(c => remember(guildId, type, c));
          return { status: 'choose', candidates: r.candidates.map(forPage) };
        }
        return r;
      }),
    });
  });

  // Search again for one row, after its title was edited on the page
  app.post('/api/tournament-setup/search', limiter, requireToken, async (req, res) => {
    const { type, query } = req.body || {};
    if (!TITLE_TYPES.includes(type)) return res.status(400).json({ error: 'Choose a type first.' });
    if (typeof query !== 'string' || !query.trim()) return res.status(400).json({ error: 'Type something to search for.' });
    try {
      const results = (await searchTitleCandidates(type, query.trim())).slice(0, 10).map(r => buildEntryFromResult(r, type));
      results.forEach(e => remember(req.setup.guildId, type, e));
      res.json({ candidates: results.map(forPage) });
    } catch (error) {
      console.error('[TournamentSetup] Search failed:', error.message);
      res.status(502).json({ error: 'The search failed. Try again in a moment.' });
    }
  });

  // Create the tournament, or replace one still in setup
  app.post('/api/tournament-setup/save', limiter, requireToken, async (req, res) => {
    const { guildId, userId } = req.setup;
    const { settings, rows } = req.body || {};
    if (!settings || typeof settings !== 'object') return res.status(400).json({ errors: [{ row: null, message: 'Settings are missing.' }] });
    if (!Array.isArray(rows)) return res.status(400).json({ errors: [{ row: null, message: 'Titles are missing.' }] });
    if (rows.length > MAX_ROWS) return res.status(400).json({ errors: [{ row: null, message: `A tournament holds at most ${MAX_ROWS} titles.` }] });

    if (!(await canStillManage(guildId, userId))) {
      return res.status(403).json({ errors: [{ row: null, message: 'Only administrators and moderators can set up tournaments.' }] });
    }

    const type = settings.type;
    if (!TITLE_TYPES.includes(type)) {
      return res.status(400).json({ errors: [{ row: null, field: 'type', message: 'Choose what the tournament is made of.' }] });
    }

    // Entries come from our own lookups, never from the page: the page sends ids
    const resolved = [];
    for (const r of rows) {
      const id = String(r?.id ?? '').trim();
      let entry = id ? recall(guildId, type, id) : null;
      if (!entry && id) {
        entry = await fetchEntryById(type, id).catch(() => null);
        if (entry) remember(guildId, type, entry);
      }
      resolved.push({
        entry: entry || null,
        group: String(r?.group ?? '').trim().toUpperCase(),
        imageUrl: String(r?.imageUrl ?? '').trim(),
      });
    }

    const result = saveImportedTournament(guildId, {
      settings: {
        name: typeof settings.name === 'string' ? settings.name : '',
        type,
        seeding: settings.seeding,
        votingDuration: settings.votingDuration || undefined,
        tiebreakerDuration: settings.tiebreakerDuration || undefined,
        announcement: settings.announcement,
      },
      rows: resolved,
      creatorId: userId,
    });

    if (!result.success) return res.status(400).json({ errors: result.errors });

    const t = result.tournament;
    console.log(`[TournamentSetup] ${userId} saved "${t.name}" for guild ${guildId} (${t.mode}, ${rows.length} titles)`);
    res.json({
      success: true,
      summary: {
        name: t.name,
        mode: t.mode,
        titleCount: rows.length,
        groupCount: t.mode === 'groups' ? t.groupCount : null,
      },
    });
  });

  // Backup: the tournament in the import format
  app.get('/api/tournament-setup/export', limiter, requireToken, (req, res) => {
    const tournament = bracketManager.loadTournament(req.setup.guildId);
    if (!tournament) return res.status(404).json({ error: 'There is no tournament to back up.' });
    const filename = `${tournament.name.replace(/[^\w-]+/g, '_').slice(0, 60) || 'tournament'}.json`;
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(buildExport(tournament));
  });
}
