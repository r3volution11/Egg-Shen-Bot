// Copy this file to config.js and set your Discord server's Guild ID.
// public/config.js is gitignored — it holds this deployment's real value
// and is never touched by `git pull`, so a deploy can never overwrite it
// (and it can never accidentally get committed either).
//
// To find your Guild ID:
// 1. Enable Developer Mode in Discord (User Settings → Advanced)
// 2. Right-click your server icon → "Copy Server ID"
window.EGG_SHEN_CONFIG = {
  GUILD_ID: 'YOUR_GUILD_ID_HERE',

  // Optional: a logo shown at the top of the form (e.g. your server's own
  // icon or the community/brand this form represents). Leave blank/omit to
  // show no logo. Displayed centered, capped at 200px wide.
  LOGO_URL: '',
};
