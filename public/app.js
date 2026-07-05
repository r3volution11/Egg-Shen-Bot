// Configuration
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://shudderdrivein.com/api';

// State
let currentUser = null;
let GUILD_ID = null;
let guildConfig = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Get guild ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    GUILD_ID = urlParams.get('guild');
    
    if (!GUILD_ID) {
        showMessage('❌ Missing guild parameter. Please use the correct link from your Discord server.', 'error');
        document.getElementById('login-btn').disabled = true;
        return;
    }
    
    // Load guild configuration
    await loadGuildConfig();
    
    // Check for auth success callback
    if (urlParams.get('auth') === 'success') {
        // Clean URL but preserve guild parameter
        const newUrl = `${window.location.pathname}?guild=${GUILD_ID}`;
        window.history.replaceState({}, document.title, newUrl);
    }
    
    // Check session
    await checkSession();
    
    // Load channels
    if (currentUser) {
        await loadChannels();
    }
    
    // Set up event listeners
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('event-form').addEventListener('submit', handleSubmit);
    
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('start-date').min = today;
    document.getElementById('end-date').min = today;
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
        
        if (response.ok && data.config) {
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
        } else {
            // Config not found or disabled - show generic message
            showGenericContent();
        }
    } catch (error) {
        console.error('Error loading guild config:', error);
        showGenericContent();
    }
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
    channelSelect.innerHTML = '<option value="">Loading channels...</option>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/channels/${GUILD_ID}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load channels');
        }
        
        channelSelect.innerHTML = '<option value="">Select a voice channel...</option>';
        
        data.channels.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel.id;
            option.textContent = `${channel.type === 'stage' ? '🎤' : '🔊'} ${channel.name}`;
            channelSelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading channels:', error);
        channelSelect.innerHTML = '<option value="">Error loading channels</option>';
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
    const formData = {
        guildId: GUILD_ID,
        title: document.getElementById('title').value.trim(),
        description: document.getElementById('description').value.trim() || null,
        channelId: document.getElementById('channel').value,
        startTime: combineDateTimeToISO('start-date', 'start-time'),
        endTime: combineDateTimeToISO('end-date', 'end-time'),
        frequency: document.getElementById('frequency').value || null,
        submitterUsername: currentUser.discriminator === '0' 
            ? currentUser.username 
            : `${currentUser.username}#${currentUser.discriminator}`,
        submitterDiscordId: currentUser.id
    };
    
    // Validate
    if (!formData.title || !formData.channelId || !formData.startTime) {
        showMessage('Please fill in all required fields.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
        return;
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
            showMessage('⏱️ Please wait 5 minutes before submitting another request.', 'error');
        } else {
            showMessage(`❌ ${error.message}`, 'error');
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
function showMessage(text, type = 'info') {
    const messageDiv = document.getElementById('form-message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // Auto-hide after 10 seconds for non-error messages
    if (type !== 'error') {
        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 10000);
    }
}
