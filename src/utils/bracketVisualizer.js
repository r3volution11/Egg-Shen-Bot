import { createCanvas, loadImage } from '@napi-rs/canvas';
import { config } from '../config.js';

const PARTICIPANT_WIDTH = 240;
const PARTICIPANT_HEIGHT = 50;
const MATCHUP_GAP = 10; // Gap between two participants in a matchup
const MATCHUP_SPACING = 140; // Vertical space for each complete matchup (both participants + gap)
const ROUND_SPACING = 340;
const CANVAS_PADDING = 60;
const FONT_SIZE = 14;
const TITLE_FONT_SIZE = 28;
const CONNECTOR_EXTEND = 40; // How far connector lines extend horizontally

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
  
  // Calculate canvas dimensions with minimum width
  const maxMatchupsInRound = Math.max(...rounds.map(r => r.matchups.length));
  const calculatedWidth = (rounds.length * ROUND_SPACING) + (CANVAS_PADDING * 2) + 300; // Extra space for champion
  const canvasWidth = Math.max(1200, calculatedWidth); // Minimum 1200px
  const canvasHeight = (maxMatchupsInRound * MATCHUP_SPACING) + (CANVAS_PADDING * 2) + 100; // Extra for title
  
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
    ctx.fillText(getRoundDisplayName(round.name), xOffset + PARTICIPANT_WIDTH / 2, CANVAS_PADDING + 40);
    
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
  ctx.strokeStyle = '#1E1F22';
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
    ctx.fillStyle = '#1E1F22';
    ctx.fillRect(x, y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT);
    ctx.strokeStyle = '#313338';
    ctx.strokeRect(x, y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT);
    
    ctx.fillStyle = '#4E5058';
    ctx.font = `${FONT_SIZE}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TBD', x + PARTICIPANT_WIDTH / 2, y + PARTICIPANT_HEIGHT / 2);
    return;
  }
  
  // Participant box
  const boxColor = isWinner ? '#3BA55D' : '#313338';
  ctx.fillStyle = boxColor;
  ctx.fillRect(x, y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT);
  
  // Border
  ctx.strokeStyle = isWinner ? '#2D7D46' : '#1E1F22';
  ctx.lineWidth = isWinner ? 3 : 2;
  ctx.strokeRect(x, y, PARTICIPANT_WIDTH, PARTICIPANT_HEIGHT);
  
  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${FONT_SIZE}px Arial`;
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
    ctx.fillStyle = '#B5BAC1';
    ctx.font = `${FONT_SIZE - 3}px Arial`;
    ctx.textAlign = 'left';
    const typeLabel = movie.type === 'winner' ? 'W' : movie.type === 'runnerup' ? 'R' : 'WC';
    ctx.fillText(typeLabel, x + 5, y + 10);
  }
  
  // Winner checkmark
  if (isWinner) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', x + PARTICIPANT_WIDTH - 10, y + PARTICIPANT_HEIGHT / 2);
  }
}

/**
 * Draw connector line between rounds
 */
function drawConnectorLine(ctx, x, y, roundIndex, matchupIndex, totalMatchups, ySpacing) {
  ctx.strokeStyle = '#4E5058';
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
  ctx.lineTo(midX, startY);
  // Vertical line to meet next round's center
  ctx.lineTo(midX, nextY);
  // Horizontal line to next round
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
  ctx.arc(x, y, 70, 0, Math.PI * 2);
  ctx.fill();
  
  // Trophy emoji
  ctx.font = '64px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏆', x, y);
  
  // Champion label
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${FONT_SIZE + 6}px Arial`;
  ctx.textBaseline = 'top';
  ctx.fillText('CHAMPION', x, y + 80);
  
  // Winner title (truncated)
  ctx.font = `${FONT_SIZE + 2}px Arial`;
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
