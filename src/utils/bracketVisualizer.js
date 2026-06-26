import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { config } from '../config.js';
import { existsSync } from 'fs';

// Register Arial font if available
const arialPaths = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',             // Ubuntu/Debian (most common)
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', // Ubuntu alternative
  '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf',           // MS Core fonts
  '/Library/Fonts/Arial.ttf',                                    // macOS
  '/System/Library/Fonts/Supplemental/Arial.ttf',                // macOS alternative
];

let fontLoaded = false;
console.log('[BracketVisualizer] Checking font paths...');
for (const path of arialPaths) {
  const exists = existsSync(path);
  console.log(`[BracketVisualizer] ${path}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
  if (exists) {
    try {
      GlobalFonts.registerFromPath(path, 'Arial');
      fontLoaded = true;
      console.log(`[BracketVisualizer] ✓ Successfully loaded font from: ${path}`);
      break;
    } catch (error) {
      console.error(`[BracketVisualizer] ✗ Failed to load font from ${path}:`, error.message);
    }
  }
}

if (!fontLoaded) {
  console.warn('[BracketVisualizer] ⚠️  Could not load Arial font, using system default');
}

const PARTICIPANT_WIDTH = 240;
const PARTICIPANT_HEIGHT = 50;
const MATCHUP_GAP = 10; // Gap between two participants in a matchup
const MATCHUP_SPACING = 140; // Vertical space for each complete matchup (both participants + gap)
const ROUND_SPACING = 340;
const CANVAS_PADDING = 60;
const FONT_SIZE = 14;
const TITLE_FONT_SIZE = 28;
const CONNECTOR_EXTEND = 40; // How far connector lines extend horizontally

// Color scheme with primary blue rgb(78, 197, 237)
const COLORS = {
  primary: 'rgb(78, 197, 237)',
  background: 'rgb(25, 30, 35)',      // Dark with blue tint
  cardBg: 'rgb(35, 42, 48)',          // Slightly lighter with blue tint
  cardBorder: 'rgb(50, 60, 68)',      // Border with blue tint
  text: 'rgb(230, 235, 240)',         // Light text with blue tint
  textMuted: 'rgb(140, 150, 160)',    // Muted text with blue tint
  winner: 'rgb(78, 197, 237)',        // Primary blue for winners
  connectorLine: 'rgb(78, 110, 130)'  // Connector lines with blue tint
};

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
  
  // Determine round order and get rounds
  const roundOrder = ['round_of_32', 'round_of_16', 'quarterfinals', 'semifinals', 'finals'];
  const rounds = roundOrder
    .filter(round => roundGroups[round])
    .map(round => ({ name: round, matchups: roundGroups[round].sort((a, b) => a.position - b.position) }));
  
  if (rounds.length === 0) {
    throw new Error('No rounds found in bracket');
  }
  
  // Split bracket into left and right sides (except finals)
  const leftSide = [];
  const rightSide = [];
  const finalsRound = rounds[rounds.length - 1].name === 'finals' ? rounds[rounds.length - 1] : null;
  const bracketRounds = finalsRound ? rounds.slice(0, -1) : rounds;
  
  // Split each round in half
  bracketRounds.forEach(round => {
    const midpoint = Math.ceil(round.matchups.length / 2);
    leftSide.push({
      name: round.name,
      matchups: round.matchups.slice(0, midpoint)
    });
    rightSide.push({
      name: round.name,
      matchups: round.matchups.slice(midpoint)
    });
  });
  
  // Calculate canvas dimensions
  const numRounds = bracketRounds.length;
  const maxMatchupsPerSide = Math.max(...leftSide.map(r => r.matchups.length));
  const roundWidth = ROUND_SPACING;
  const finalsWidth = 400;
  const canvasWidth = (numRounds * 2 * roundWidth) + finalsWidth + (CANVAS_PADDING * 2);
  const canvasHeight = (maxMatchupsPerSide * MATCHUP_SPACING) + (CANVAS_PADDING * 2) + 100;
  
  // Create canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Title
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold ${TITLE_FONT_SIZE}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(tournament.name, canvasWidth / 2, CANVAS_PADDING - 10);
  
  // Draw left side (first round furthest left, progressing right towards center)
  let xOffset = CANVAS_PADDING;
  for (let i = 0; i < leftSide.length; i++) {
    const round = leftSide[i];
    await drawRoundColumn(ctx, round, xOffset, canvasHeight, knockoutResults, 'left', i, leftSide.length);
    xOffset += roundWidth;
  }
  
  // Draw finals in center
  if (finalsRound && finalsRound.matchups.length > 0) {
    const finalsX = (canvasWidth / 2) - (PARTICIPANT_WIDTH / 2);
    const finalsY = canvasHeight / 2;
    await drawMatchup(ctx, finalsRound.matchups[0], finalsX, finalsY, knockoutResults);
    
    // Finals label
    ctx.fillStyle = COLORS.primary;
    ctx.font = `bold ${FONT_SIZE + 2}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Finals', canvasWidth / 2, CANVAS_PADDING + 40);
  }
  
  // Draw right side (first round furthest right, progressing left towards center)
  xOffset = canvasWidth - CANVAS_PADDING - PARTICIPANT_WIDTH;
  for (let i = 0; i < rightSide.length; i++) {
    const round = rightSide[i]; // Draw in same order (first round = most teams)
    await drawRoundColumn(ctx, round, xOffset, canvasHeight, knockoutResults, 'right', i, rightSide.length);
    xOffset -= roundWidth;
  }
  
  // Draw champion if exists
  if (tournament.winner) {
    drawChampion(ctx, tournament.winner, canvasWidth / 2, canvasHeight - CANVAS_PADDING - 50);
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
 * Draw a vertical column of matchups for one round
 */
async function drawRoundColumn(ctx, round, x, canvasHeight, knockoutResults, side, roundIndex, totalRounds) {
  const numMatchups = round.matchups.length;
  const availableHeight = canvasHeight - (CANVAS_PADDING * 2) - 100;
  const ySpacing = availableHeight / (numMatchups + 1);
  
  // Round label
  ctx.fillStyle = COLORS.primary;
  ctx.font = `bold ${FONT_SIZE + 2}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  const labelX = x + (PARTICIPANT_WIDTH / 2);
  ctx.fillText(getRoundDisplayName(round.name), labelX, CANVAS_PADDING + 40);
  
  // Draw each matchup in this round
  for (let i = 0; i < numMatchups; i++) {
    const matchup = round.matchups[i];
    const yPos = CANVAS_PADDING + 100 + (ySpacing * (i + 1));
    
    await drawMatchup(ctx, matchup, x, yPos, knockoutResults);
    
    // Draw connector lines to next round (towards center)
    if (roundIndex < totalRounds - 1) {
      drawMirroredConnector(ctx, x, yPos, side, i, numMatchups, ySpacing);
    }
  }
}

/**
 * Draw connector lines for mirrored bracket layout
 */
function drawMirroredConnector(ctx, x, y, side, matchupIndex, totalMatchups, ySpacing) {
  ctx.strokeStyle = COLORS.connectorLine;
  ctx.lineWidth = 2;
  
  // Determine direction (left side goes right, right side goes left)
  const direction = side === 'left' ? 1 : -1;
  const startX = side === 'left' ? x + PARTICIPANT_WIDTH : x;
  const endX = startX + (CONNECTOR_EXTEND * direction);
  
  // Horizontal line from matchup to vertical connector
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
  
  // Determine if this matchup is the top (even) or bottom (odd) of a pair
  const isTopOfPair = matchupIndex % 2 === 0;
  const hasPartner = isTopOfPair ? matchupIndex + 1 < totalMatchups : matchupIndex > 0;
  
  if (hasPartner) {
    // Calculate the midpoint Y between this matchup and its pair
    const pairOffset = isTopOfPair ? ySpacing : -ySpacing;
    const partnerY = y + pairOffset;
    const midY = (y + partnerY) / 2;
    
    // Draw vertical line connecting both matchups (only once, from the top matchup)
    if (isTopOfPair) {
      ctx.beginPath();
      ctx.moveTo(endX, y);
      ctx.lineTo(endX, partnerY);
      ctx.stroke();
    }
    
    // Draw horizontal line from midpoint to next round position
    if (isTopOfPair) {
      const nextRoundX = endX + (ROUND_SPACING - CONNECTOR_EXTEND) * direction;
      ctx.beginPath();
      ctx.moveTo(endX, midY);
      ctx.lineTo(nextRoundX, midY);
      ctx.stroke();
    }
  }
}



/**
 * Draw a single matchup (two participants paired together)
 */
async function drawMatchup(ctx, matchup, x, y, knockoutResults) {
  const { movie1, movie2, id, status } = matchup;
  const result = knockoutResults?.[id];
  const winner = result?.winner; // 'movie1' or 'movie2'
  
  // Calculate positions for each participant
  const participant1Y = y - (PARTICIPANT_HEIGHT + MATCHUP_GAP / 2);
  const participant2Y = y + (MATCHUP_GAP / 2);
  
  // Draw matchup container border (groups the two participants visually)
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    x - 3, 
    participant1Y - 3, 
    PARTICIPANT_WIDTH + 6, 
    (PARTICIPANT_HEIGHT * 2) + MATCHUP_GAP + 6
  );
  
  // Draw participants
  drawParticipant(ctx, movie1, x, participant1Y, winner === 'movie1');
  drawParticipant(ctx, movie2, x, participant2Y, winner === 'movie2');
}

/**
 * Draw a single participant
 */
function drawParticipant(ctx, movie, x, y, isWinner) {
  if (!movie || !movie.title) {
    // Empty slot (TBD)
    ctx.fillStyle = COLORS.cardBg;
    ctx.fillRect(x, y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT);
    ctx.strokeStyle = COLORS.cardBorder;
    ctx.strokeRect(x, y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT);
    
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = `${FONT_SIZE}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TBD', x + PARTICIPANT_WIDTH / 2, y + PARTICIPANT_HEIGHT / 2);
    return;
  }
  
  // Participant box
  const boxColor = isWinner ? COLORS.winner : COLORS.cardBg;
  ctx.fillStyle = boxColor;
  ctx.fillRect(x, y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT);
  
  // Border
  ctx.strokeStyle = isWinner ? COLORS.primary : COLORS.cardBorder;
  ctx.lineWidth = isWinner ? 3 : 2;
  ctx.strokeRect(x, y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT);
  
  // Title
  ctx.fillStyle = isWinner ? COLORS.background : COLORS.text;
  ctx.font = `${FONT_SIZE}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  // Truncate text if too long
  const maxWidth = PARTICIPANT_WIDTH - 40;
  let displayText = movie.title;
  let textWidth = ctx.measureText(displayText).width;
  
  if (textWidth > maxWidth) {
    while (ctx.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
      displayText = displayText.slice(0, -1);
    }
    displayText += '...';
  }
  
  ctx.fillText(displayText, x + 10, y + PARTICIPANT_HEIGHT / 2);
  
  // Type indicator (winner/runnerup/wildcard) - small label on left
  if (movie.type) {
    ctx.fillStyle = isWinner ? COLORS.background : COLORS.textMuted;
    ctx.font = `bold ${FONT_SIZE - 2}px Arial, sans-serif`;
    ctx.textAlign = 'left';
    const typeLabel = movie.type === 'winner' ? 'W' : movie.type === 'runnerup' ? 'R' : 'WC';
    ctx.fillText(typeLabel, x + 5, y + 12);
  }
  
  // Winner checkmark
  if (isWinner) {
    ctx.fillStyle = COLORS.background;
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', x + PARTICIPANT_WIDTH - 10, y + PARTICIPANT_HEIGHT / 2);
  }
}

/**
 * Draw connector line between rounds
 */
function drawConnectorLine(ctx, x, y, roundIndex, matchupIndex, totalMatchups, ySpacing) {
  ctx.strokeStyle = COLORS.connectorLine;
  ctx.lineWidth = 2;
  
  // Start from right side of matchup, middle point between two participants
  const startX = x + PARTICIPANT_WIDTH;
  const startY = y;
  
  // Calculate next round's matchup Y position
  const nextYSpacing = ySpacing * 2; // Next round has half the matchups
  const nextMatchupIndex = Math.floor(matchupIndex / 2);
  const nextY = nextYSpacing * (nextMatchupIndex + 1);
  
  // Draw bracket connector
  const midX = startX + CONNECTOR_EXTEND;
  const endX = startX + (ROUND_SPACING - PARTICIPANT_WIDTH);
  
  ctx.beginPath();
  // Horizontal line from matchup
  ctx.moveTo(startX, startY);
}

/**
 * Draw champion section
 */
function drawChampion(ctx, winner, x, y) {
  // Trophy icon background
  ctx.fillStyle = COLORS.primary;
  ctx.beginPath();
  ctx.arc(x, y, 70, 0, Math.PI * 2);
  ctx.fill();
  
  // Trophy emoji
  ctx.font = '64px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏆', x, y);
  
  // Champion label
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold ${FONT_SIZE + 6}px Arial, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText('CHAMPION', x, y + 80);
  
  // Winner title (truncated)
  ctx.font = `${FONT_SIZE + 2}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  const maxWidth = 200;
  let displayText = winner.title;
  let textWidth = ctx.measureText(displayText).width;
  
  if (textWidth > maxWidth) {
    while (ctx.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
      displayText = displayText.slice(0, -1);
    }
    displayText += '...';
  }
  
  ctx.fillText(displayText, x, y + 110);
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
