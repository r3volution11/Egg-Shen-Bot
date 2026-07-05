#!/usr/bin/env node

/**
 * OAuth Configuration Validator
 * Validates that OAuth environment variables are properly configured
 * Run before deploying event request system
 */

import 'dotenv/config';

const errors = [];
const warnings = [];

console.log('🔍 Validating OAuth Configuration...\n');

// Check DISCORD_CLIENT_SECRET
if (!process.env.DISCORD_CLIENT_SECRET) {
  errors.push('❌ DISCORD_CLIENT_SECRET is not set');
} else if (process.env.DISCORD_CLIENT_SECRET.length < 10) {
  warnings.push('⚠️  DISCORD_CLIENT_SECRET seems too short');
} else {
  console.log('✅ DISCORD_CLIENT_SECRET is set');
}

// Check OAUTH_REDIRECT_URI
if (!process.env.OAUTH_REDIRECT_URI) {
  errors.push('❌ OAUTH_REDIRECT_URI is not set');
} else {
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  
  if (!redirectUri.match(/^https?:\/\/.+\/api\/auth\/discord\/callback$/)) {
    errors.push(`❌ OAUTH_REDIRECT_URI must end with /api/auth/discord/callback\n   Got: ${redirectUri}`);
  } else {
    console.log(`✅ OAUTH_REDIRECT_URI: ${redirectUri}`);
    
    // Check if production uses HTTPS
    if (!redirectUri.includes('localhost') && !redirectUri.startsWith('https://')) {
      warnings.push('⚠️  Production OAUTH_REDIRECT_URI should use HTTPS');
    }
  }
}

// Check FORM_URL
if (!process.env.FORM_URL) {
  warnings.push('⚠️  FORM_URL is not set (optional but recommended)');
} else {
  const formUrl = process.env.FORM_URL;
  console.log(`✅ FORM_URL: ${formUrl}`);
  
  // Check if production uses HTTPS
  if (!formUrl.includes('localhost') && !formUrl.startsWith('https://')) {
    warnings.push('⚠️  Production FORM_URL should use HTTPS');
  }
}

// Check ALLOWED_ORIGINS
if (!process.env.ALLOWED_ORIGINS) {
  warnings.push('⚠️  ALLOWED_ORIGINS is not set (CORS may fail)');
} else {
  const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
  console.log(`✅ ALLOWED_ORIGINS: ${allowedOrigins.join(', ')}`);
  
  // Check if FORM_URL is in ALLOWED_ORIGINS
  if (process.env.FORM_URL && !allowedOrigins.includes(process.env.FORM_URL)) {
    warnings.push(`⚠️  FORM_URL (${process.env.FORM_URL}) is not in ALLOWED_ORIGINS`);
  }
}

// Check API_PORT
if (!process.env.API_PORT) {
  warnings.push('⚠️  API_PORT is not set (will default to 3000)');
} else {
  const port = parseInt(process.env.API_PORT, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`❌ API_PORT must be a valid port number (1-65535)\n   Got: ${process.env.API_PORT}`);
  } else {
    console.log(`✅ API_PORT: ${port}`);
  }
}

// Check domain consistency
if (process.env.OAUTH_REDIRECT_URI && process.env.FORM_URL) {
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  const formUrl = process.env.FORM_URL;
  
  if (!redirectUri.includes('localhost') && !formUrl.includes('localhost')) {
    try {
      const redirectDomain = new URL(redirectUri).hostname;
      const formDomain = new URL(formUrl).hostname;
      
      if (redirectDomain !== formDomain) {
        warnings.push(`⚠️  Domain mismatch:\n   OAUTH_REDIRECT_URI: ${redirectDomain}\n   FORM_URL: ${formDomain}`);
      }
    } catch (e) {
      errors.push(`❌ Invalid URL format: ${e.message}`);
    }
  }
}

// Print results
console.log('\n' + '='.repeat(60));

if (warnings.length > 0) {
  console.log('\n⚠️  WARNINGS:');
  warnings.forEach(w => console.log(w));
}

if (errors.length > 0) {
  console.log('\n❌ ERRORS:');
  errors.forEach(e => console.log(e));
  console.log('\n' + '='.repeat(60));
  console.log('\n📝 Required Actions:');
  console.log('1. Update your .env file with the missing/invalid values');
  console.log('2. Add redirect URI to Discord Developer Portal:');
  console.log('   https://discord.com/developers/applications');
  console.log('   → Your Application → OAuth2 → Redirects');
  if (process.env.OAUTH_REDIRECT_URI) {
    console.log(`   → Add: ${process.env.OAUTH_REDIRECT_URI}`);
  }
  console.log('\n' + '='.repeat(60));
  process.exit(1);
}

console.log('\n✅ OAuth configuration is valid!');
console.log('\n📝 Next Steps:');
console.log('1. Add redirect URI to Discord Developer Portal:');
console.log('   https://discord.com/developers/applications');
console.log('   → Your Application → OAuth2 → Redirects');
if (process.env.OAUTH_REDIRECT_URI) {
  console.log(`   → Add: ${process.env.OAUTH_REDIRECT_URI}`);
}
console.log('2. Configure GUILD_ID in public/app.js');
console.log('3. Deploy web form files to your domain');
console.log('4. Configure server with /eggshen-config event-requests commands');
console.log('\n' + '='.repeat(60));
