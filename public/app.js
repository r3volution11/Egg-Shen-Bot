// Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';

// ===================================================================
// DEPLOYMENT CONFIGURATION
// Set this to your Discord server's Guild ID when deploying the form
// Each website deployment is dedicated to ONE specific Discord server
// 
// To find your Guild ID:
// 1. Enable Developer Mode in Discord (User Settings → Advanced)
// 2. Right-click your server icon → "Copy Server ID"
// 
// Example: const GUILD_ID = '1234567890123456789';
// ===================================================================
// e2eGuildId query param lets the Playwright e2e suite (tests/e2e/) exercise
// this page against fixture guilds without editing this file. Has no effect
// on a real deployment unless the param is explicitly present in the URL.
const GUILD_ID = new URLSearchParams(window.location.search).get('e2eGuildId') || 'YOUR_GUILD_ID_HERE'; // ⚠️ CHANGE THIS!

// Validate configuration
if (!GUILD_ID || GUILD_ID === 'YOUR_GUILD_ID_HERE') {
    document.body.innerHTML = '<div class="container"><div class="error-message" style="background: #fee; border: 1px solid #c33; padding: 20px; border-radius: 8px; color: #c33; text-align: center; margin-top: 50px;"><h2>⚠️ Configuration Required</h2><p>This event request form has not been configured with a Discord server ID.</p><p><strong>Edit <code>public/app.js</code></strong> and set the <code>GUILD_ID</code> constant to your server\'s Guild ID.</p><p>See the comments in the file for instructions on finding your Guild ID.</p></div></div>';
    throw new Error('GUILD_ID not configured in app.js');
}

// State
let currentUser = null;
let guildConfig = null;
let uploadedImageToken = null;
let cropper = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load guild configuration
    await loadGuildConfig();
    
    // Check for URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    
    // Handle authentication errors
    if (urlParams.get('error') === 'not_member') {
        const serverName = urlParams.get('serverName') || 'this server';
        const inviteUrl = urlParams.get('inviteUrl');
        
        let errorMessage = `❌ You must be a member of ${serverName} to submit event requests.`;
        if (inviteUrl) {
            errorMessage += ` <a href="${inviteUrl}" target="_blank" style="color: #fff; text-decoration: underline;">Click here to join the server</a>.`;
        }
        
        showMessage(errorMessage, 'error', true);
        
        // Clean URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
    // Check for auth success callback
    else if (urlParams.get('auth') === 'success') {
        // Clean URL after successful auth
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
    
    // Check session
    await checkSession();
    
    // Load guild config first
    await loadGuildConfig();
    
    // Load channels only if user can select them
    if (currentUser && guildConfig && guildConfig.allowUserChannelSelection === true) {
        await loadChannels();
    }
    
    // Set up event listeners
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('event-form').addEventListener('submit', handleSubmit);
    
    // Voice channel checkbox handler
    const voiceCheckbox = document.getElementById('use-voice-channel');
    const voiceChannelGroup = document.getElementById('voice-channel-group');
    const voiceChannelSelect = document.getElementById('voice-channel');
    
    voiceCheckbox.addEventListener('change', () => {
        if (voiceCheckbox.checked) {
            voiceChannelGroup.style.display = 'block';
            voiceChannelSelect.required = true;
        } else {
            voiceChannelGroup.style.display = 'none';
            voiceChannelSelect.required = false;
            voiceChannelSelect.value = '';
        }
    });
    
    // Event image: file upload and URL fields are mutually exclusive.
    // Picking one clears/disables the other, matching the backend's
    // mutual-exclusivity (only one image source is stored per request).
    const imageFileInput = document.getElementById('event-image-file');
    const imageUrlInput = document.getElementById('event-image-url');
    const imageUploadStatus = document.getElementById('image-upload-status');
    const imageCropContainer = document.getElementById('image-crop-container');
    const imageCropTarget = document.getElementById('image-crop-target');

    // The raw, uncropped file the user selected — sent alongside the first
    // cropped upload so the server can preserve it separately. A moderator
    // opening the crop link later crops from this true original, not from
    // a re-crop of the already-cropped result. Only needs to be sent once
    // per file selection, not on every debounced re-crop upload.
    let pendingOriginalFile = null;

    // Uploads a given image blob (the cropped output, not necessarily the
    // raw selected file) and records the returned token. Shared by the
    // initial auto-crop-and-upload on file select and every subsequent
    // re-crop-and-re-upload.
    async function uploadImageBlob(blob) {
        imageUploadStatus.style.display = 'block';
        imageUploadStatus.className = 'image-upload-status';
        imageUploadStatus.textContent = 'Uploading image...';

        try {
            const fileData = new FormData();
            fileData.append('image', blob, 'event-image.jpg');
            if (pendingOriginalFile) {
                fileData.append('original', pendingOriginalFile);
                pendingOriginalFile = null;
            }

            const response = await fetch(`${API_BASE_URL}/event-request/upload-image`, {
                method: 'POST',
                credentials: 'include',
                body: fileData
            });

            // A reverse proxy in front of the API (nginx, etc.) can reject an
            // oversized upload before it ever reaches the bot, returning its
            // own HTML error page instead of the bot's normal JSON response
            // (e.g. a 413 from nginx's default 1MB body size limit) — treat
            // that as a clear "too large" message instead of a confusing
            // JSON-parse failure.
            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error(response.status === 413
                    ? 'Image is too large for this server to accept.'
                    : `Upload failed (server returned ${response.status}).`);
            }

            if (!response.ok) {
                throw new Error(data.error || 'Failed to upload image');
            }

            uploadedImageToken = data.imageToken;
            imageUploadStatus.className = 'image-upload-status success';
            imageUploadStatus.textContent = '✅ Image uploaded';
        } catch (error) {
            console.error('Error uploading image:', error);
            imageUploadStatus.className = 'image-upload-status error';
            imageUploadStatus.textContent = `❌ ${error.message}`;
        }
    }

    function uploadCurrentCrop() {
        if (!cropper) return;
        cropper.getCroppedCanvas({ width: 1280, height: 720 }).toBlob(blob => {
            if (blob) uploadImageBlob(blob);
        }, 'image/jpeg', 0.9);
    }

    let cropUploadDebounceTimer = null;
    function scheduleUploadCurrentCrop() {
        clearTimeout(cropUploadDebounceTimer);
        cropUploadDebounceTimer = setTimeout(uploadCurrentCrop, 800);
    }

    function resetImageCropState() {
        cropper?.destroy();
        cropper = null;
        pendingOriginalFile = null;
        imageCropContainer.style.display = 'none';
    }

    imageUrlInput.addEventListener('input', () => {
        if (imageUrlInput.value.trim()) {
            imageFileInput.value = '';
            imageFileInput.disabled = true;
            uploadedImageToken = null;
            imageUploadStatus.style.display = 'none';
            resetImageCropState();
        } else {
            imageFileInput.disabled = false;
        }
    });

    imageFileInput.addEventListener('change', () => {
        uploadedImageToken = null;
        resetImageCropState();

        if (!imageFileInput.files.length) {
            imageUploadStatus.style.display = 'none';
            imageUrlInput.disabled = false;
            return;
        }

        imageUrlInput.value = '';
        imageUrlInput.disabled = true;

        pendingOriginalFile = imageFileInput.files[0];

        const reader = new FileReader();
        reader.onload = () => {
            imageCropContainer.style.display = 'block';
            imageCropTarget.src = reader.result;
            cropper = new Cropper(imageCropTarget, {
                aspectRatio: 16 / 9,
                viewMode: 1,
                autoCropArea: 1,
                ready() {
                    // Upload the initial auto-crop right away so a user who
                    // never touches the crop box still gets a working
                    // upload — cropping is optional, not mandatory.
                    uploadCurrentCrop();
                },
                cropend() {
                    scheduleUploadCurrentCrop();
                },
            });
        };
        reader.readAsDataURL(imageFileInput.files[0]);
    });

    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('start-date').min = today;
    document.getElementById('end-date').min = today;
    
    // Populate time select dropdowns with 5-minute increments
    const startTimeSelect = document.getElementById('start-time');
    const endTimeSelect = document.getElementById('end-time');
    
    function populateTimeOptions(selectElement) {
        // Keep the default "Select time..." option
        const defaultOption = selectElement.querySelector('option[value=""]');
        selectElement.innerHTML = '';
        if (defaultOption) {
            selectElement.appendChild(defaultOption);
        }
        
        // Generate time options in 15-minute increments
        for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute += 15) {
                const hourStr = String(hour).padStart(2, '0');
                const minuteStr = String(minute).padStart(2, '0');
                const timeValue = `${hourStr}:${minuteStr}`;
                
                // Format for display (12-hour with AM/PM)
                const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                const ampm = hour < 12 ? 'AM' : 'PM';
                const displayTime = `${hour12}:${minuteStr} ${ampm}`;
                
                const option = document.createElement('option');
                option.value = timeValue;
                option.textContent = displayTime;
                selectElement.appendChild(option);
            }
        }
    }
    
    populateTimeOptions(startTimeSelect);
    populateTimeOptions(endTimeSelect);
    
    // Set default start time to 6:00 PM and end time to 6:15 PM
    startTimeSelect.value = '18:00';
    endTimeSelect.value = '18:15';
    
    // Date/Time validation and auto-update handlers
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    
    // When start date/time changes, update end date/time to match (with 15 min buffer)
    function updateEndDateTime() {
        const startDate = startDateInput.value;
        const startTime = startTimeSelect.value;
        
        if (startDate && startTime) {
            // Set end date to match start date
            endDateInput.value = startDate;
            
            // Set end time to start time + 15 minutes
            const [hours, minutes] = startTime.split(':').map(Number);
            const startDateTime = new Date();
            startDateTime.setHours(hours, minutes);
            startDateTime.setMinutes(startDateTime.getMinutes() + 15);
            
            const endHours = String(startDateTime.getHours()).padStart(2, '0');
            const endMinutes = String(startDateTime.getMinutes()).padStart(2, '0');
            endTimeSelect.value = `${endHours}:${endMinutes}`;
            
            // Update end date min constraint
            endDateInput.min = startDate;
        }
    }
    
    // Validate end date/time is not before start date/time
    function validateEndDateTime() {
        const startDate = startDateInput.value;
        const startTime = startTimeSelect.value;
        const endDate = endDateInput.value;
        const endTime = endTimeSelect.value;
        
        if (!startDate || !startTime || !endDate || !endTime) {
            return true; // Skip validation if fields are empty
        }
        
        const startDateTime = new Date(`${startDate}T${startTime}`);
        const endDateTime = new Date(`${endDate}T${endTime}`);
        const minEndDateTime = new Date(startDateTime.getTime() + 15 * 60 * 1000); // +15 minutes
        
        if (endDateTime < minEndDateTime) {
            // Auto-correct to minimum allowed time
            endDateInput.value = startDate;
            const endHours = String(minEndDateTime.getHours()).padStart(2, '0');
            const endMinutes = String(minEndDateTime.getMinutes()).padStart(2, '0');
            endTimeSelect.value = `${endHours}:${endMinutes}`;
            return false;
        }
        
        return true;
    }
    
    startDateInput.addEventListener('change', updateEndDateTime);
    startTimeSelect.addEventListener('change', updateEndDateTime);
    endDateInput.addEventListener('change', validateEndDateTime);
    endTimeSelect.addEventListener('change', validateEndDateTime);
});

// Check if user is logged in
async function checkSession() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/session`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            showLoggedIn();
        } else {
            showLoggedOut();
        }
    } catch (error) {
        console.error('Error checking session:', error);
        showLoggedOut();
    }
}

// Show logged in state
function showLoggedIn() {
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('event-form').style.display = 'block';
    
    // Set user info
    const username = currentUser.discriminator === '0' 
        ? currentUser.username 
        : `${currentUser.username}#${currentUser.discriminator}`;
    document.getElementById('user-name').textContent = username;
    
    // Set avatar
    if (currentUser.avatar) {
        const avatarUrl = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=64`;
        document.getElementById('user-avatar').src = avatarUrl;
    } else {
        // Default Discord avatar
        const defaultAvatar = (parseInt(currentUser.id) >> 22) % 6;
        document.getElementById('user-avatar').src = `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png`;
    }
}

// Show logged out state
function showLoggedOut() {
    document.getElementById('login-btn').style.display = 'block';
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('event-form').style.display = 'none';
    currentUser = null;
}

// Load guild configuration (server name, invite link, etc.)
async function loadGuildConfig() {
    try {
        const response = await fetch(`${API_BASE_URL}/guild-config/${GUILD_ID}`);
        const data = await response.json();
        
        if (!response.ok) {
            // Event requests not enabled or other error
            if (response.status === 404 || data.error?.includes('not enabled')) {
                showDisabledMessage();
                return;
            }
            // Other error - show generic content
            showGenericContent();
            return;
        }
        
        if (data.config) {
            guildConfig = data.config;
            
            // Update page title and header
            const serverName = guildConfig.serverName || 'Discord Server';
            document.title = `Request a Watch Party - ${serverName}`;
            document.getElementById('page-title').textContent = `🎬 ${serverName}`;
            
            // Update info box
            document.getElementById('info-text').innerHTML = 
                `Submit a watch party request for <strong>${serverName}</strong>. Moderators will review and approve your event.`;
            
            // Update invite link
            const inviteLinkElement = document.getElementById('discord-invite-link');
            if (guildConfig.inviteUrl) {
                inviteLinkElement.href = guildConfig.inviteUrl;
                inviteLinkElement.textContent = `Join ${serverName} →`;
                inviteLinkElement.style.display = 'block';
            } else {
                inviteLinkElement.style.display = 'none';
            }
            
            // Show/hide channel selectors based on config
            const channelSelect = document.getElementById('channel');
            const voiceCheckboxContainer = document.getElementById('use-voice-channel').parentElement.parentElement;
            
            if (guildConfig.allowUserChannelSelection === false) {
                // Hide all channel selectors - moderators will assign during approval
                channelSelect.parentElement.style.display = 'none';
                voiceCheckboxContainer.style.display = 'none';
                channelSelect.required = false;
                
                // Update info text to explain the flow
                document.getElementById('info-text').innerHTML = 
                    `Submit a watch party request for <strong>${serverName}</strong>. <strong>Moderators will select the channels</strong> when approving your event.`;
            } else {
                // Show channel selectors
                channelSelect.parentElement.style.display = 'block';
                channelSelect.required = true;
                voiceCheckboxContainer.style.display = guildConfig.allowVoiceRequests !== false ? 'block' : 'none';
            }
        } else {
            // Config not found - show generic message
            showGenericContent();
        }
    } catch (error) {
        console.error('Error loading guild config:', error);
        showGenericContent();
    }
}

// Show message when event requests are disabled
function showDisabledMessage() {
    // Hide the entire form
    document.getElementById('event-form').style.display = 'none';
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('user-info').style.display = 'none';
    
    // Show disabled message
    document.getElementById('page-title').textContent = '🎬 Event Requests';
    document.getElementById('info-text').innerHTML = 
        '<strong>Event requests are currently disabled for this server.</strong><br><br>' +
        'Server administrators can enable this feature using the <code>/eggshen-config event-requests toggle enabled:true</code> command in Discord.';
    document.getElementById('discord-invite-link').style.display = 'none';
}

// Show generic content if config fails to load
function showGenericContent() {
    document.getElementById('page-title').textContent = '🎬 Discord Event Request';
    document.getElementById('info-text').innerHTML = 
        'Submit a watch party request for this Discord server. Moderators will review and approve your event.';
    document.getElementById('discord-invite-link').style.display = 'none';
}

// Handle login
function handleLogin() {
    // Redirect to OAuth
    window.location.href = `${API_BASE_URL}/auth/discord?guildId=${GUILD_ID}`;
}

// Handle logout
async function handleLogout() {
    try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        showLoggedOut();
    } catch (error) {
        console.error('Error logging out:', error);
    }
}

// Load available channels
async function loadChannels() {
    const channelSelect = document.getElementById('channel');
    const voiceChannelSelect = document.getElementById('voice-channel');
    
    channelSelect.innerHTML = '<option value="">Loading channels...</option>';
    voiceChannelSelect.innerHTML = '<option value="">Loading channels...</option>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/channels/${GUILD_ID}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load channels');
        }
        
        // Separate channels by type
        const textChannels = data.channels.filter(c => c.type === 'text');
        const voiceChannels = data.channels.filter(c => c.type === 'voice' || c.type === 'stage');
        
        // Populate text channel selector (required)
        channelSelect.innerHTML = '<option value="">Select coordination channel...</option>';
        textChannels.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel.id;
            option.textContent = `# ${channel.name}`;
            channelSelect.appendChild(option);
        });
        
        // Populate voice channel selector (optional)
        voiceChannelSelect.innerHTML = '<option value="">No voice channel (external event)</option>';
        voiceChannels.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel.id;
            option.textContent = `${channel.type === 'stage' ? '🎤' : '🔊'} ${channel.name}`;
            voiceChannelSelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading channels:', error);
        channelSelect.innerHTML = '<option value="">Error loading channels</option>';
        voiceChannelSelect.innerHTML = '<option value="">Error loading channels</option>';
        showMessage('Failed to load channels. Please refresh the page.', 'error');
    }
}

// Handle form submission
async function handleSubmit(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showMessage('Please log in with Discord to submit a request.', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
    // Gather form data
    const useVoice = guildConfig.allowUserChannelSelection && document.getElementById('use-voice-channel').checked;
    const voiceChannelValue = useVoice ? document.getElementById('voice-channel').value : null;
    const formData = {
        guildId: GUILD_ID,
        title: document.getElementById('title').value.trim(),
        description: document.getElementById('description').value.trim() || null,
        channelId: guildConfig.allowUserChannelSelection ? document.getElementById('channel').value : null,
        voiceChannelId: voiceChannelValue || null,
        startTime: combineDateTimeToISO('start-date', 'start-time'),
        endTime: combineDateTimeToISO('end-date', 'end-time'),
        frequency: document.getElementById('frequency').value || null,
        imageToken: uploadedImageToken || null,
        imageUrl: uploadedImageToken ? null : (document.getElementById('event-image-url').value.trim() || null),
        submitterUsername: currentUser.discriminator === '0'
            ? currentUser.username
            : `${currentUser.username}#${currentUser.discriminator}`,
        submitterDiscordId: currentUser.id
    };
    
    // Validate
    if (!formData.title || !formData.startTime) {
        showMessage('Please fill in all required fields.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
        return;
    }
    
    // Only require channelId if user selects channels
    if (guildConfig.allowUserChannelSelection && !formData.channelId) {
        showMessage('Please select a location channel.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
        return;
    }
    
    // Validate end time is at least 15 minutes after start time
    if (formData.endTime) {
        const startDateTime = new Date(formData.startTime);
        const endDateTime = new Date(formData.endTime);
        const minEndDateTime = new Date(startDateTime.getTime() + 15 * 60 * 1000); // +15 minutes
        
        if (endDateTime < minEndDateTime) {
            showMessage('End time must be at least 15 minutes after start time.', 'error', true);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Request';
            return;
        }
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/event-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // Handle membership error with invite link
            if (data.error === 'not_member') {
                let errorMessage = data.message || 'You must be a member of this server to submit event requests.';
                if (data.inviteUrl) {
                    errorMessage += ` <a href="${data.inviteUrl}" target="_blank" style="color: #fff; text-decoration: underline;">Click here to join ${data.serverName || 'the server'}</a>.`;
                }
                throw new Error(errorMessage);
            }
            throw new Error(data.error || 'Failed to submit request');
        }
        
        // Success!
        showMessage('✅ Event request submitted successfully! Moderators will review it shortly.', 'success');
        document.getElementById('event-form').reset();

        // Reset image state — form.reset() clears the input values but not
        // our JS-tracked token or the disabled/status/cropper side effects.
        uploadedImageToken = null;
        cropper?.destroy();
        cropper = null;
        document.getElementById('event-image-file').disabled = false;
        document.getElementById('event-image-url').disabled = false;
        document.getElementById('image-upload-status').style.display = 'none';
        document.getElementById('image-crop-container').style.display = 'none';
        
        // Scroll to message
        document.getElementById('form-message').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('Error submitting request:', error);
        
        // Handle rate limit
        if (error.message.includes('Too many')) {
            showMessage('⏱️ Please wait 5 minutes before submitting another request.', 'error', true);
        } else {
            showMessage(`❌ ${error.message}`, 'error', true);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
    }
}

// Combine date and time inputs into ISO string
function combineDateTimeToISO(dateId, timeId) {
    const dateValue = document.getElementById(dateId).value;
    const timeValue = document.getElementById(timeId).value;
    
    if (!dateValue || !timeValue) {
        return null;
    }
    
    const datetime = new Date(`${dateValue}T${timeValue}`);
    return datetime.toISOString();
}

// Show message
function showMessage(text, type = 'info', allowHtml = false) {
    const messageDiv = document.getElementById('form-message');
    
    if (allowHtml) {
        messageDiv.innerHTML = text;
    } else {
        messageDiv.textContent = text;
    }
    
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // Auto-hide after 10 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 10000);
    }
}
