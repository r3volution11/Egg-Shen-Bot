/**
 * Documentation Example Generator
 * 
 * Automatically generates example images for tournament commands by:
 * 1. Importing actual embed builders from the codebase
 * 2. Creating mock tournament data
 * 3. Rendering embeds in a Discord-like UI
 * 4. Taking screenshots for documentation
 * 
 * Run manually: node docs/generate-examples.js
 * Runs automatically in CI/CD before docs build
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Output directory for generated images
const IMAGES_DIR = join(__dirname, 'public', 'images', 'examples', 'tournaments');

// Ensure images directory exists
if (!existsSync(IMAGES_DIR)) {
  mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Mock Discord client for embed rendering
 */
const mockClient = {
  user: {
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png'
  }
};

/**
 * Convert Discord.js embed to HTML for rendering
 */
function embedToHTML(embedData) {
  const embed = embedData.data || embedData;
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          margin: 0;
          padding: 20px;
          background-color: #36393f;
          font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }
        .embed {
          max-width: 520px;
          background-color: #2f3136;
          border-left: 4px solid #${embed.color ? embed.color.toString(16).padStart(6, '0') : '4EC5ED'};
          border-radius: 4px;
          padding: 8px 16px 16px 12px;
          display: inline-block;
        }
        .embed-author {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        .embed-author-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          margin-right: 8px;
        }
        .embed-author-name {
          color: #ffffff;
          font-size: 14px;
          font-weight: 600;
        }
        .embed-title {
          color: #ffffff;
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .embed-description {
          color: #dcddde;
          font-size: 14px;
          line-height: 1.375;
          white-space: pre-wrap;
          margin-bottom: 8px;
        }
        .embed-fields {
          display: grid;
          gap: 8px;
          margin-top: 8px;
        }
        .embed-field {
          color: #dcddde;
          font-size: 14px;
        }
        .embed-field-name {
          color: #ffffff;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .embed-field-value {
          line-height: 1.375;
          white-space: pre-wrap;
        }
        .embed-field.inline {
          display: inline-block;
          min-width: 150px;
          flex: 1;
        }
        .embed-thumbnail {
          float: right;
          max-width: 80px;
          max-height: 80px;
          border-radius: 4px;
          margin-left: 16px;
        }
        .embed-image {
          max-width: 100%;
          border-radius: 4px;
          margin-top: 16px;
        }
        .embed-footer {
          display: flex;
          align-items: center;
          margin-top: 8px;
          color: #72767d;
          font-size: 12px;
        }
        .embed-footer-icon {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          margin-right: 8px;
        }
      </style>
    </head>
    <body>
      <div class="embed">
  `;

  // Author
  if (embed.author) {
    html += '<div class="embed-author">';
    if (embed.author.icon_url) {
      html += `<img class="embed-author-icon" src="${embed.author.icon_url}" />`;
    }
    html += `<div class="embed-author-name">${embed.author.name}</div>`;
    html += '</div>';
  }

  // Thumbnail
  if (embed.thumbnail) {
    html += `<img class="embed-thumbnail" src="${embed.thumbnail.url}" />`;
  }

  // Title
  if (embed.title) {
    html += `<div class="embed-title">${embed.title}</div>`;
  }

  // Description
  if (embed.description) {
    html += `<div class="embed-description">${embed.description}</div>`;
  }

  // Fields
  if (embed.fields && embed.fields.length > 0) {
    html += '<div class="embed-fields">';
    embed.fields.forEach(field => {
      html += `<div class="embed-field ${field.inline ? 'inline' : ''}">`;
      html += `<div class="embed-field-name">${field.name}</div>`;
      html += `<div class="embed-field-value">${field.value}</div>`;
      html += '</div>';
    });
    html += '</div>';
  }

  // Image
  if (embed.image) {
    html += `<img class="embed-image" src="${embed.image.url}" />`;
  }

  // Footer
  if (embed.footer || embed.timestamp) {
    html += '<div class="embed-footer">';
    if (embed.footer) {
      if (embed.footer.icon_url) {
        html += `<img class="embed-footer-icon" src="${embed.footer.icon_url}" />`;
      }
      html += `<div>${embed.footer.text}</div>`;
    }
    if (embed.timestamp) {
      const date = new Date(embed.timestamp);
      html += ` • ${date.toLocaleString()}`;
    }
    html += '</div>';
  }

  html += `
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Take screenshot of embed
 */
async function screenshotEmbed(embedData, filename) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 600, height: 800 }
  });

  const html = embedToHTML(embedData);
  await page.setContent(html);

  const outputPath = join(IMAGES_DIR, filename);
  await page.screenshot({
    path: outputPath,
    fullPage: true
  });

  await browser.close();
  console.log(`✅ Generated: ${filename}`);
}

/**
 * Generate all tournament example images
 */
async function generateTournamentExamples() {
  console.log('🎨 Generating tournament example images...\n');

  // Import tournament UI utilities (without starting Discord bot)
  const { EmbedBuilder } = await import('discord.js');

  // Example 1: Voting Dashboard with Stats
  const votingDashboard = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle('🗳️ Your Voting Dashboard')
    .setDescription(
      `Vote for ONE title in each matchup below.\n` +
      `Your selections are shown in **purple**.\n\n` +
      `💡 Click any button to cast or change your vote!\n\n` +
      `🔥 **Streak:** 5 rounds | 📊 **Total votes:** 12`
    )
    .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
    .setFooter({ text: 'Only you can see this • Your votes update in real-time' })
    .setTimestamp();

  await screenshotEmbed(votingDashboard, 'voting-dashboard.png');

  // Example 2: Live Standings with Progress Bars
  const liveStandings = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle('🏆 Quarterfinals - Live Standings')
    .setDescription(
      `**📊 Live Vote Counts**\n\n` +
      `**1A**\n` +
      `The Exorcist 🔥\n` +
      `████████████ 45 votes (60%)\n` +
      `The Witch\n` +
      `████████░░░░ 30 votes (40%)\n\n` +
      `**1B**\n` +
      `Hereditary 🔥\n` +
      `██████████░░ 38 votes (58%)\n` +
      `The Conjuring\n` +
      `███████░░░░░ 27 votes (42%)\n\n` +
      `📈 **Total votes:** 140\n` +
      `👥 **Voters:** 35\n` +
      `🎯 **Matchups:** 4`
    )
    .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
    .setFooter({ text: 'Updates in real-time as votes are cast' })
    .setTimestamp();

  await screenshotEmbed(liveStandings, 'live-standings.png');

  // Example 3: Tournament Status
  const tournamentStatus = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('🏆 The Shudder Discord Gore Cup')
    .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
    .addFields(
      { name: 'Status', value: 'knockout', inline: true },
      { name: 'Phase', value: 'quarterfinals', inline: true },
      { name: 'Creator', value: '<@123456789>', inline: true }
    )
    .setDescription(
      `**Quarterfinals**\n\n` +
      `Single elimination bracket\n\n` +
      `**📊 Active Matchups:**\n\n` +
      `**1A** - 35 voters\n` +
      `⏰ 2h 15m remaining\n` +
      `🥇 The Exorcist (45)\n` +
      `🥈 The Witch (30)\n\n` +
      `**1B** - 32 voters\n` +
      `⏰ 2h 15m remaining\n` +
      `🥇 Hereditary (38)\n` +
      `🥈 The Conjuring (27)`
    );

  await screenshotEmbed(tournamentStatus, 'tournament-status.png');

  // Example 4: Round Complete Results
  const roundComplete = new EmbedBuilder()
    .setColor(0xFF9900)
    .setTitle('🏁 Quarterfinals Complete!')
    .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
    .setDescription('**4 matchups** closed. Here are the winners:\n')
    .addFields(
      {
        name: 'Matchup 1A',
        value: '**The Exorcist** (45 vs 30) defeats The Witch',
        inline: false
      },
      {
        name: 'Matchup 1B',
        value: '**Hereditary** (38 vs 27) defeats The Conjuring',
        inline: false
      },
      {
        name: 'Matchup 2A',
        value: '**Halloween** (52 vs 23) defeats Scream',
        inline: false
      },
      {
        name: 'Matchup 2B',
        value: '**The Ring** (41 vs 34) defeats The Grudge',
        inline: false
      }
    )
    .setFooter({ text: 'Winners have advanced to Semifinals. Run /bracket open-semis to start voting!' });

  await screenshotEmbed(roundComplete, 'round-complete.png');

  // Example 5: First Vote Welcome
  const firstVote = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle('🗳️ Your Voting Dashboard')
    .setDescription(
      `Vote for ONE title in each matchup below.\n` +
      `Your selections are shown in **purple**.\n\n` +
      `💡 Click any button to cast or change your vote!\n\n` +
      `✨ This is your first vote!`
    )
    .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
    .setFooter({ text: 'Only you can see this • Your votes update in real-time' })
    .setTimestamp();

  await screenshotEmbed(firstVote, 'first-vote-welcome.png');

  console.log(`\n✅ Generated ${5} tournament example images`);
  console.log(`📁 Images saved to: ${IMAGES_DIR}`);
}

// Run generator
generateTournamentExamples()
  .then(() => {
    console.log('\n🎉 Documentation examples generated successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error generating examples:', error);
    process.exit(1);
  });
