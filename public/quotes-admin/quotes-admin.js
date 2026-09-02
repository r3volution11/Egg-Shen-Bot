// Not persisted (no localStorage) — re-entered each visit, so the secret
// doesn't sit around in browser storage.
let adminSecret = null;

const unlockSection = document.getElementById('unlock-section');
const editorSection = document.getElementById('editor-section');
const adminSecretInput = document.getElementById('admin-secret');
const unlockBtn = document.getElementById('unlock-btn');
const unlockMessage = document.getElementById('unlock-message');

const quoteList = document.getElementById('quote-list');
const emptyState = document.getElementById('empty-state');
const editorMessage = document.getElementById('editor-message');
const newQuoteText = document.getElementById('new-quote-text');
const addQuoteBtn = document.getElementById('add-quote-btn');

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

function renderQuotes(quotes) {
    quoteList.innerHTML = '';
    emptyState.style.display = quotes.length === 0 ? 'block' : 'none';

    quotes.forEach((quote, index) => {
        const li = document.createElement('li');
        li.className = 'quote-row';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = quote;

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (!text) {
                showMessage(editorMessage, '❌ A quote can\'t be empty.', 'error');
                return;
            }
            try {
                const { quotes: updated } = await apiRequest('PUT', `/api/quotes/${index}`, { text });
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

        li.appendChild(input);
        li.appendChild(saveBtn);
        li.appendChild(deleteBtn);
        quoteList.appendChild(li);
    });
}

async function loadAndRenderQuotes() {
    const { quotes } = await apiRequest('GET', '/api/quotes');
    renderQuotes(quotes);
}

unlockBtn.addEventListener('click', async () => {
    const secret = adminSecretInput.value.trim();
    if (!secret) {
        showMessage(unlockMessage, '❌ Enter the admin secret first.', 'error');
        return;
    }

    adminSecret = secret;
    unlockBtn.disabled = true;
    unlockBtn.textContent = 'Unlocking...';

    try {
        await loadAndRenderQuotes();
        hideMessage(unlockMessage);
        unlockSection.style.display = 'none';
        editorSection.style.display = 'block';
    } catch (error) {
        adminSecret = null;
        showMessage(unlockMessage, `❌ ${error.message}`, 'error');
    } finally {
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock';
    }
});

adminSecretInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlockBtn.click();
});

addQuoteBtn.addEventListener('click', async () => {
    const text = newQuoteText.value.trim();
    if (!text) {
        showMessage(editorMessage, '❌ Enter some text first.', 'error');
        return;
    }

    addQuoteBtn.disabled = true;
    try {
        const { quotes } = await apiRequest('POST', '/api/quotes', { text });
        renderQuotes(quotes);
        newQuoteText.value = '';
        showMessage(editorMessage, '✅ Added.', 'success');
    } catch (error) {
        showMessage(editorMessage, `❌ ${error.message}`, 'error');
    } finally {
        addQuoteBtn.disabled = false;
    }
});

newQuoteText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addQuoteBtn.click();
});
