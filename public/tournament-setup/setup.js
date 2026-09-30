// Tournament setup form. Reached from `/bracket setup-link`; the link's token
// authorises every request. The page only holds the draft — the server checks
// everything again on save and builds the tournament through the same code
// `/bracket manage-titles` uses. See src/api/tournamentSetupRoutes.js.

const token = new URLSearchParams(location.search).get('token') || '';

const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('');
const TYPE_LABELS = { movie: 'movies', tv: 'TV shows', game: 'video games', boardgame: 'board games', book: 'books' };

const state = {
    docsUrl: 'https://eggshenbot.com',
    editable: true,
    existing: null, // the saved tournament's rows, to show what a save replaces
    rows: [],
    nextKey: 1,
};

const $ = (id) => document.getElementById(id);
const els = {
    page: $('page-message'), loading: $('loading'), setup: $('setup'),
    guild: $('guild-name'), expiry: $('link-expiry'),
    type: $('type'), file: $('file'), fileErrors: $('file-errors'),
    shape: $('shape'), rows: $('rows'), emptyRows: $('empty-rows'),
    addRow: $('add-row'), find: $('find-matches'),
    name: $('name'), voting: $('voting-duration'), tiebreaker: $('tiebreaker-duration'),
    message: $('announcement-message'), banner: $('announcement-image'),
    save: $('save'), backup: $('backup'), saveErrors: $('save-errors'), saved: $('saved'),
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
        if (child !== null && child !== undefined) node.append(child);
    }
    return node;
}

function showPageMessage(text, kind = 'info') {
    els.page.textContent = text;
    els.page.className = `alert alert-${kind}`;
    els.page.style.display = text ? 'block' : 'none';
}

async function api(method, path, body) {
    const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Setup-Token': token },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await response.json(); } catch { /* empty body */ }
    if (!response.ok && response.status === 403) {
        throw Object.assign(new Error(data.error || data.errors?.[0]?.message || 'This link is no longer valid.'), { fatal: true });
    }
    return { ok: response.ok, status: response.status, data };
}

function newRow(values = {}) {
    return {
        key: state.nextKey++,
        title: values.title || '',
        year: values.year ? String(values.year) : '',
        group: values.group || '',
        id: values.id ? String(values.id) : '',
        imageUrl: values.imageUrl || '',
        match: values.match || null,
        chosenId: '',
        error: values.error || '',
    };
}

/** The id a row will be saved with, or '' if it isn't settled yet. */
function rowId(row) {
    if (row.match?.status === 'matched') return String(row.match.entry.id);
    if (row.match?.status === 'choose') return row.chosenId;
    return '';
}

function docsLink(anchor) {
    return `${state.docsUrl}/commands/brackets/import${anchor ? `#${anchor}` : ''}`;
}

// ─── rendering ────────────────────────────────────────────────────────────────

/** A plain-words summary of what the rows add up to. The server has the final say. */
function describeShape() {
    const n = state.rows.length;
    if (n === 0) return '';
    const grouped = state.rows.some(r => r.group);
    if (!grouped) {
        const size = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(n, 1))));
        if (n > 32) return `Straight bracket · ${n} titles — too many (32 at most). Give titles group letters to make a groups tournament.`;
        if (n < 2) return 'Straight bracket · needs at least 2 titles.';
        const byes = size - n;
        return `Straight bracket · ${n} titles · ${size}-slot bracket${byes ? `, ${byes} bye${byes === 1 ? '' : 's'}` : ''}`;
    }
    const highest = Math.max(...state.rows.map(r => GROUP_LETTERS.indexOf(r.group)));
    const groups = Math.max(highest + 1, Math.ceil(n / 4));
    return `Groups tournament · ${n} titles · ${groups} group${groups === 1 ? '' : 's'} of 4 (needs ${groups * 4})`;
}

function renderMatch(row) {
    const m = row.match;
    if (!m) {
        return el('span', { class: 'text-secondary small', text: row.title || row.id ? 'Not searched yet' : '' });
    }
    if (m.status === 'matched') {
        const e = m.entry;
        return el('div', { class: 'd-flex gap-2 align-items-center' },
            e.posterUrl ? el('img', { class: 'match-poster', src: e.posterUrl, alt: '', loading: 'lazy' }) : el('span', { class: 'match-poster' }),
            el('div', { class: 'small' },
                el('div', { class: 'fw-semibold', text: e.title }),
                el('div', { class: 'text-secondary', text: e.year || '' })));
    }
    if (m.status === 'choose') {
        const select = el('select', {
            class: 'form-select form-select-sm',
            'aria-label': `Which ${row.title} do you mean?`,
            disabled: !state.editable,
            onchange: (ev) => { row.chosenId = ev.target.value; row.error = ''; render(); },
        },
        el('option', { value: '', text: `Pick one of ${m.candidates.length}…` }),
        m.candidates.map(c => el('option', { value: String(c.id), selected: String(c.id) === row.chosenId, text: `${c.title}${c.year ? ` (${c.year})` : ''}` })));
        const chosen = m.candidates.find(c => String(c.id) === row.chosenId);
        return el('div', {},
            select,
            chosen?.overview ? el('div', { class: 'text-secondary row-message mt-1', text: chosen.overview }) : null);
    }
    if (m.status === 'none') {
        return el('span', { class: 'text-warning small', text: 'Nothing found. Check the spelling or remove the year, then Find matches.' });
    }
    return el('span', { class: 'text-danger small', text: m.message || 'The search failed.' });
}

function renderRow(row, index) {
    const disabled = !state.editable;
    const matchCell = el('td', { class: 'col-match' }, renderMatch(row));
    const errorNode = row.error ? el('div', { class: 'text-danger row-message mt-1', text: row.error }) : null;
    let tr;

    // Update just this row, as the user types. Re-rendering the table on blur
    // instead shrank it (the error line went) exactly as "Find matches" was
    // pressed, so the button moved out from under the click and nothing ran.
    const markEdited = () => {
        row.match = null;
        row.chosenId = '';
        row.error = '';
        tr.classList.remove('row-error');
        errorNode?.remove();
        matchCell.replaceChildren(renderMatch(row));
        renderShapeOnly();
    };

    const title = el('input', {
        class: 'form-control form-control-sm', value: row.title, disabled, placeholder: 'Title',
        'aria-label': `Title ${index + 1}`,
        // Editing the title means a different search, so drop the pinned id too
        oninput: (ev) => { row.title = ev.target.value; row.id = ''; markEdited(); },
    });
    const image = el('input', {
        class: 'form-control form-control-sm row-image-url mt-1', value: row.imageUrl, disabled,
        placeholder: 'Custom image link (optional)', 'aria-label': `Custom image for title ${index + 1}`,
        oninput: (ev) => { row.imageUrl = ev.target.value.trim(); },
    });
    const year = el('input', {
        class: 'form-control form-control-sm', value: row.year, disabled, inputmode: 'numeric', maxlength: '4', placeholder: 'Year',
        'aria-label': `Year for title ${index + 1}`,
        oninput: (ev) => { row.year = ev.target.value.trim(); row.id = ''; markEdited(); },
    });
    const group = el('select', {
        class: 'form-select form-select-sm', disabled, 'aria-label': `Group for title ${index + 1}`,
        onchange: (ev) => { row.group = ev.target.value; row.error = ''; render(); },
    },
    el('option', { value: '', text: '—' }),
    GROUP_LETTERS.map(l => el('option', { value: l, selected: row.group === l, text: l })));

    const move = (delta) => {
        const to = index + delta;
        if (to < 0 || to >= state.rows.length) return;
        [state.rows[index], state.rows[to]] = [state.rows[to], state.rows[index]];
        render();
    };
    const actions = el('div', { class: 'btn-group btn-group-sm' },
        el('button', { type: 'button', class: 'btn btn-outline-secondary', disabled: disabled || index === 0, title: 'Move up', 'aria-label': `Move title ${index + 1} up`, onclick: () => move(-1), text: '↑' }),
        el('button', { type: 'button', class: 'btn btn-outline-secondary', disabled: disabled || index === state.rows.length - 1, title: 'Move down', 'aria-label': `Move title ${index + 1} down`, onclick: () => move(1), text: '↓' }),
        el('button', { type: 'button', class: 'btn btn-outline-danger', disabled, title: 'Remove', 'aria-label': `Remove title ${index + 1}`, onclick: () => { state.rows.splice(index, 1); render(); }, text: '✕' }));

    tr = el('tr', { class: row.error ? 'row-error' : '' },
        el('td', { class: 'col-num', text: String(index + 1) }),
        el('td', {}, title, image, errorNode),
        el('td', { class: 'col-year' }, year),
        el('td', { class: 'col-group' }, group),
        matchCell,
        el('td', { class: 'col-actions' }, actions));
    return tr;
}

function renderShapeOnly() {
    els.shape.textContent = describeShape();
}

function render() {
    els.rows.replaceChildren(...state.rows.map(renderRow));
    els.emptyRows.style.display = state.rows.length ? 'none' : 'block';
    renderShapeOnly();
    for (const input of [els.type, els.file, els.name, els.voting, els.tiebreaker, els.message, els.banner, els.addRow, els.find, els.save]) {
        input.disabled = !state.editable;
    }
    document.querySelectorAll('input[name="seeding"]').forEach(r => { r.disabled = !state.editable; });
}

function showErrors(list) {
    els.saveErrors.replaceChildren(...list.map(e => el('li', { text: e.message })));
    els.saveErrors.style.display = list.length ? 'block' : 'none';
    state.rows.forEach(r => { r.error = ''; });
    for (const e of list) {
        if (e.row && state.rows[e.row - 1]) state.rows[e.row - 1].error = e.message;
    }
    render();
    if (list.length) els.saveErrors.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── settings ─────────────────────────────────────────────────────────────────

function applySettings(settings = {}) {
    if (settings.name !== undefined) els.name.value = settings.name;
    if (settings.type) els.type.value = settings.type;
    if (settings.seeding) {
        const radio = document.querySelector(`input[name="seeding"][value="${settings.seeding === 'ordered' ? 'ordered' : 'random'}"]`);
        if (radio) radio.checked = true;
    }
    if (settings.votingDuration !== undefined) els.voting.value = settings.votingDuration;
    if (settings.tiebreakerDuration !== undefined) els.tiebreaker.value = settings.tiebreakerDuration;
    if (settings.announcement) {
        els.message.value = settings.announcement.message || '';
        els.banner.value = settings.announcement.imageUrl || '';
    }
}

function readSettings() {
    return {
        name: els.name.value.trim(),
        type: els.type.value,
        seeding: document.querySelector('input[name="seeding"]:checked')?.value || 'random',
        votingDuration: els.voting.value.trim(),
        tiebreakerDuration: els.tiebreaker.value.trim(),
        announcement: { message: els.message.value.trim(), imageUrl: els.banner.value.trim() },
    };
}

// ─── actions ──────────────────────────────────────────────────────────────────

/** Search for every row that isn't settled, through the bot's own search. */
async function findMatches() {
    const type = els.type.value;
    if (!type) {
        showPageMessage('Choose a type first, so the right database is searched.', 'warning');
        els.type.focus();
        return;
    }
    const pending = state.rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => (row.title || row.id) && (!row.match || row.match.status === 'none' || row.match.status === 'error'));
    if (pending.length === 0) {
        showPageMessage('Every title with a name already has a match.', 'info');
        return;
    }

    els.find.disabled = true;
    els.find.textContent = `Searching ${pending.length}…`;
    showPageMessage('');
    try {
        const { ok, data } = await api('POST', '/api/tournament-setup/resolve', {
            type,
            rows: pending.map(({ row }) => ({ title: row.title, year: row.year, id: row.id })),
        });
        if (!ok) {
            showPageMessage(data.error || 'The search failed. Try again.', 'danger');
            return;
        }
        data.results.forEach((result, i) => {
            const row = pending[i].row;
            row.match = result;
            row.chosenId = '';
            row.error = '';
        });
        const toPick = state.rows.filter(r => r.match?.status === 'choose').length;
        const missing = state.rows.filter(r => r.match && (r.match.status === 'none' || r.match.status === 'error')).length;
        const notes = [];
        if (toPick) notes.push(`${toPick} title${toPick === 1 ? ' has' : 's have'} several matches — pick the right one.`);
        if (missing) notes.push(`${missing} couldn't be found — edit them and search again.`);
        showPageMessage(notes.join(' ') || 'Every title is matched.', notes.length ? 'warning' : 'success');
    } catch (error) {
        showPageMessage(error.message, 'danger');
    } finally {
        els.find.textContent = 'Find matches';
        els.find.disabled = !state.editable;
        render();
    }
}

async function loadFile(file) {
    els.fileErrors.replaceChildren();
    const text = await file.text();
    let result;
    try {
        result = await api('POST', '/api/tournament-setup/parse', { text });
    } catch (error) {
        showPageMessage(error.message, 'danger');
        return;
    }
    const { settings = {}, rows = [], errors = [] } = result.data;

    const fileLevel = errors.filter(e => !e.row);
    els.fileErrors.replaceChildren(...fileLevel.map(e => el('li', { text: e.message })));
    if (rows.length === 0 && fileLevel.length) return;

    const typeBefore = els.type.value;
    applySettings(settings);
    state.rows = rows.map((r, i) => newRow({
        ...r,
        error: errors.filter(e => e.row === i + 1).map(e => e.message).join(' '),
    }));
    render();
    showPageMessage(`Loaded ${rows.length} title${rows.length === 1 ? '' : 's'} from ${file.name}.`, 'success');

    if (els.type.value) {
        await findMatches();
    } else if (!typeBefore) {
        showPageMessage(`Loaded ${rows.length} titles. Choose a type, then press Find matches.`, 'warning');
    }
}

async function save() {
    showErrors([]);
    els.saved.style.display = 'none';
    const settings = readSettings();

    const local = [];
    if (!settings.type) local.push({ message: 'Choose a type.' });
    if (!settings.name) local.push({ message: 'Give the tournament a name.' });
    state.rows.forEach((row, i) => {
        if (!row.match) local.push({ row: i + 1, message: `Row ${i + 1} hasn't been searched yet. Press Find matches.` });
        else if (row.match.status === 'choose' && !row.chosenId) local.push({ row: i + 1, message: `Row ${i + 1}: pick which "${row.title}" you mean.` });
        else if (!rowId(row)) local.push({ row: i + 1, message: `Row ${i + 1} has no match. Edit it and press Find matches, or remove it.` });
    });
    if (local.length) {
        showErrors(local);
        return;
    }

    // Saving replaces the current lineup — say exactly what goes
    if (state.existing?.length) {
        const kept = new Set(state.rows.map(rowId));
        const dropped = state.existing.filter(r => !kept.has(r.id));
        const lines = dropped.slice(0, 10).map(r => `• ${r.title}${r.year ? ` (${r.year})` : ''}`);
        const more = dropped.length > 10 ? `\n…and ${dropped.length - 10} more` : '';
        const message = dropped.length
            ? `This replaces the current lineup. These ${dropped.length} title${dropped.length === 1 ? '' : 's'} will be removed:\n\n${lines.join('\n')}${more}\n\nSave anyway?`
            : 'This replaces the current lineup and settings. Save?';
        if (!window.confirm(message)) return;
    }

    els.save.disabled = true;
    try {
        const { ok, data } = await api('POST', '/api/tournament-setup/save', {
            settings,
            rows: state.rows.map(row => ({ id: rowId(row), group: row.group, imageUrl: row.imageUrl })),
        });
        if (!ok) {
            showErrors(data.errors || [{ message: data.error || 'Saving failed.' }]);
            return;
        }
        const s = data.summary;
        els.saved.replaceChildren(
            el('strong', { text: `Saved "${s.name}".` }),
            document.createTextNode(` ${s.titleCount} titles, ${s.mode === 'groups' ? `${s.groupCount} groups` : 'straight bracket'}. `),
            document.createTextNode('Next, in Discord: '),
            el('code', { text: '/bracket announce' }),
            document.createTextNode(' to tell everyone, then '),
            el('code', { text: '/bracket open' }),
            document.createTextNode(' to start voting. You can keep editing here until then.'));
        els.saved.style.display = 'block';
        await loadState({ keepMessage: true });
    } catch (error) {
        showErrors([{ message: error.message }]);
    } finally {
        els.save.disabled = !state.editable;
    }
}

async function downloadBackup() {
    const response = await fetch('/api/tournament-setup/export', { headers: { 'X-Setup-Token': token } });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showPageMessage(data.error || 'The backup could not be downloaded.', 'danger');
        return;
    }
    const blob = await response.blob();
    const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'tournament.json';
    const link = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
}

// ─── loading ──────────────────────────────────────────────────────────────────

async function loadState({ keepMessage = false } = {}) {
    const { ok, data } = await api('GET', '/api/tournament-setup/state');
    if (!ok) throw new Error(data.error || 'The form could not be loaded.');

    state.docsUrl = data.docsUrl || state.docsUrl;
    state.editable = data.editable;
    els.guild.textContent = data.guildName ? `${data.guildName} · ` : '';
    els.expiry.textContent = `This link works until ${new Date(data.linkExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;

    document.querySelectorAll('.docs-link').forEach(a => { a.href = docsLink(a.dataset.anchor); });
    document.querySelectorAll('.template-link').forEach(a => {
        a.href = `${state.docsUrl}/templates/tournaments/${a.dataset.file}`;
        a.setAttribute('download', a.dataset.file);
    });

    if (data.tournament) {
        applySettings(data.tournament.settings);
        state.rows = data.tournament.rows.map(r => newRow(r));
        state.existing = data.tournament.rows.map(r => ({ id: String(r.match.entry.id), title: r.title, year: r.year }));
        els.save.textContent = 'Save changes';
        els.backup.style.display = 'inline-block';
        if (!keepMessage) {
            showPageMessage(state.editable
                ? `Editing "${data.tournament.name}". Changes replace its current lineup when you save.`
                : `"${data.tournament.name}" has started voting, so it can't be changed here. You can still download a backup.`,
                state.editable ? 'info' : 'warning');
        }
    } else {
        state.existing = null;
        els.save.textContent = 'Create tournament';
        els.backup.style.display = 'none';
    }
    render();
}

els.addRow.addEventListener('click', () => {
    state.rows.push(newRow());
    render();
    els.rows.lastElementChild?.querySelector('input')?.focus();
});
els.find.addEventListener('click', findMatches);
els.save.addEventListener('click', save);
els.backup.addEventListener('click', downloadBackup);
els.file.addEventListener('change', () => {
    const file = els.file.files?.[0];
    if (file) loadFile(file).finally(() => { els.file.value = ''; });
});
els.type.addEventListener('change', () => {
    // A different type means a different database: every match is void
    if (state.rows.some(r => r.match)) {
        state.rows.forEach(r => { r.match = null; r.chosenId = ''; r.id = ''; });
        render();
        if (els.type.value) findMatches();
    }
});

(async () => {
    if (!token) {
        els.loading.style.display = 'none';
        showPageMessage('This page needs the link from /bracket setup-link in Discord.', 'danger');
        return;
    }
    try {
        await loadState();
        els.loading.style.display = 'none';
        els.setup.style.display = 'block';
    } catch (error) {
        els.loading.style.display = 'none';
        showPageMessage(error.message, 'danger');
    }
})();
