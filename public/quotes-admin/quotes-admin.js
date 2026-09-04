// Not persisted (no localStorage) — re-entered each visit, so the secret
// doesn't sit around in browser storage.
let adminSecret = null;

const unlockSection = document.getElementById('unlock-section');
const editorSection = document.getElementById('editor-section');
const adminSecretInput = document.getElementById('admin-secret');
const unlockBtn = document.getElementById('unlock-btn');
const unlockMessage = document.getElementById('unlock-message');

const tabBtns = document.querySelectorAll('.tab-btn');
const liveTab = document.getElementById('live-tab');
const pendingTab = document.getElementById('pending-tab');
const pendingCountBadge = document.getElementById('pending-count');

const modeRowsBtn = document.getElementById('mode-rows-btn');
const modeBulkBtn = document.getElementById('mode-bulk-btn');
const rowMode = document.getElementById('row-mode');
const bulkMode = document.getElementById('bulk-mode');

const quoteList = document.getElementById('quote-list');
const emptyState = document.getElementById('empty-state');
const editorMessage = document.getElementById('editor-message');
const newQuoteTitle = document.getElementById('new-quote-title');
const newQuoteText = document.getElementById('new-quote-text');
const newQuoteAuthor = document.getElementById('new-quote-author');
const addQuoteBtn = document.getElementById('add-quote-btn');

const bulkTextarea = document.getElementById('bulk-textarea');
const bulkErrors = document.getElementById('bulk-errors');
const bulkSaveBtn = document.getElementById('bulk-save-btn');

const pendingList = document.getElementById('pending-list');
const pendingEmptyState = document.getElementById('pending-empty-state');
const pendingMessage = document.getElementById('pending-message');

function showMessage(el, text, type) {
    el.textContent = text;
    el.className = `message ${type}`;
    el.style.display = 'block';
}

function hideMessage(el) {
    el.style.display = 'none';
}

async function apiRequest(method, path, body) {
    const response = await fetch(path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminSecret}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`Request failed (server returned ${response.status}).`);
    }

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

// --- Tabs ---

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        liveTab.style.display = tab === 'live' ? 'block' : 'none';
        pendingTab.style.display = tab === 'pending' ? 'block' : 'none';
    });
});

// --- Row/Bulk mode toggle ---

modeRowsBtn.addEventListener('click', () => {
    modeRowsBtn.classList.add('active');
    modeBulkBtn.classList.remove('active');
    rowMode.style.display = 'block';
    bulkMode.style.display = 'none';
});

modeBulkBtn.addEventListener('click', () => {
    modeBulkBtn.classList.add('active');
    modeRowsBtn.classList.remove('active');
    rowMode.style.display = 'none';
    bulkMode.style.display = 'block';
    hideMessage(bulkErrors);
    loadAndRenderQuotes().then(populateBulkTextarea).catch(() => {});
});

// --- Live quote list (row editor) ---

function renderQuotes(quotes) {
    quoteList.innerHTML = '';
    emptyState.style.display = quotes.length === 0 ? 'block' : 'none';

    quotes.forEach((quote, index) => {
        const li = document.createElement('li');
        li.className = 'quote-row';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'field-title';
        titleInput.placeholder = 'Title';
        titleInput.value = quote.title || '';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'field-text';
        textInput.placeholder = 'Quote text';
        textInput.value = quote.text;

        const authorInput = document.createElement('input');
        authorInput.type = 'text';
        authorInput.className = 'field-author';
        authorInput.placeholder = 'Author';
        authorInput.value = quote.author || '';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async () => {
            const text = textInput.value.trim();
            if (!text) {
                showMessage(editorMessage, "❌ A quote's text can't be empty.", 'error');
                return;
            }
            try {
                const { quotes: updated } = await apiRequest('PUT', `/api/quotes/${index}`, {
                    title: titleInput.value.trim(),
                    text,
                    author: authorInput.value.trim(),
                });
                renderQuotes(updated);
                showMessage(editorMessage, '✅ Saved.', 'success');
            } catch (error) {
                showMessage(editorMessage, `❌ ${error.message}`, 'error');
            }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
            try {
                const { quotes: updated } = await apiRequest('DELETE', `/api/quotes/${index}`);
                renderQuotes(updated);
                showMessage(editorMessage, '✅ Deleted.', 'success');
            } catch (error) {
                showMessage(editorMessage, `❌ ${error.message}`, 'error');
            }
        });

        li.appendChild(titleInput);
        li.appendChild(textInput);
        li.appendChild(authorInput);
        li.appendChild(saveBtn);
        li.appendChild(deleteBtn);
        quoteList.appendChild(li);
    });
}

let currentQuotes = [];

async function loadAndRenderQuotes() {
    const { quotes } = await apiRequest('GET', '/api/quotes');
    currentQuotes = quotes;
    renderQuotes(quotes);
    return quotes;
}

addQuoteBtn.addEventListener('click', async () => {
    const text = newQuoteText.value.trim();
    if (!text) {
        showMessage(editorMessage, '❌ Enter some quote text first.', 'error');
        return;
    }

    addQuoteBtn.disabled = true;
    try {
        const { quotes } = await apiRequest('POST', '/api/quotes', {
            title: newQuoteTitle.value.trim(),
            text,
            author: newQuoteAuthor.value.trim(),
        });
        currentQuotes = quotes;
        renderQuotes(quotes);
        newQuoteTitle.value = '';
        newQuoteText.value = '';
        newQuoteAuthor.value = '';
        showMessage(editorMessage, '✅ Added.', 'success');
    } catch (error) {
        showMessage(editorMessage, `❌ ${error.message}`, 'error');
    } finally {
        addQuoteBtn.disabled = false;
    }
});

// --- Bulk editor ---
//
// One quote per line: Title | Quote | Author (Title/Author may be blank).
// A literal "|" inside a field isn't supported by this simple format —
// acceptable for short status-line quotes/titles/names.

function escapeBulkField(value) {
    return (value || '').replace(/\|/g, '/').replace(/\n/g, ' ').trim();
}

function populateBulkTextarea() {
    bulkTextarea.value = currentQuotes
        .map(q => `${escapeBulkField(q.title)} | ${escapeBulkField(q.text)} | ${escapeBulkField(q.author)}`)
        .join('\n');
}

function parseBulkTextarea(raw) {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const quotes = [];
    const errors = [];

    lines.forEach((line, i) => {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length !== 3) {
            errors.push(`Line ${i + 1}: expected "Title | Quote | Author" (found ${parts.length} field(s)).`);
            return;
        }
        const [title, text, author] = parts;
        if (!text) {
            errors.push(`Line ${i + 1}: quote text can't be empty.`);
            return;
        }
        quotes.push({ title: title || undefined, text, author: author || undefined });
    });

    return { quotes, errors };
}

bulkSaveBtn.addEventListener('click', async () => {
    hideMessage(bulkErrors);
    const { quotes, errors } = parseBulkTextarea(bulkTextarea.value);

    if (errors.length > 0) {
        showMessage(bulkErrors, errors.join('\n'), 'error');
        return;
    }

    bulkSaveBtn.disabled = true;
    try {
        const { quotes: saved } = await apiRequest('PUT', '/api/quotes/bulk', { quotes });
        currentQuotes = saved;
        renderQuotes(saved);
        populateBulkTextarea();
        showMessage(editorMessage, `✅ Saved ${saved.length} quote(s).`, 'success');
    } catch (error) {
        showMessage(bulkErrors, `❌ ${error.message}`, 'error');
    } finally {
        bulkSaveBtn.disabled = false;
    }
});

// --- Pending suggestions ---

function renderPending(pending) {
    pendingList.innerHTML = '';
    pendingEmptyState.style.display = pending.length === 0 ? 'block' : 'none';
    pendingCountBadge.style.display = pending.length > 0 ? 'inline-block' : 'none';
    pendingCountBadge.textContent = pending.length;

    pending.forEach((suggestion) => {
        const li = document.createElement('li');
        li.className = 'pending-row';

        const textEl = document.createElement('div');
        textEl.className = 'pending-text';
        textEl.textContent = `"${suggestion.text}"`;

        const metaParts = [];
        if (suggestion.title) metaParts.push(suggestion.title);
        if (suggestion.author) metaParts.push(`— ${suggestion.author}`);
        metaParts.push(`suggested by ${suggestion.suggestedBy || 'unknown'}`);
        const metaEl = document.createElement('div');
        metaEl.className = 'pending-meta';
        metaEl.textContent = metaParts.join(' · ');

        const actions = document.createElement('div');
        actions.className = 'pending-actions';

        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'btn btn-primary';
        approveBtn.textContent = 'Approve';
        approveBtn.addEventListener('click', async () => {
            try {
                const { pending: updated } = await apiRequest('POST', `/api/quotes/pending/${suggestion.id}/approve`);
                renderPending(updated);
                showMessage(pendingMessage, '✅ Approved — added to the live rotation.', 'success');
            } catch (error) {
                showMessage(pendingMessage, `❌ ${error.message}`, 'error');
            }
        });

        const rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'btn btn-danger';
        rejectBtn.textContent = 'Reject';
        rejectBtn.addEventListener('click', async () => {
            try {
                const { pending: updated } = await apiRequest('POST', `/api/quotes/pending/${suggestion.id}/reject`);
                renderPending(updated);
                showMessage(pendingMessage, '✅ Rejected.', 'success');
            } catch (error) {
                showMessage(pendingMessage, `❌ ${error.message}`, 'error');
            }
        });

        actions.appendChild(approveBtn);
        actions.appendChild(rejectBtn);

        li.appendChild(textEl);
        li.appendChild(metaEl);
        li.appendChild(actions);
        pendingList.appendChild(li);
    });
}

async function loadAndRenderPending() {
    const { pending } = await apiRequest('GET', '/api/quotes/pending');
    renderPending(pending);
}

// --- Unlock ---

async function unlockWithSecret(secret) {
    adminSecret = secret;
    try {
        await loadAndRenderQuotes();
        await loadAndRenderPending();
        hideMessage(unlockMessage);
        unlockSection.style.display = 'none';
        editorSection.style.display = 'block';
        return true;
    } catch (error) {
        adminSecret = null;
        showMessage(unlockMessage, `❌ ${error.message}`, 'error');
        return false;
    }
}

unlockBtn.addEventListener('click', async () => {
    const secret = adminSecretInput.value.trim();
    if (!secret) {
        showMessage(unlockMessage, '❌ Enter the admin secret first.', 'error');
        return;
    }

    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Unlocking...';
    await unlockWithSecret(secret);
    unlockBtn.disabled = false;
    unlockBtn.textContent = 'Unlock';
});

adminSecretInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlockBtn.click();
});

// --- One-click unlock via a signed link from /eggshen-config-quotes
// admin-link — exchanges the single-use ?token= for the real admin secret
// server-side (never persisted, same as a manually-typed secret) and
// unlocks automatically, skipping the password prompt entirely. The token
// param is stripped from the visible URL right away so a screenshot/copied
// link doesn't leak it (it's single-use anyway, but no reason to leave it
// sitting in the address bar or browser history longer than necessary).
(async function tryTokenUnlock() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;

    window.history.replaceState({}, document.title, window.location.pathname);

    showMessage(unlockMessage, 'Unlocking via link...', 'success');
    try {
        const response = await fetch('/api/quotes-admin-link/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'This link is invalid.');
        }
        await unlockWithSecret(data.secret);
    } catch (error) {
        showMessage(unlockMessage, `❌ ${error.message}`, 'error');
    }
})();
