const params = new URLSearchParams(window.location.search);
const requestId = window.location.pathname.split('/').filter(Boolean).pop();
const token = params.get('token');

let cropper = null;
// Set when the image in the cropper isn't stored on the server yet — a
// picked file, a fetched URL, or the request's own image link — so it
// becomes the request's new "original" on save, and a future re-crop
// starts from it. Null when re-cropping an image already on file.
let newOriginalFile = null;

const loadingMessage = document.getElementById('loading-message');
const cropSection = document.getElementById('crop-section');
const emptyState = document.getElementById('empty-state');
const emptyStateText = document.getElementById('empty-state-text');
const sourceSection = document.getElementById('source-section');
const sourceFileLabel = document.getElementById('source-file-label');
const cropTarget = document.getElementById('crop-target');
const saveBtn = document.getElementById('save-btn');
const resultMessage = document.getElementById('result-message');
const sourceFileInput = document.getElementById('source-file');
const sourceUrlInput = document.getElementById('source-url');
const fetchUrlBtn = document.getElementById('fetch-url-btn');

// Maps this page's own success/error/info vocabulary onto Bootstrap's
// alert-* class names (kept as a small lookup rather than a blind string
// replace, since Bootstrap uses "danger" where this code says "error").
const ALERT_CLASS = { success: 'alert-success', error: 'alert-danger', info: 'alert-info' };

function showMessage(text, type) {
    resultMessage.textContent = text;
    resultMessage.className = `alert ${ALERT_CLASS[type] || ''}`.trim();
    resultMessage.style.display = 'block';
}

function initCropper(imageSrc) {
    cropper?.destroy();
    cropTarget.src = imageSrc;
    cropper = new Cropper(cropTarget, {
        aspectRatio: 16 / 9,
        viewMode: 1,
        autoCropArea: 1,
    });
}

function showCropper(imageSrc, original) {
    newOriginalFile = original;
    loadingMessage.style.display = 'none';
    emptyState.style.display = 'none';
    cropSection.style.display = 'block';
    sourceSection.style.display = 'block';
    sourceFileLabel.textContent = 'Or upload a different image';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Cropped Image';
    initCropper(imageSrc);
}

function showEmptyState(text) {
    loadingMessage.style.display = 'none';
    if (text) emptyStateText.textContent = text;
    emptyState.style.display = 'block';
    sourceSection.style.display = 'block';
}

function loadFileIntoCropper(file) {
    const reader = new FileReader();
    reader.onload = () => showCropper(reader.result, file);
    reader.readAsDataURL(file);
}

async function init() {
    if (!requestId || !token) {
        loadingMessage.textContent = 'This crop link is missing required information.';
        return;
    }

    try {
        const response = await fetch(`/crop/${requestId}/current-image?token=${encodeURIComponent(token)}`);

        if (response.status === 404) {
            // A request whose image link no longer loads says so, rather
            // than claiming it never had an image.
            const data = await response.json().catch(() => ({}));
            showEmptyState(data.error?.startsWith("The request's image link")
                ? `${data.error} Add a different image below.`
                : null);
            return;
        }

        if (!response.ok) {
            loadingMessage.textContent = 'This crop link is invalid or has expired.';
            return;
        }

        const blob = await response.blob();
        // An image that came from the request's link isn't on the server
        // yet, so it's saved as the original along with the crop.
        const fromLink = response.headers.get('X-Image-Source') === 'url';
        showCropper(URL.createObjectURL(blob), fromLink ? blob : null);
    } catch (error) {
        console.error('Error loading current image:', error);
        loadingMessage.textContent = 'Failed to load this request. Please try again.';
    }
}

sourceFileInput.addEventListener('change', () => {
    if (sourceFileInput.files.length) {
        sourceUrlInput.value = '';
        loadFileIntoCropper(sourceFileInput.files[0]);
    }
});

fetchUrlBtn.addEventListener('click', async () => {
    const imageUrl = sourceUrlInput.value.trim();
    if (!imageUrl) {
        showMessage('Paste an image URL first.', 'error');
        return;
    }

    fetchUrlBtn.disabled = true;
    fetchUrlBtn.textContent = 'Fetching...';
    resultMessage.style.display = 'none';

    try {
        // Fetched by the bot, not the browser: most image hosts block
        // cross-origin reads, which would leave the cropper unable to export.
        const response = await fetch(`/crop/${requestId}/fetch-image-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, imageUrl }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch that image');
        }

        const blob = await (await fetch(data.dataUrl)).blob();
        sourceFileInput.value = '';
        showCropper(data.dataUrl, blob);
    } catch (error) {
        console.error('Error fetching image URL:', error);
        showMessage(`❌ ${error.message}`, 'error');
    } finally {
        fetchUrlBtn.disabled = false;
        fetchUrlBtn.textContent = 'Fetch & Crop';
    }
});

saveBtn.addEventListener('click', async () => {
    if (!cropper) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    resultMessage.style.display = 'none';

    try {
        const blob = await new Promise(resolve => {
            cropper.getCroppedCanvas({ width: 1280, height: 720 }).toBlob(resolve, 'image/jpeg', 0.9);
        });

        const formData = new FormData();
        formData.append('image', blob, 'crop.jpg');
        formData.append('token', token);
        if (newOriginalFile) {
            // A Blob (fetched image) has no name of its own; multer needs one.
            formData.append('original', newOriginalFile, newOriginalFile.name || 'original');
        }

        const response = await fetch(`/crop/${requestId}/save`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to save cropped image');
        }

        showMessage('✅ Saved! You can close this tab.', 'success');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saved';
        // The link is single-use, so a second image picked now couldn't be
        // saved — stop offering one.
        sourceSection.style.display = 'none';
    } catch (error) {
        console.error('Error saving crop:', error);
        showMessage(`❌ ${error.message}`, 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Cropped Image';
    }
});

init();
