import { createCanvas, loadImage } from '@napi-rs/canvas';
import { config } from '../config.js';

const POSTER_WIDTH = 180;
const POSTER_HEIGHT = 120;
const MATCHUP_SPACING = 160;
const ROUND_SPACING = 300;
const CANVAS_PADDING = 40;
const FONT_SIZE = 11;
const TITLE_FONT_SIZE = 24;

/**
 * Generate a visual bracket image for the tournament
 * @param {Object} tournament - Tournament data from bracketManager
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateBracketImage(tournament) {
  const { knockoutBracket, knockoutResults, phase } = tournament;
  
  if (!knockoutBracket || knockoutBracket.length === 0) {
    throw new Error('Tournament has no knockout bracket yet');
  }
  
  // Group matchups by round
  const roundGroups = {};
  knockoutBracket.forEach(matchup => {
    if (!roundGroups[matchup.round]) {
      roundGroups[matchup.round] = [];
    }
    roundGroups[matchup.round].push(matchup);
  });
  
  // Determine round order
  const roundOrder = ['round_of_32', 'round_of_16', 'quarterfinals', 'semifinals', 'finals'];
  const rounds = roundOrder
    .filter(round => roundGroups[round])
    .map(round => ({ name: round, matchups: roundGroups[round] }));
  
  if (rounds.length === 0) {
    throw new Error('No rounds found in bracket');
  }
  
  // Calculate canvas dimensions
  const maxMatchupsInRound = Math.max(...rounds.map(r => r.matchups.length));
  const canvasWidth = (rounds.length * ROUND_SPACING) + (CANVAS_PADDING * 2) + 200; // Extra space for champion
  const canvasHeight = (maxMatchupsInRound * MATCHUP_SPACING) + (CANVAS_PADDING * 2) + 80; // Extra for title
  
  // Create canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#2B2D31'; // Discord dark theme
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${TITLE_FONT_SIZE}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText(tournament.name, canvasWidth / 2, CANVAS_PADDING - 10);
  
  // Draw rounds
  let xOffset = CANVAS_PADDING;
  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
    const round = rounds[roundIndex];
    const ySpacing = canvasHeight / (round.matchups.length + 1);
    
    // Round label
    ctx.fillStyle = '#B5BAC1';
    ctx.font = `bold ${FONT_SIZE + 2}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(getRoundDisplayName(round.name), xOffset + POSTER_WIDTH / 2, CANVAS_PADDING + 40);
    
    // Draw matchups
    for (let i = 0; i < round.matchups.length; i++) {
      const matchup = round.matchups[i];
      const yPos = ySpacing * (i + 1);
      
      await drawMatchup(ctx, matchup, xOffset, yPos, knockoutResults);
      
      // Draw connector lines to next round (except for finals)
      if (roundIndex < rounds.length - 1) {
        drawConnectorLine(ctx, xOffset, yPos, roundIndex, i, round.matchups.length, ySpacing);
      }
    }
    
    xOffset += ROUND_SPACING;
  }
  
  // Draw champion if exists
  if (tournament.winner) {
    drawChampion(ctx, tournament.winner, canvasWidth - CANVAS_PADDING - 150, canvasHeight / 2);
  }
  
  return canvas.toBuffer('image/png');
}

/**
 * Get display name for round
 */
function getRoundDisplayName(roundKey) {
  const names = {
    'round_of_32': 'Round of 32',
    'round_of_16': 'Round of 16',
    'quarterfinals': 'Quarterfinals',
    'semifinals': 'Semifinals',
    'finals': 'Finals'
  };
  return names[roundKey] || roundKey;
}



/**
 * Draw a single matchup
 */
async function drawMatchup(ctx, matchup, x, y, knockoutResults) {
  const { movie1, movie2, id, status } = matchup;
  const result = knockoutResults?.[id];
  const winner = result?.winner; // 'movie1' or 'movie2'
  
  // Matchup box background
  ctx.fillStyle = '#313338';
  ctx.strokeStyle = '#1E1F22';
  ctx.lineWidth = 2;
  
  // Movie 1
  const m1Y = y - MATCHUP_SPACING / 3;
  drawParticipant(ctx, movie1, x, m1Y, winner === 'movie1');
  
  // Movie 2
  const m2Y = y + MATCHUP_SPACING / 3;
  drawParticipant(ctx, movie2, x, m2Y, winner === 'movie2');
  
  // VS label in between
  ctx.fillStyle = '#5865F2';
  ctx.font = `bold ${FONT_SIZE}px Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('VS', x + POSTER_WIDTH / 2, y);
}

/**
 * Draw a single participant
 */
function drawParticipant(ctx, movie, x, y, isWinner) {
  if (!movie || !movie.title) {
    // Empty slot (TBD)
    ctx.fillStyle = '#1E1F22';
    ctx.fillRect(x, y - POSTER_HEIGHT / 2, POSTER_WIDTH, POSTER_HEIGHT);
    ctx.strokeStyle = '#313338';
    ctx.strokeRect(x, y - POSTER_HEIGHT / 2, POSTER_WIDTH, POSTER_HEIGHT);
    
    ctx.fillStyle = '#4E5058';
    ctx.font = `${FONT_SIZE}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('TBD', x + POSTER_WIDTH / 2, y);
    return;
  }
  
  // Participant box
  const boxColor = isWinner ? '#3BA55D' : '#313338';
  ctx.fillStyle = boxColor;
  ctx.fillRect(x, y - POSTER_HEIGHT / 2, POSTER_WIDTH, POSTER_HEIGHT);
  
  // Border
  ctx.strokeStyle = isWinner ? '#2D7D46' : '#1E1F22';
  ctx.lineWidth = isWinner ? 3 : 2;
  ctx.strokeRect(x, y - POSTER_HEIGHT / 2, POSTER_WIDTH, POSTER_HEIGHT);
  
  // Title (truncated)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${FONT_SIZE}px Arial`;
  ctx.textAlign = 'center';
  
  // Multi-line text with better wrapping
  const lines = wrapText(movie.title, POSTER_WIDTH - 20, ctx, 4);
  const lineHeight = FONT_SIZE + 3;
  const startY = y - ((lines.length - 1) * lineHeight / 2); // Center vertically
  lines.forEach((line, index) => {
    ctx.fillText(line, x + POSTER_WIDTH / 2, startY + (index * lineHeight));
  });
  
  // Type indicator (winner/runnerup/wildcard)
  if (movie.type) {
    ctx.fillStyle = '#B5BAC1';
    ctx.font = `${FONT_SIZE - 2}px Arial`;
    const typeLabel = movie.type === 'winner' ? 'W' : movie.type === 'runnerup' ? 'R' : 'WC';
    ctx.fillText(typeLabel, x + POSTER_WIDTH / 2, y + POSTER_HEIGHT / 2 - 8);
  }
  
  // Winner checkmark
  if (isWinner) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('✓', x + POSTER_WIDTH - 15, y - POSTER_HEIGHT / 2 + 20);
  }
}

/**
 * Draw connector line between rounds
 */
function drawConnectorLine(ctx, x, y, roundIndex, matchupIndex, totalRounds, ySpacing) {
  ctx.strokeStyle = '#4E5058';
  ctx.lineWidth = 2;
  
  const startX = x + POSTER_WIDTH;
  const endX = startX + (ROUND_SPACING - POSTER_WIDTH);
  const startY = y;
  
  // Calculate next round's matchup Y position
  const nextYSpacing = ySpacing * 2;
  const nextMatchupIndex = Math.floor(matchupIndex / 2);
  const nextY = nextYSpacing * (nextMatchupIndex + 1);
  
  // Draw L-shaped connector
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX + 30, startY);
  ctx.lineTo(startX + 30, nextY);
  ctx.lineTo(endX, nextY);
  ctx.stroke();
}

/**
 * Draw champion section
 */
function drawChampion(ctx, winner, x, y) {
  // Trophy icon background
  ctx.fillStyle = '#FEE75C';
  ctx.beginPath();
  ctx.arc(x, y, 50, 0, Math.PI * 2);
  ctx.fill();
  
  // Trophy emoji
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏆', x, y);
  
  // Champion label
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${FONT_SIZE + 4}px Arial`;
  ctx.textBaseline = 'top';
  ctx.fillText('CHAMPION', x, y + 60);
  
  // Winner title
  ctx.font = `${FONT_SIZE}px Arial`;
  const lines = wrapText(winner.title, 140, ctx);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + 85 + (index * 18));
  });
}

/**
 * Wrap text to multiple lines with ellipsis
 */
function wrapText(text, maxWidth, ctx, maxLines = 4) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0] || '';
  
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + ' ' + word;
    const width = ctx.measureText(testLine).width;
    
    if (width < maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
      
      // If we're approaching max lines, check if we need ellipsis
      if (lines.length >= maxLines - 1 && i < words.length - 1) {
        // More words remain, add ellipsis
        const remaining = words.slice(i).join(' ');
        const ellipsisTest = currentLine + ' ' + remaining;
        if (ctx.measureText(ellipsisTest).width >= maxWidth) {
          // Truncate with ellipsis
          while (ctx.measureText(currentLine + '...').width > maxWidth && currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
          }
          currentLine += '...';
          lines.push(currentLine);
          return lines;
        }
      }
    }
  }
  
  lines.push(currentLine);
  return lines.slice(0, maxLines);
}

/**
 * Fetch TMDB poster URL for a movie/TV show title
 * @param {string} title - Movie or TV show title
 * @returns {Promise<string|null>} Poster URL or null
 */
export async function fetchTMDBPoster(title) {
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${config.tmdb.apiKey}&query=${encodeURIComponent(title)}&page=1`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const item = data.results[0];
      if (item.poster_path) {
        return `https://image.tmdb.org/t/p/w500${item.poster_path}`;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching TMDB poster:', error);
    return null;
  }
}
