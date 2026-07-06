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
const GUILD_ID = 'YOUR_GUILD_ID_HERE'; // ⚠️ CHANGE THIS!

// Validate configuration
if (!GUILD_ID || GUILD_ID === 'YOUR_GUILD_ID_HERE') {
    document.body.innerHTML = '<div class="container"><div class="error-message" style="background: #fee; border: 1px solid #c33; padding: 20px; border-radius: 8px; color: #c33; text-align: center; margin-top: 50px;"><h2>⚠️ Configuration Required</h2><p>This event request form has not been configured with a Discord server ID.</p><p><strong>Edit <code>public/app.js</code></strong> and set the <code>GUILD_ID</code> constant to your server\'s Guild ID.</p><p>See the comments in the file for instructions on finding your Guild ID.</p></div></div>';
    throw new Error('GUILD_ID not configured in app.js');
}

// State
let currentUser = null;
let guildConfig = null;

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
    
    // Date/Time validation and auto-update
    const startDateInput = document.getElementById('start-date');
    const startTimeInput = document.getElementById('start-time');
    const endDateInput = document.getElementById('end-date');
    const endTimeInput = document.getElementById('end-time');
    
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    startDateInput.min = today;
    endDateInput.min = today;
    
    // When start date/time changes, update end date/time to match
    function updateEndDateTime() {
        const startDate = startDateInput.value;
        const startTime = startTimeInput.value;
        
        if (startDate && startTime) {
            // Update end date/time to match start
            endDateInput.value = startDate;
            endTimeInput.value = startTime;
            
            // Update min constraint on end date
            endDateInput.min = startDate;
        }
    }
    
    startDateInput.addEventListener('change', updateEndDateTime);
    startTimeInput.addEventListener('change', updateEndDateTime);
    
    // Validate end date/time is not before start and has 10 minute minimum
    function validateEndDateTime() {
        const startDate = startDateInput.value;
        const startTime = startTimeInput.value;
        const endDate = endDateInput.value;
        const endTime = endTimeInput.value;
        
        if (!startDate || !startTime || !endDate || !endTime) {
            return; // Skip validation if any field is empty
        }
        
        const startDateTime = new Date(`${startDate}T${startTime}`);
        const endDateTime = new Date(`${endDate}T${endTime}`);
        
        // Check if end is before start
        if (endDateTime < startDateTime) {
            endDateInput.value = startDate;
            endTimeInput.value = startTime;
            showMessage('⚠️ End time cannot be before start time. Updated to match start time.', 'error', false);
            return;
        }
        
        // Check if difference is less than 10 minutes
        const diffMinutes = (endDateTime - startDateTime) / (1000 * 60);
        if (diffMinutes < 10) {
            // Add 10 minutes to start time
            const minEndDateTime = new Date(startDateTime.getTime() + 10 * 60 * 1000);
            endDateInput.value = minEndDateTime.toISOString().split('T')[0];
            endTimeInput.value = minEndDateTime.toTimeString().substring(0, 5);
            showMessage('⚠️ End time must be at least 10 minutes after start time. Updated to minimum duration.', 'error', false);
        }
    }
    
    endDateInput.addEventListener('change', validateEndDateTime);
    endTimeInput.addEventListener('change', validateEndDateTime);
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
    
    // Validate end time if provided
    if (formData.endTime) {
        const startDateTime = new Date(formData.startTime);
        const endDateTime = new Date(formData.endTime);
        
        if (endDateTime <= startDateTime) {
            showMessage('End time must be after start time.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Request';
            return;
        }
        
        const diffMinutes = (endDateTime - startDateTime) / (1000 * 60);
        if (diffMinutes < 10) {
            showMessage('End time must be at least 10 minutes after start time.', 'error');
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
