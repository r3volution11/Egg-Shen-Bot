import { createCanvas } from '@napi-rs/canvas';
import { config } from '../config.js';
import { bracketWithWinnersSeated, winnerSide } from './bracketProgress.js';
import { seededTitle } from './tournamentUI.js';
// Fonts, posters and the trophy come from the shared drawing kit. The bot
// ships its own fonts (assets/fonts), so the bracket no longer goes looking
// for Arial in five system paths, logging each, on every start.
import {
  CANVAS_COLORS, registerFonts, font, setFont, fitText, drawCoverImage, drawKitIcon,
  loadImageCached, extractPosterColors, drawTrophyIcon, roundRectPath,
} from './canvasKit.js';

const PARTICIPANT_WIDTH = 240;
const PARTICIPANT_HEIGHT = 50;
const MATCHUP_GAP = 10; // Gap between two participants in a matchup
const MATCHUP_SPACING = 140; // Vertical space for each complete matchup (both participants + gap)
const ROUND_SPACING = 340;
const CANVAS_PADDING = 60;
const FONT_SIZE = 14;
const TITLE_FONT_SIZE = 28;
const CONNECTOR_EXTEND = 40; // How far connector lines extend horizontally
// A matchup's winner is drawn this much larger, around the same centre. Kept
// small: the two titles in a matchup are only MATCHUP_GAP apart.
const WINNER_SCALE = 1.08;

// Color scheme with primary blue rgb(78, 197, 237) (canvasKit.CANVAS_COLORS)
const COLORS = CANVAS_COLORS;

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
  const { knockoutResults, phase } = tournament;
  // Each decided winner shown in their next matchup straight away, not as
  // "TBD" until the whole round is over (bracketProgress.js)
  const knockoutBracket = bracketWithWinnersSeated(tournament.knockoutBracket);
  registerFonts();
  
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
  setFont(ctx, TITLE_FONT_SIZE, { weight: 700 }, tournament.name);
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
    ctx.font = font((FONT_SIZE + 2) * finalsScale, { weight: 700 });
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
    await drawChampion(ctx, champion, canvasWidth / 2, canvasHeight - 350);
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
  ctx.font = font(FONT_SIZE + 2, { weight: 700 });
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
  // Results store the winning title; this compared it with 'movie1' and
  // 'movie2', so no winner was ever highlighted (winnerSide)
  const winner = winnerSide(matchup, knockoutResults?.[id]);
  
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
    ctx.font = font(FONT_SIZE, { weight: 700 });
    ctx.textAlign = 'center';
    // Set, not inherited: the last title drawn left it at 'middle', which
    // dropped every label but the first onto the frame, touching an
    // enlarged winner's tile
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(regionalLabel, x + (width / 2), participant1Y - 8 * scale);
  }
  
  // Draw participants, the winner last: its tile is enlarged and casts a
  // shadow, which the other title would otherwise paint over
  const drawFirst = () => drawParticipant(ctx, movie1, x, participant1Y, winner === 'movie1', scale);
  const drawSecond = () => drawParticipant(ctx, movie2, x, participant2Y, winner === 'movie2', scale);
  if (winner === 'movie1') {
    await drawSecond();
    await drawFirst();
  } else {
    await drawFirst();
    await drawSecond();
  }
}

/**
 * Draw a single participant
 * @param {number} scale - Scale factor for finals (default 1)
 */
async function drawParticipant(ctx, movie, x, y, isWinner, scale = 1) {
  // A winner looks like any other title, just a little larger (grown around
  // its centre) and with a trophy. It used to be filled solid light blue,
  // which hid its poster and made it the one tile unlike the rest.
  if (isWinner) {
    x -= PARTICIPANT_WIDTH * scale * (WINNER_SCALE - 1) / 2;
    y -= PARTICIPANT_HEIGHT * scale * (WINNER_SCALE - 1) / 2;
    scale *= WINNER_SCALE;
  }
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
    ctx.font = font(fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TBD', x + width / 2, y + height / 2);
    return;
  }
  
  // Lift the winner off the page: a soft shadow cast by a backing in the
  // page colour, so the tile itself still renders exactly like the others
  if (isWinner) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 10 * scale;
    ctx.shadowOffsetY = 3 * scale;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  // Draw poster image and gradient for participants with posters. Posters
  // come through the kit's cache: the whole bracket is redrawn after every
  // round, and each poster used to be downloaded twice per drawing (once
  // here, once for its colours).
  if (movie.posterUrl) {
    const posterImg = await loadImageCached(movie.posterUrl);
    if (posterImg) {
      // Covering the box, at reduced opacity
      drawCoverImage(ctx, posterImg, x, y, width, height, { alpha: 0.5 });
    } else {
      // Fall back to solid color if poster fails to load
      ctx.fillStyle = COLORS.cardBg;
      ctx.fillRect(x, y, width, height);
    }
    
    // Extract colors and create gradient overlay
    const colors = await extractPosterColors(posterImg);
    
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
    // Solid color for items without posters
    ctx.fillStyle = COLORS.cardBg;
    ctx.fillRect(x, y, width, height);
  }

  // Border
  ctx.strokeStyle = isWinner ? COLORS.primary : COLORS.cardBorder;
  ctx.lineWidth = isWinner ? 3 * scale : 2 * scale;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = COLORS.text;
  const fullTitle = seededTitle(movie); // "(1) Halloween" in a seeded bracket
  setFont(ctx, fontSize, {}, fullTitle);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Truncate text if too long, leaving room at the right for a winner's trophy
  const maxWidth = width - (isWinner ? 48 : 40) * scale;
  ctx.fillText(fitText(ctx, fullTitle, maxWidth), x + 10 * scale, y + height / 2);
  
  // How it qualified from the groups (winner/runner-up/wildcard) - small
  // label on left. This read `type`, which every title has (its media type),
  // so straight-bracket titles were all labelled "WC". Tournaments started
  // before `qualifiedAs` existed still carry it in `type`.
  const qualified = movie.qualifiedAs || (['winner', 'runnerup', 'wildcard'].includes(movie.type) ? movie.type : null);
  if (qualified) {
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = font((FONT_SIZE - 2) * scale, { weight: 700 });
    ctx.textAlign = 'left';
    const typeLabel = qualified === 'winner' ? 'W' : qualified === 'runnerup' ? 'R' : 'WC';
    ctx.fillText(typeLabel, x + 5 * scale, y + 12 * scale);
  }

  if (isWinner) {
    drawTrophyIcon(ctx, x + width - 22 * scale, y + height / 2, 32 * scale);
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

// drawTrophyIcon, drawSparkle and roundRectPath moved to canvasKit.js

/**
 * Draw champion section - large rectangular card with poster
 */
async function drawChampion(ctx, winner, x, y) {
  const width = 350;
  const height = 525; // 2:3 aspect ratio for movie posters
  const borderRadius = 24;
  const textBandHeight = 60;
  
  // Center the card at x position
  const cardX = x - (width / 2);
  const cardY = y - (height / 2);
  
  // Draw poster background if available - full visibility for champion!
  const posterImg = winner.posterUrl ? await loadImageCached(winner.posterUrl) : null;
  if (posterImg) {
    drawCoverImage(ctx, posterImg, cardX, cardY, width, height, { radius: borderRadius });
  } else {
    // No poster, or it failed to load - use gradient background
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
  
  // Top dark band for "CHAMPION" text
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.save();
  // Create clipping path for top rounded corners
  roundRectPath(ctx, cardX, cardY, width, textBandHeight, borderRadius);
  ctx.clip();
  ctx.fillRect(cardX, cardY, width, textBandHeight);
  ctx.restore();
  
  // "CHAMPION" label in top band
  ctx.fillStyle = '#FFD700'; // Gold text
  ctx.font = font(32, { weight: 700 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHAMPION', x, cardY + textBandHeight / 2);

  // A trophy either side of the word. One used to sit above the card, in
  // the ~20px between it and the finals, so it covered the bottom of the
  // finals winner's tile — which now carries a trophy of its own.
  const trophyOffset = ctx.measureText('CHAMPION').width / 2 + 30;
  drawTrophyIcon(ctx, x - trophyOffset, cardY + textBandHeight / 2, 34);
  drawTrophyIcon(ctx, x + trophyOffset, cardY + textBandHeight / 2, 34);

  // Bottom dark band for title text
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.save();
  // Create clipping path for bottom rounded corners
  roundRectPath(ctx, cardX, cardY + height - textBandHeight, width, textBandHeight, borderRadius);
  ctx.clip();
  ctx.fillRect(cardX, cardY + height - textBandHeight, width, textBandHeight);
  ctx.restore();
  
  // Winner title in bottom band
  ctx.fillStyle = COLORS.text;
  setFont(ctx, 28, { weight: 700 }, winner.title);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, winner.title, width - 30), x, cardY + height - (textBandHeight / 2));
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
  registerFonts();
  
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
  setFont(ctx, TITLE_FONT_SIZE, { weight: 700 }, name);
  ctx.textAlign = 'center';
  ctx.fillText(name, canvasWidth / 2, 50);
  
  // Status subtitle
  ctx.font = font(FONT_SIZE + 2);
  ctx.fillStyle = COLORS.textMuted;
  const statusText = status === 'setup' ? 'Tournament Setup' : 'Group Stage';
  ctx.fillText(statusText, canvasWidth / 2, 75);
  
  // Draw each group (in turn: the kit icons are drawn with an await)
  for (const [index, groupId] of groupIds.entries()) {
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
    ctx.font = font(FONT_SIZE + 4, { weight: 700 });
    ctx.textAlign = 'center';
    ctx.fillText(`Group ${groupId}`, x + GROUP_WIDTH / 2, y + 26);
    
    // Movie titles and votes
    const titleY = y + 60;
    const lineHeight = 50;
    
    ctx.textAlign = 'left';
    
    group.movies.forEach((movie, i) => {
      const movieY = titleY + (i * lineHeight);
      const voteCount = movie.votes ? movie.votes.length : 0;
      
      // Position indicator
      ctx.font = font(FONT_SIZE);
      ctx.fillStyle = COLORS.textMuted;
      ctx.fillText(`${i + 1}.`, x + 15, movieY);
      
      // Movie title (cut to fit, clear of the vote count)
      ctx.fillStyle = COLORS.text;
      setFont(ctx, FONT_SIZE, {}, movie.title);
      ctx.fillText(fitText(ctx, movie.title, GROUP_WIDTH - 40 - 45), x + 40, movieY);
      ctx.font = font(FONT_SIZE);
      
      // Vote count (if voting has started)
      if (group.votingOpen || group.votingClosed) {
        ctx.fillStyle = COLORS.textMuted;
        ctx.textAlign = 'right';
        ctx.fillText(`${voteCount}`, x + GROUP_WIDTH - 15, movieY);
        ctx.textAlign = 'left';
      }
    });
    
    // Voting status indicator: the kit's ballot box or padlock, then the
    // words. These were 🗳️ and 🔒 characters, which drew as empty boxes on
    // the server (no colour-emoji font).
    if (group.votingOpen) {
      ctx.fillStyle = 'rgb(88, 197, 77)'; // Green
      await iconLabel(ctx, 'ballot', 'VOTING OPEN', x + GROUP_WIDTH / 2, y + GROUP_HEIGHT - 15, FONT_SIZE - 2);
    } else if (group.votingClosed) {
      ctx.fillStyle = COLORS.textMuted;
      await iconLabel(ctx, 'lock', 'CLOSED', x + GROUP_WIDTH / 2, y + GROUP_HEIGHT - 15, FONT_SIZE - 2);
    }
  }
  
  // Footer with instructions
  ctx.fillStyle = COLORS.textMuted;
  ctx.font = font(FONT_SIZE - 2);
  ctx.textAlign = 'center';
  ctx.fillText('Use /bracket status for live standings • /bracket help for commands', canvasWidth / 2, canvasHeight - 20);
  
  return canvas.toBuffer('image/png');
}

/**
 * A kit icon and a bold label, centred together on cx with the text's
 * baseline at `baseline`, in the current fill colour. The icon is half as
 * tall again as the text; without its PNG the label is centred alone.
 */
async function iconLabel(ctx, code, text, cx, baseline, px) {
  ctx.font = font(px, { weight: 700 });
  const icon = Math.round(px * 1.6);
  const gap = Math.round(px * 0.4);
  const textWidth = ctx.measureText(text).width;
  const left = cx - (icon + gap + textWidth) / 2;
  // The icon centred on the capitals (about 0.35 em above the baseline)
  const drawn = await drawKitIcon(ctx, code, left, baseline - px * 0.35 - icon / 2, icon);
  ctx.textAlign = drawn ? 'left' : 'center';
  ctx.fillText(text, drawn ? left + icon + gap : cx, baseline);
}
