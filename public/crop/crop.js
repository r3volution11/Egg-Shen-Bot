const params = new URLSearchParams(window.location.search);
const requestId = window.location.pathname.split('/').filter(Boolean).pop();
const token = params.get('token');

let cropper = null;
// Set when the moderator picks a new file (replace/upload inputs) instead
// of cropping the pre-loaded existing image — that new file becomes the
// request's new "original" on save, so a future re-crop starts from it.
let newOriginalFile = null;

const loadingMessage = document.getElementById('loading-message');
const cropSection = document.getElementById('crop-section');
const emptyState = document.getElementById('empty-state');
const cropTarget = document.getElementById('crop-target');
const saveBtn = document.getElementById('save-btn');
const resultMessage = document.getElementById('result-message');
const replaceFileInput = document.getElementById('replace-file');
const uploadFileInput = document.getElementById('upload-file');

function showMessage(text, type) {
    resultMessage.textContent = text;
    resultMessage.className = `message ${type}`;
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

function loadFileIntoCropper(file) {
    newOriginalFile = file;
    const reader = new FileReader();
    reader.onload = () => {
        cropSection.style.display = 'block';
        emptyState.style.display = 'none';
        initCropper(reader.result);
    };
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
            loadingMessage.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        if (!response.ok) {
            loadingMessage.textContent = 'This crop link is invalid or has expired.';
            return;
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);

        loadingMessage.style.display = 'none';
        cropSection.style.display = 'block';
        initCropper(imageUrl);
    } catch (error) {
        console.error('Error loading current image:', error);
        loadingMessage.textContent = 'Failed to load this request. Please try again.';
    }
}

replaceFileInput.addEventListener('change', () => {
    if (replaceFileInput.files.length) {
        loadFileIntoCropper(replaceFileInput.files[0]);
    }
});

uploadFileInput.addEventListener('change', () => {
    if (uploadFileInput.files.length) {
        loadFileIntoCropper(uploadFileInput.files[0]);
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
            formData.append('original', newOriginalFile);
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
    } catch (error) {
        console.error('Error saving crop:', error);
        showMessage(`❌ ${error.message}`, 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Cropped Image';
    }
});

init();
