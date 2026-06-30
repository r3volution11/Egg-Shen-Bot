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
 * Get regional label for a matchup (e.g., "1A", "2C")
 * @param {number} position - Matchup position (0-based)
 * @param {string} round - Round name
 * @returns {string} Regional label
 */
function getRegionalLabel(position, round) {
  // Finals has no region
  if (round === 'finals') {
    return 'Finals';
  }
  
  // Determine total matchups in this round
  const roundSizes = {
    'round_of_32': 16,
    'round_of_16': 8,
    'quarterfinals': 4,
    'semifinals': 2
  };
  
  const totalMatchups = roundSizes[round];
  if (!totalMatchups) return String(position + 1);
  
  // Left region: positions 0 to (totalMatchups/2 - 1)
  // Right region: positions (totalMatchups/2) to (totalMatchups - 1)
  const midpoint = totalMatchups / 2;
  const isLeftRegion = position < midpoint;
  const region = isLeftRegion ? '1' : '2';
  
  // Letter within region (A, B, C, D...)
  const positionInRegion = isLeftRegion ? position : position - midpoint;
  const letter = String.fromCharCode(65 + positionInRegion); // 65 = 'A'
  
  return `${region}${letter}`;
}

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
  
  // Use MATCHUP_SPACING to properly calculate required height for all matchups
  // Each matchup needs (PARTICIPANT_HEIGHT * 2) + MATCHUP_GAP height, plus spacing between matchups
  const matchupTotalHeight = (PARTICIPANT_HEIGHT * 2) + MATCHUP_GAP;
  const requiredHeightForMatchups = (maxMatchupsPerSide * MATCHUP_SPACING);
  
  const roundWidth = ROUND_SPACING;
  const finalsWidth = 400;
  const canvasWidth = (numRounds * 2 * roundWidth) + finalsWidth + (CANVAS_PADDING * 2);
  const canvasHeight = Math.max(
    requiredHeightForMatchups + (CANVAS_PADDING * 2) + 200, // +200 for title and labels
    800 // Minimum height
  );
  
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
  
  // Draw finals in center (1.5x bigger)
  if (finalsRound && finalsRound.matchups.length > 0) {
    const finalsScale = 1.5;
    const finalsX = (canvasWidth / 2) - (PARTICIPANT_WIDTH * finalsScale / 2);
    const finalsY = canvasHeight / 2;
    await drawMatchup(ctx, finalsRound.matchups[0], finalsX, finalsY, knockoutResults, finalsScale, 'finals');
    
    // Finals label
    ctx.fillStyle = COLORS.primary;
    ctx.font = `bold ${(FONT_SIZE + 2) * finalsScale}px Arial, sans-serif`;
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
  
  // Draw champion if exists (check both winner and champion properties)
  const champion = tournament.champion || tournament.winner;
  if (champion) {
    await drawChampion(ctx, champion, canvasWidth / 2, canvasHeight - 280);
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
  
  // Calculate proper spacing for this round
  // Each subsequent round doubles the spacing to center matchups between previous round pairs
  const spacingMultiplier = Math.pow(2, roundIndex);
  const spacing = MATCHUP_SPACING * spacingMultiplier;
  
  // Calculate offset to center matchups properly relative to previous round
  // Offset is half of the accumulated spacing from all previous rounds
  const offset = MATCHUP_SPACING * (spacingMultiplier - 1) / 2;
  
  const startY = CANVAS_PADDING + 150; // Start below title and round label
  
  // Round label
  ctx.fillStyle = COLORS.primary;
  ctx.font = `bold ${FONT_SIZE + 2}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  const labelX = x + (PARTICIPANT_WIDTH / 2);
  ctx.fillText(getRoundDisplayName(round.name), labelX, CANVAS_PADDING + 40);
  
  // Draw each matchup in this round
  for (let i = 0; i < numMatchups; i++) {
    const matchup = round.matchups[i];
    // yPos is the CENTER of the matchup, properly positioned relative to source matchups
    const yPos = startY + offset + (i * spacing);
    
    await drawMatchup(ctx, matchup, x, yPos, knockoutResults, 1, round.name);
    
    // Draw connector lines to next round (towards center)
    if (roundIndex < totalRounds - 1) {
      drawMirroredConnector(ctx, x, yPos, side, i, numMatchups, spacingMultiplier);
    }
  }
}

/**
 * Draw connector lines for mirrored bracket layout
 * @param {number} spacingMultiplier - Spacing multiplier for this round (2^roundIndex)
 */
function drawMirroredConnector(ctx, x, y, side, matchupIndex, totalMatchups, spacingMultiplier) {
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
    // Calculate the partner Y position using proper spacing for this round
    const spacing = MATCHUP_SPACING * spacingMultiplier;
    const pairOffset = isTopOfPair ? spacing : -spacing;
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
 * @param {number} scale - Scale factor for finals (default 1)
 */
async function drawMatchup(ctx, matchup, x, y, knockoutResults, scale = 1, roundName = null) {
  const { movie1, movie2, id, status, position } = matchup;
  const result = knockoutResults?.[id];
  const winner = result?.winner; // 'movie1' or 'movie2'
  
  const width = PARTICIPANT_WIDTH * scale;
  const height = PARTICIPANT_HEIGHT * scale;
  const gap = MATCHUP_GAP * scale;
  
  // Calculate positions for each participant
  const participant1Y = y - (height + gap / 2);
  const participant2Y = y + (gap / 2);
  
  // Draw matchup container border (groups the two participants visually)
  ctx.strokeStyle = COLORS.cardBorder;
  ctx.lineWidth = 2 * scale;
  ctx.strokeRect(
    x - 3 * scale, 
    participant1Y - 3 * scale, 
    width + 6 * scale, 
    (height * 2) + gap + 6 * scale
  );
  
  // Draw regional label above matchup if we have position and round info
  if (typeof position === 'number' && roundName) {
    const regionalLabel = getRegionalLabel(position, roundName);
    ctx.fillStyle = COLORS.primary;
    ctx.font = `bold ${FONT_SIZE}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(regionalLabel, x + (width / 2), participant1Y - 8 * scale);
  }
  
  // Draw participants
  await drawParticipant(ctx, movie1, x, participant1Y, winner === 'movie1', scale);
  await drawParticipant(ctx, movie2, x, participant2Y, winner === 'movie2', scale);
}

/**
 * Extract dominant color from image URL
 */
/**
 * Calculate color difference using simple RGB distance
 */
function colorDistance(rgb1, rgb2) {
  const [r1, g1, b1] = rgb1.split(',').map(Number);
  const [r2, g2, b2] = rgb2.split(',').map(Number);
  return Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2));
}

/**
 * Extract multiple dominant colors from poster image for gradient
 * @param {string} imageUrl - URL of the poster image
 * @returns {Promise<string[]>} Array of 3-4 RGB color strings
 */
async function extractPosterColors(imageUrl) {
  try {
    const img = await loadImage(imageUrl);
    const tempCanvas = createCanvas(img.width, img.height);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);
    
    // Sample pixels from the image
    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    
    // Count color occurrences
    const colorCounts = {};
    const step = 10; // Sample every 10th pixel for performance
    
    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      // Skip transparent or very dark/light pixels
      if (a < 128 || (r + g + b) < 60 || (r + g + b) > 700) continue;
      
      // Round to nearest 30 to group similar colors
      const key = `${Math.round(r / 30) * 30},${Math.round(g / 30) * 30},${Math.round(b / 30) * 30}`;
      colorCounts[key] = (colorCounts[key] || 0) + 1;
    }
    
    // Sort colors by frequency
    const sortedColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color);
    
    // Select diverse colors (filter out colors too similar to already selected ones)
    const selectedColors = [];
    const minDistance = 80; // Minimum color difference threshold
    
    for (const color of sortedColors) {
      if (selectedColors.length === 0) {
        selectedColors.push(color);
      } else {
        // Check if this color is different enough from already selected colors
        const isDifferent = selectedColors.every(selected => 
          colorDistance(color, selected) > minDistance
        );
        if (isDifferent) {
          selectedColors.push(color);
        }
      }
      if (selectedColors.length >= 3) break;
    }
    
    // Ensure we have at least 2 colors
    while (selectedColors.length < 2) {
      selectedColors.push(selectedColors[selectedColors.length - 1] || '50,60,68');
    }
    
    return selectedColors.map(color => `rgb(${color})`);
  } catch (error) {
    console.error('[BracketVisualizer] Error extracting colors:', error.message);
    // Fallback gradient using cardBg
    return [COLORS.cardBg, COLORS.cardBg];
  }
}

/**
 * Draw a single participant
 * @param {number} scale - Scale factor for finals (default 1)
 */
async function drawParticipant(ctx, movie, x, y, isWinner, scale = 1) {
  const width = PARTICIPANT_WIDTH * scale;
  const height = PARTICIPANT_HEIGHT * scale;
  const fontSize = FONT_SIZE * scale;
  
  if (!movie || !movie.title) {
    // Empty slot (TBD)
    ctx.fillStyle = COLORS.cardBg;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = COLORS.cardBorder;
    ctx.strokeRect(x, y, width, height);
    
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TBD', x + width / 2, y + height / 2);
    return;
  }
  
  // Draw poster image and gradient for non-winner participants with posters
  if (!isWinner && movie.posterUrl) {
    try {
      // Load and draw poster image as background
      const posterImg = await loadImage(movie.posterUrl);
      
      // Calculate scaling to cover the box while maintaining aspect ratio
      const posterAspect = posterImg.width / posterImg.height;
      const boxAspect = width / height;
      
      let drawWidth, drawHeight, offsetX, offsetY;
      if (posterAspect > boxAspect) {
        // Poster is wider - fit to height
        drawHeight = height;
        drawWidth = height * posterAspect;
        offsetX = (width - drawWidth) / 2;
        offsetY = 0;
      } else {
        // Poster is taller - fit to width
        drawWidth = width;
        drawHeight = width / posterAspect;
        offsetX = 0;
        offsetY = (height - drawHeight) / 2;
      }
      
      // Save context and clip to box
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();
      
      // Draw poster at reduced opacity
      ctx.globalAlpha = 0.5;
      ctx.drawImage(posterImg, x + offsetX, y + offsetY, drawWidth, drawHeight);
      ctx.globalAlpha = 1.0;
      
      // Restore context
      ctx.restore();
    } catch (error) {
      console.error('[BracketVisualizer] Error loading poster image:', error.message);
      // Fall back to solid color if poster fails to load
      ctx.fillStyle = COLORS.cardBg;
      ctx.fillRect(x, y, width, height);
    }
    
    // Extract colors and create gradient overlay
    const colors = await extractPosterColors(movie.posterUrl);
    
    // Create extended diagonal gradient for subtle color transition
    const gradientExtend = 2.5;
    const gradient = ctx.createLinearGradient(
      x - width * 0.5, 
      y - height * 0.5, 
      x + width * gradientExtend, 
      y + height * gradientExtend
    );
    
    if (colors.length >= 3) {
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.5, colors[1]);
      gradient.addColorStop(1, colors[2]);
    } else if (colors.length === 2) {
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[1]);
    } else {
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[0]);
    }
    
    // Apply gradient overlay with transparency
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1.0;
    
    // Add dark overlay to ensure text visibility
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, width, height);
  } else {
    // Solid color for winners or items without posters
    ctx.fillStyle = isWinner ? COLORS.winner : COLORS.cardBg;
    ctx.fillRect(x, y, width, height);
  }
  
  // Border
  ctx.strokeStyle = isWinner ? COLORS.primary : COLORS.cardBorder;
  ctx.lineWidth = isWinner ? 3 * scale : 2 * scale;
  ctx.strokeRect(x, y, width, height);
  
  // Title - always use white for visibility
  ctx.fillStyle = COLORS.text;
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  // Truncate text if too long
  const maxWidth = width - 40 * scale;
  let displayText = movie.title;
  let textWidth = ctx.measureText(displayText).width;
  
  if (textWidth > maxWidth) {
    while (ctx.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
      displayText = displayText.slice(0, -1);
    }
    displayText += '...';
  }
  
  ctx.fillText(displayText, x + 10 * scale, y + height / 2);
  
  // Type indicator (winner/runnerup/wildcard) - small label on left
  if (movie.type) {
    ctx.fillStyle = isWinner ? COLORS.background : COLORS.textMuted;
    ctx.font = `bold ${(FONT_SIZE - 2) * scale}px Arial, sans-serif`;
    ctx.textAlign = 'left';
    const typeLabel = movie.type === 'winner' ? 'W' : movie.type === 'runnerup' ? 'R' : 'WC';
    ctx.fillText(typeLabel, x + 5 * scale, y + 12 * scale);
  }
  
  // Winner checkmark
  if (isWinner) {
    ctx.fillStyle = COLORS.background;
    ctx.font = `bold ${20 * scale}px Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', x + width - 10 * scale, y + height / 2);
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
 * Helper function to draw a rounded rectangle path
 */
function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw champion section - large rectangular card with poster
 */
async function drawChampion(ctx, winner, x, y) {
  const width = 450;
  const height = 180;
  const borderRadius = 12;
  
  // Center the card at x position
  const cardX = x - (width / 2);
  const cardY = y - (height / 2);
  
  // Draw poster background if available
  if (winner.posterUrl) {
    try {
      const posterImg = await loadImage(winner.posterUrl);
      
      // Calculate scaling to cover the box
      const posterAspect = posterImg.width / posterImg.height;
      const boxAspect = width / height;
      
      let drawWidth, drawHeight, offsetX, offsetY;
      if (posterAspect > boxAspect) {
        drawHeight = height;
        drawWidth = height * posterAspect;
        offsetX = (width - drawWidth) / 2;
        offsetY = 0;
      } else {
        drawWidth = width;
        drawHeight = width / posterAspect;
        offsetX = 0;
        offsetY = (height - drawHeight) / 2;
      }
      
      // Save context and clip to rounded box
      ctx.save();
      roundRectPath(ctx, cardX, cardY, width, height, borderRadius);
      ctx.clip();
      
      // Draw poster at reduced opacity
      ctx.globalAlpha = 0.6;
      ctx.drawImage(posterImg, cardX + offsetX, cardY + offsetY, drawWidth, drawHeight);
      ctx.globalAlpha = 1.0;
      
      ctx.restore();
      
      // Extract colors and create gradient overlay
      const colors = await extractPosterColors(winner.posterUrl);
      const gradient = ctx.createLinearGradient(
        cardX - width * 0.5, 
        cardY - height * 0.5, 
        cardX + width * 1.5, 
        cardY + height * 1.5
      );
      
      if (colors.length >= 3) {
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(0.5, colors[1]);
        gradient.addColorStop(1, colors[2]);
      } else if (colors.length === 2) {
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[1]);
      } else {
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[0]);
      }
      
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = gradient;
      roundRectPath(ctx, cardX, cardY, width, height, borderRadius);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      
      // Dark overlay for text visibility
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      roundRectPath(ctx, cardX, cardY, width, height, borderRadius);
      ctx.fill();
    } catch (error) {
      console.error('[BracketVisualizer] Error loading champion poster:', error.message);
      // Fallback to gradient background
      const gradient = ctx.createLinearGradient(cardX, cardY, cardX + width, cardY + height);
      gradient.addColorStop(0, COLORS.primary);
      gradient.addColorStop(1, COLORS.cardBg);
      ctx.fillStyle = gradient;
      roundRectPath(ctx, cardX, cardY, width, height, borderRadius);
      ctx.fill();
    }
  } else {
    // No poster - use gradient background
    const gradient = ctx.createLinearGradient(cardX, cardY, cardX + width, cardY + height);
    gradient.addColorStop(0, COLORS.primary);
    gradient.addColorStop(1, COLORS.cardBg);
    ctx.fillStyle = gradient;
    roundRectPath(ctx, cardX, cardY, width, height, borderRadius);
    ctx.fill();
  }
  
  // Border - thick gold border for champion
  ctx.strokeStyle = '#FFD700'; // Gold
  ctx.lineWidth = 4;
  roundRectPath(ctx, cardX, cardY, width, height, borderRadius);
  ctx.stroke();
  
  // "CHAMPION" label - top center
  ctx.fillStyle = '#FFD700'; // Gold text
  ctx.font = `bold ${28}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('CHAMPION', x, cardY + 20);
  
  // Winner title - large and centered
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold ${32}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const maxWidth = width - 100;
  let displayText = winner.title;
  let textWidth = ctx.measureText(displayText).width;
  
  if (textWidth > maxWidth) {
    while (ctx.measureText(displayText + '...').width > maxWidth && displayText.length > 0) {
      displayText = displayText.slice(0, -1);
    }
    displayText += '...';
  }
  
  ctx.fillText(displayText, x, cardY + height - 50);
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

/**
 * Generate a complete tournament visualization (groups + knockout path)
 * Similar to March Madness or World Cup brackets that show the entire tournament structure
 * @param {Object} tournament - Tournament data
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateFullTournamentView(tournament) {
  const { groups, name, status } = tournament;
  const groupIds = Object.keys(groups).sort();
  const groupCount = groupIds.length;
  
  // Calculate dimensions
  const GROUP_WIDTH = 300;
  const GROUP_HEIGHT = 280;
  const GROUP_MARGIN = 30;
  const GROUPS_PER_ROW = 4;
  
  const rows = Math.ceil(groupCount / GROUPS_PER_ROW);
  const cols = Math.min(groupCount, GROUPS_PER_ROW);
  
  const canvasWidth = (cols * (GROUP_WIDTH + GROUP_MARGIN)) + GROUP_MARGIN;
  const canvasHeight = (rows * (GROUP_HEIGHT + GROUP_MARGIN)) + GROUP_MARGIN + 100; // +100 for title
  
  // Create canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Title
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold ${TITLE_FONT_SIZE}px ${fontLoaded ? 'Arial' : 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.fillText(name, canvasWidth / 2, 50);
  
  // Status subtitle
  ctx.font = `${FONT_SIZE + 2}px ${fontLoaded ? 'Arial' : 'sans-serif'}`;
  ctx.fillStyle = COLORS.textMuted;
  const statusText = status === 'setup' ? 'Tournament Setup' : 'Group Stage';
  ctx.fillText(statusText, canvasWidth / 2, 75);
  
  // Draw each group
  groupIds.forEach((groupId, index) => {
    const group = groups[groupId];
    const row = Math.floor(index / GROUPS_PER_ROW);
    const col = index % GROUPS_PER_ROW;
    
    const x = GROUP_MARGIN + (col * (GROUP_WIDTH + GROUP_MARGIN));
    const y = 100 + GROUP_MARGIN + (row * (GROUP_HEIGHT + GROUP_MARGIN));
    
    // Group card background
    ctx.fillStyle = COLORS.cardBg;
    ctx.fillRect(x, y, GROUP_WIDTH, GROUP_HEIGHT);
    
    // Group card border
    ctx.strokeStyle = COLORS.cardBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, GROUP_WIDTH, GROUP_HEIGHT);
    
    // Group header
    ctx.fillStyle = COLORS.primary;
    ctx.fillRect(x, y, GROUP_WIDTH, 40);
    
    ctx.fillStyle = COLORS.background;
    ctx.font = `bold ${FONT_SIZE + 4}px ${fontLoaded ? 'Arial' : 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.fillText(`Group ${groupId}`, x + GROUP_WIDTH / 2, y + 26);
    
    // Movie titles and votes
    const titleY = y + 60;
    const lineHeight = 50;
    
    ctx.textAlign = 'left';
    ctx.font = `${FONT_SIZE}px ${fontLoaded ? 'Arial' : 'sans-serif'}`;
    
    group.movies.forEach((movie, i) => {
      const movieY = titleY + (i * lineHeight);
      const voteCount = movie.votes ? movie.votes.length : 0;
      
      // Position indicator
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText(`${i + 1}.`, x + 15, movieY);
      
      // Movie title (truncated if too long)
      ctx.fillStyle = COLORS.text;
      let titleText = movie.title;
      if (titleText.length > 25) {
        titleText = titleText.substring(0, 22) + '...';
      }
      ctx.fillText(titleText, x + 40, movieY);
      
      // Vote count (if voting has started)
      if (group.votingOpen || group.votingClosed) {
        ctx.fillStyle = COLORS.textMuted;
        ctx.textAlign = 'right';
        ctx.fillText(`${voteCount}`, x + GROUP_WIDTH - 15, movieY);
        ctx.textAlign = 'left';
      }
    });
    
    // Voting status indicator
    if (group.votingOpen) {
      ctx.fillStyle = 'rgb(88, 197, 77)'; // Green
      ctx.font = `bold ${FONT_SIZE - 2}px ${fontLoaded ? 'Arial' : 'sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.fillText('🗳️ VOTING OPEN', x + GROUP_WIDTH / 2, y + GROUP_HEIGHT - 15);
    } else if (group.votingClosed) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = `bold ${FONT_SIZE - 2}px ${fontLoaded ? 'Arial' : 'sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.fillText('🔒 CLOSED', x + GROUP_WIDTH / 2, y + GROUP_HEIGHT - 15);
    }
  });
  
  // Footer with instructions
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `${FONT_SIZE - 2}px ${fontLoaded ? 'Arial' : 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.fillText('Use /bracket status for live standings • /bracket help for commands', canvasWidth / 2, canvasHeight - 20);
  
  return canvas.toBuffer('image/png');
}
