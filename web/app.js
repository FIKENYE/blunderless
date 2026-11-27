/* ============================================================
   Blunderless — app.js
   - Interactive Chessboard (custom poster SVGs via pieces.js)
   - Wooden + Mechanical PBT Keyboard Clack Web Audio engine
   - Stockfish MultiPV engine strip, Eval Bar & Best Move Subgame
   - Opening Explorer (Lichess Explorer + local ECO book fallback)
   - 2-Column Game Review, Eval Graph & Coach's Post-Game Report
   ============================================================ */

'use strict';


// ── Realistic Wooden Piece-on-Piece Clack Sound Engine ───────
/**
 * Procedural 3-layer hardwood chess piece synthesizer:
 *  - Master compressor (-12dB, ratio 6) + gain (0.85)
 *  - Layer 1 (Wood Body Thud): 185Hz -> 72Hz triangle sweep over 42ms through 380Hz LPF
 *  - Layer 2 (Board Resonance): 320Hz resonant knock (Q 4.2) for hollow wood-board warmth
 *  - Layer 3 (Hardwood Contact): 12ms filtered noise burst (1350Hz BPF, Q 2.4) + 5ms wood snap
 *  - Pitch jitter (+-4%) for organic hand-placed feel
 */
class WoodenClackEngine {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._compressor = null;
    this.enabled = true;
  }

  _init() {
    if (!this._ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this._ctx = new AudioCtx();

      this._compressor = this._ctx.createDynamicsCompressor();
      this._compressor.threshold.setValueAtTime(-12, this._ctx.currentTime);
      this._compressor.ratio.setValueAtTime(6, this._ctx.currentTime);
      this._compressor.attack.setValueAtTime(0.002, this._ctx.currentTime);
      this._compressor.release.setValueAtTime(0.05, this._ctx.currentTime);

      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.setValueAtTime(0.85, this._ctx.currentTime);

      this._compressor.connect(this._masterGain);
      this._masterGain.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  /** Synthesise a single hardwood piece-on-board clack */
  _woodClack(pitchMod = 1.0, vol = 1.0) {
    if (!this.enabled) return;
    const ctx = this._init();
    const now = ctx.currentTime;
    const jitter = (0.96 + Math.random() * 0.08) * pitchMod;

    // ── Layer 1: Weighted Wood Base Thud ──
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const oscFilter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(72 * jitter, now + 0.042);

    oscFilter.type = 'lowpass';
    oscFilter.frequency.setValueAtTime(380, now);

    oscGain.gain.setValueAtTime(0.8 * vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(this._compressor);

    osc.start(now);
    osc.stop(now + 0.048);

    // ── Layer 2: Hollow Wood Board Knock Resonance ──
    const knockOsc = ctx.createOscillator();
    const knockGain = ctx.createGain();
    knockOsc.type = 'sine';
    knockOsc.frequency.setValueAtTime(315 * jitter, now);
    knockOsc.frequency.exponentialRampToValueAtTime(160 * jitter, now + 0.028);

    knockGain.gain.setValueAtTime(0.45 * vol, now);
    knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    knockOsc.connect(knockGain);
    knockGain.connect(this._compressor);

    knockOsc.start(now);
    knockOsc.stop(now + 0.032);

    // ── Layer 3: Dry Hardwood Contact Transient ──
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.014), ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      const env = Math.pow(1 - i / noiseData.length, 3.6);
      noiseData[i] = (Math.random() * 2 - 1) * env;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const woodFilter = ctx.createBiquadFilter();
    woodFilter.type = 'bandpass';
    woodFilter.frequency.setValueAtTime(1350 * jitter, now);
    woodFilter.Q.setValueAtTime(2.4, now);

    const woodGain = ctx.createGain();
    woodGain.gain.setValueAtTime(0.7 * vol, now);
    woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.013);

    noiseSrc.connect(woodFilter);
    woodFilter.connect(woodGain);
    woodGain.connect(this._compressor);

    noiseSrc.start(now);
    noiseSrc.stop(now + 0.015);

    // ── Layer 4: Mechanical Keyboard PBT Stem Clack (2500Hz crisp transient) ──
    const clackBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.007), ctx.sampleRate);
    const clackData = clackBuf.getChannelData(0);
    for (let i = 0; i < clackData.length; i++) {
      const env = Math.pow(1 - i / clackData.length, 2.8);
      clackData[i] = (Math.random() * 2 - 1) * env;
    }
    const clackSrc = ctx.createBufferSource();
    clackSrc.buffer = clackBuf;

    const clackFilter = ctx.createBiquadFilter();
    clackFilter.type = 'bandpass';
    clackFilter.frequency.setValueAtTime(2520 * jitter, now);
    clackFilter.Q.setValueAtTime(3.2, now);

    const clackGain = ctx.createGain();
    clackGain.gain.setValueAtTime(0.62 * vol, now);
    clackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.006);

    clackSrc.connect(clackFilter);
    clackFilter.connect(clackGain);
    clackGain.connect(this._compressor);

    clackSrc.start(now);
    clackSrc.stop(now + 0.0075);

    // ── Layer 5: Sharp Keycap Top-Out Click (3400Hz 3.5ms impulse) ──
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(3400 * jitter, now);
    clickGain.gain.setValueAtTime(0.24 * vol, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.0035);
    clickOsc.connect(clickGain);
    clickGain.connect(this._compressor);
    clickOsc.start(now);
    clickOsc.stop(now + 0.004);
  }

  /** Soft wooden chime for check & checkmate */
  _chime(f1 = 520, f2 = 780, dur = 0.14) {
    if (!this.enabled) return;
    const ctx = this._init();
    const now = ctx.currentTime;

    [f1, f2].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this._compressor);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    });
  }

  /** Normal Move */
  move() {
    this._woodClack(1.0, 1.0);
  }

  /** Reverse / Step-Back Move: crisp slightly softer wooden clack */
  reverse() {
    this._woodClack(0.92, 0.82);
  }

  /** Capture (x): Piece-on-piece double-clack (24ms apart) */
  capture() {
    this._woodClack(1.16, 0.85);
    setTimeout(() => this._woodClack(0.88, 1.12), 24);
  }

  /** Castling (O-O): Two wooden piece placements 55ms apart */
  castle() {
    this._woodClack(1.02, 0.9);
    setTimeout(() => this._woodClack(0.94, 0.96), 55);
  }

  /** Check (+): Crisp clack + muted dual chime */
  check() {
    this._woodClack(1.12, 1.0);
    this._chime(520, 780, 0.14);
  }

  /** Checkmate (#) / Game End: Deep wood thud + resolving chime */
  gameEnd() {
    this._woodClack(0.84, 1.18);
    setTimeout(() => this._chime(390, 650, 0.22), 35);
  }
}

const sounds = new WoodenClackEngine();

// ── State ───────────────────────────────────────────────────
const state = {
  moves: [],
  plyIndex: 0,
  initialFen: null,
  initialEval: null,
  initialTopLines: [],
  orientation: 'white',
  searchedUser: '',
  board: null,
  activeFilter: null,
  showCoords: true,
  showBestMove: false,
  isPreviewingBest: false,
  initialBestMove: null,
  initialBestMoveSan: null,
  topLines: [],
  engineLinesExpanded: true,
  selectedDb: 'masters', // 'masters' or 'lichess'
  lastKnownOpening: 'Starting Position',
  lastKnownEco: '',
  lastBookPly: 0,
  isOutOfBook: false,
  userHighlights: new Map(), // sq -> css rgba color
  userArrows: [],            // [{ from, to, color, outline }]
  subgame: {
    active: false,
    returnPly: 0,
    userColor: 'w',
    game: null,
    history: [],
    busy: false,
    bestMove: null,
    bestMoveSan: null,
    autoReplyTimer: null,
  },
  explainDemo: {
    active: false,
    originPly: 0,
    timers: [],
  },
  retry: {
    active: false,
    targetPly: 0,
    branchPly: 0,
    bestMove: null,
    bestMoveSan: null,
    playedSan: null,
    triesLeft: 2,
    solved: false,
    prevShowBest: false,
  },
  summary: null,
  headers: {
    white: 'White', black: 'Black',
    white_elo: '', black_elo: '',
    initial_clock: '--:--',
  },
  gameReport: null,
  reportSide: 'white',
};

// ── Cache & Debounce for Live Opening Explorer ───────────────
const openingCache = new Map();
let _openingDebounceTimer = null;

// ── DOM Helpers ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const evalBlackFill = $('eval-black-fill');
const evalWhiteFill = $('eval-white-fill');
const evalLabelT = $('eval-label-top');
const evalLabelB = $('eval-label-bot');
const engineMeta = $('engine-meta');
const engineEval = $('engine-eval');
const moveTableBody = $('move-tbody');
const emptyMoves = $('empty-moves');
const quickImportPanel = $('quick-import-panel');
const gameHeaders = $('game-headers');
const pgnInput = $('pgn-input');
const quickInput = $('quick-input');
const statusMsg = $('status-msg');
const analyseBtn = $('analyse-btn');
const gamesList = $('games-list');

// Crisp monochrome white-out inline SVGs (no yellow OS emojis)
const THUMB_SVG = '<svg class="clf-svg-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 7.2 8.2 2.4c.4-.7 1.4-.4 1.4.4v3h3.3c.9 0 1.5.8 1.3 1.7l-1 4.6c-.2.7-.8 1.2-1.5 1.2H6V7.2h-.5zM2 7h2.6v6.3H2V7z"/></svg>';
const BOOK_SVG = '<svg class="clf-svg-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.2c1.8-.4 4-.2 5.4.8v8.8c-1.4-.9-3.6-1.1-5.4-.7V3.2zm12 0c-1.8-.4-4-.2-5.4.8v8.8c1.4-.9 3.6-1.1 5.4-.7V3.2z"/></svg>';

const CLF_META = {
  brilliant: { glyph: '!!', cls: 'glyph-brilliant', badgeCls: 'clf-brilliant', title: 'Brilliant' },
  great: { glyph: '!', cls: 'glyph-great', badgeCls: 'clf-great', title: 'Great' },
  best: { glyph: '★', cls: 'glyph-best', badgeCls: 'clf-best', title: 'Best' },
  excellent: { glyph: THUMB_SVG, cls: 'glyph-excellent', badgeCls: 'clf-excellent', title: 'Excellent' },
  good: { glyph: '✓', cls: 'glyph-good', badgeCls: 'clf-good', title: 'Good' },
  book: { glyph: BOOK_SVG, cls: 'glyph-book', badgeCls: 'clf-book', title: 'Book' },
  inaccuracy: { glyph: '?!', cls: 'glyph-inaccuracy', badgeCls: 'clf-inaccuracy', title: 'Inaccuracy' },
  mistake: { glyph: '?', cls: 'glyph-mistake', badgeCls: 'clf-mistake', title: 'Mistake' },
  miss: { glyph: '✕', cls: 'glyph-miss', badgeCls: 'clf-miss', title: 'Miss' },
  blunder: { glyph: '??', cls: 'glyph-blunder', badgeCls: 'clf-blunder', title: 'Blunder' },
};

// ── Shared Chess.js Position Builder (O(1) FEN load when cached) ──
function buildGameAtPly(ply = state.plyIndex) {
  const game = new Chess();
  const clamped = Math.max(0, Math.min(ply, state.moves.length));
  if (clamped === 0) {
    if (state.initialFen) game.load(state.initialFen);
    return game;
  }
  const targetMove = state.moves[clamped - 1];
  if (targetMove && targetMove.fen && game.load(targetMove.fen)) {
    return game;
  }
  // Fallback if a synthetic move lacks a cached FEN
  if (state.initialFen) game.load(state.initialFen);
  for (let i = 0; i < clamped; i++) {
    game.move(state.moves[i].san);
  }
  return game;
}

function resetSummaryCard() {
  state.activeFilter = null;
  state.gameReport = null;
  document.querySelectorAll('.review-cnt-btn').forEach(b => b.classList.remove('filter-active'));
  const emptyEl = $('review-empty');
  const bodyEl = $('review-body');
  const reportEl = $('coach-report-section');
  if (emptyEl) emptyEl.classList.remove('hidden');
  if (bodyEl) bodyEl.classList.add('hidden');
  if (reportEl) reportEl.classList.add('hidden');
}

// ── Eval Bar & Engine Strip ─────────────────────────────────
function setEvalBar(score) {
  let cp;
  let formatted;
  let topText = '';
  let botText = '';

  if (score.type === 'mate') {
    cp = score.value > 0 ? 10000 : -10000;
    const prefix = score.value > 0 ? '+' : '-';
    formatted = `${prefix}M${Math.abs(score.value)}`;
    if (score.value > 0) botText = `M${Math.abs(score.value)}`;
    else topText = `M${Math.abs(score.value)}`;
  } else {
    cp = score.value;
    const disp = (Math.abs(cp) / 100).toFixed(1);
    const disp2 = (Math.abs(cp) / 100).toFixed(2);
    if (cp >= 0) {
      formatted = '+' + disp2;
      botText = '+' + disp;
    } else {
      formatted = '-' + disp2;
      topText = '-' + disp;
    }
  }

  engineEval.textContent = formatted;

  // Use smooth floating-point height (no integer rounding) so subtle book-move
  // shifts like +0.15 -> +0.42 visibly glide the evaluation bar.
  const pct = Math.max(2, Math.min(98, 50 + 50 * Math.tanh(cp / 300)));
  evalBlackFill.style.height = (100 - pct).toFixed(2) + '%';
  evalWhiteFill.style.height = pct.toFixed(2) + '%';

  const evalShell = $('eval-bar-shell');
  const isFlipped = state.orientation === 'black';
  evalShell.classList.toggle('flipped', isFlipped);

  // When flipped, White's fill is at the top and Black's fill is at the bottom
  evalLabelT.textContent = isFlipped ? botText : topText;
  evalLabelB.textContent = isFlipped ? topText : botText;
}

// ── MultiPV Engine Lines Update ──────────────────────────────
function updateEngineLines(score, bestMoveSan, topLines = null) {
  if (Array.isArray(topLines) && topLines.length > 0) {
    for (let idx = 0; idx < 3; idx++) {
      const line = topLines[idx];
      const scoreEl = $(`pv${idx + 1}-score`);
      const movesEl = $(`pv${idx + 1}-moves`);
      if (!scoreEl || !movesEl) continue;

      if (line) {
        scoreEl.textContent = formatScoreStr(line.score);
        movesEl.textContent = (line.pv_san || []).slice(0, 6).join(' ') || line.move_san || '—';
      } else {
        scoreEl.textContent = '—';
        movesEl.textContent = '—';
      }
    }
    return;
  }

  // Fallback when only top move & score exist (never fabricate fake PV lines)
  const s = score || { type: 'cp', value: 20 };
  $('pv1-score').textContent = formatScoreStr(s);
  $('pv1-moves').textContent = bestMoveSan ? `Best: ${bestMoveSan}` : '—';
  $('pv2-score').textContent = '—';
  $('pv2-moves').textContent = '—';
  $('pv3-score').textContent = '—';
  $('pv3-moves').textContent = '—';
}

// ── Live Opening Explorer (Backend Proxy + Built-in ECO Book) ──
async function fetchOpeningData(fen) {
  const cacheKey = `${state.selectedDb}:${fen}`;
  if (openingCache.has(cacheKey)) {
    return openingCache.get(cacheKey);
  }

  try {
    const res = await fetch(`/api/opening?fen=${encodeURIComponent(fen)}&db=${encodeURIComponent(state.selectedDb)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    openingCache.set(cacheKey, data);
    return data;
  } catch (err) {
    return null;
  }
}

function updateOpeningDisplay(fen) {
  clearTimeout(_openingDebounceTimer);
  _openingDebounceTimer = setTimeout(async () => {
    const data = await fetchOpeningData(fen);
    renderOpeningData(data);
  }, 300);
}

function renderOpeningData(data) {
  const oobBanner = $('out-of-book-banner');
  const candTable = $('candidates-table');
  const candEmpty = $('candidates-empty');
  const tbody = $('candidates-tbody');

  if (!data || (!data.moves?.length && !data.opening)) {
    // Out of book or offline
    state.isOutOfBook = true;
    oobBanner.classList.remove('hidden');
    candTable.classList.add('hidden');
    candEmpty.classList.remove('hidden');
    $('opening-total-games').textContent = '0 theoretical games';

    // Keep last known opening name in header
    $('opening-hero-name').textContent = `${state.lastKnownOpening} (Theory ended)`;
    $('opening-banner').textContent = state.lastKnownOpening;
    return;
  }

  // Position is in book!
  state.lastBookPly = state.plyIndex;
  state.isOutOfBook = false;
  oobBanner.classList.add('hidden');

  if (data.opening) {
    state.lastKnownOpening = data.opening.name;
    state.lastKnownEco = data.opening.eco || '';
  }

  const openingTitle = state.lastKnownOpening || 'Starting Position';
  const eco = state.lastKnownEco || '—';

  // Subheader banner
  $('opening-banner').textContent = openingTitle;
  $('opening-eco-badge').textContent = eco !== '—' ? eco : '';

  // Hero Card
  $('opening-hero-name').textContent = openingTitle;
  $('opening-hero-eco').textContent = eco;

  // Games count calculation
  const whiteWins = data.white || 0;
  const draws = data.draws || 0;
  const blackWins = data.black || 0;
  const totalGames = whiteWins + draws + blackWins;
  $('opening-total-games').textContent = `${totalGames.toLocaleString()} recorded games`;

  // Best move
  const bestCand = data.moves?.[0]?.san || '—';
  $('opening-engine-best').textContent = `Top continuation: ${bestCand}`;

  // Candidate moves table
  if (!data.moves || data.moves.length === 0) {
    candTable.classList.add('hidden');
    candEmpty.classList.remove('hidden');
    return;
  }

  candTable.classList.remove('hidden');
  candEmpty.classList.add('hidden');
  tbody.innerHTML = '';

  for (const m of data.moves) {
    const gCount = (m.white + m.draws + m.black) || 1;
    const wPct = Math.round((m.white / gCount) * 100);
    const dPct = Math.round((m.draws / gCount) * 100);
    const bPct = Math.max(0, 100 - wPct - dPct);

    const tr = document.createElement('tr');
    tr.className = 'cand-row';
    tr.innerHTML = `
      <td class="cand-move-san">${m.san}</td>
      <td class="cand-games-count">${gCount.toLocaleString()}</td>
      <td class="cand-bar-container">
        <div class="cand-bar-track">
          <div class="cand-bar-seg seg-white" style="width: ${wPct}%" title="White wins: ${wPct}%"></div>
          <div class="cand-bar-seg seg-draw" style="width: ${dPct}%" title="Draws: ${dPct}%"></div>
          <div class="cand-bar-seg seg-black" style="width: ${bPct}%" title="Black wins: ${bPct}%"></div>
        </div>
        <div class="cand-bar-labels">
          <span>${wPct}%</span>
          <span>${dPct}%</span>
          <span>${bPct}%</span>
        </div>
      </td>
    `;

    // Interactive candidate clicking: plays the theoretical continuation immediately
    tr.addEventListener('click', () => {
      playInteractiveMove(m.san);
    });

    tbody.appendChild(tr);
  }
}

function playInteractiveMove(san) {
  const tmpGame = buildGameAtPly(state.plyIndex);

  const moveRes = tmpGame.move(san);
  if (!moveRes) return;

  const afterFen = tmpGame.fen();
  const ply = state.plyIndex + 1;
  const prevScore = state.plyIndex > 0 ? state.moves[state.plyIndex - 1]?.eval_after : state.initialEval;

  // Append move into state if exploring past current game length
  const syntheticMove = {
    ply: ply,
    move_number: Math.floor((ply + 1) / 2),
    color: moveRes.color === 'w' ? 'white' : 'black',
    uci: moveRes.from + moveRes.to + (moveRes.promotion || ''),
    san: moveRes.san,
    fen: afterFen,
    clock: '--:--',
    eval_after: prevScore ? { ...prevScore } : { type: 'cp', value: 20 },
    eval_change: 0,
    epl: 0,
    classification: 'book',
    best_move: null,
    best_move_san: san,
  };

  // Truncate future moves if we branch from mid-game
  state.moves = state.moves.slice(0, state.plyIndex);
  state.moves.push(syntheticMove);

  renderMoveList(state.moves);
  goToPly(ply);

  // Fetch live Stockfish evaluation for the book continuation so the eval bar updates accurately
  fetchApi('/api/analyse-fen', 'POST', { fen: afterFen, depth: 10 })
    .then(res => {
      if (!res || !res.engine) return;
      syntheticMove.eval_after = res.engine.score;
      syntheticMove.best_move = res.engine.best_move || null;
      syntheticMove.best_move_san = res.engine.best_move_san || san;

      // Only update live UI if user is still viewing this exact explored ply
      if (state.plyIndex === ply && state.moves[ply - 1] === syntheticMove) {
        setEvalBar(res.engine.score);
        updateEngineLines(res.engine.score, res.engine.best_move_san, res.engine.top_lines);
        updateBestMoveUI();
        renderBoardArrows();
      }
    })
    .catch(() => { /* keep fallback score if engine busy */ });
}

// ── Player Bars & Clocks ────────────────────────────────────
function syncPlayerBars(ply) {
  const topColor = state.orientation === 'white' ? 'black' : 'white';
  const botColor = state.orientation;

  const setBar = (prefix, color) => {
    const nameEl = $(`${prefix}-name`);
    const ratingEl = $(`${prefix}-rating`);
    const avatarEl = $(`${prefix}-avatar`);
    const clockEl = $(`${prefix}-clock`);

    nameEl.textContent = state.headers[color] || (color === 'white' ? 'White' : 'Black');
    const elo = state.headers[`${color}_elo`];
    ratingEl.textContent = elo ? `(${elo})` : '';
    avatarEl.textContent = color === 'white' ? 'W' : 'B';
    avatarEl.className = `player-avatar avatar-${color}`;

    let clk = state.headers.initial_clock || '--:--';
    for (let i = ply - 1; i >= 0; i--) {
      if (state.moves[i] && state.moves[i].color === color && state.moves[i].clock) {
        clk = state.moves[i].clock;
        break;
      }
    }
    clockEl.textContent = clk;

    const turnColor = (ply % 2 === 0) ? 'white' : 'black';
    clockEl.classList.toggle('active-clock', turnColor === color && state.moves.length > 0);
  };

  setBar('top', topColor);
  setBar('bot', botColor);
}

// ── Board Initialisation & Exact 1:1 Sizing ─────────────────
function initBoard() {
  state.board = Chessboard('board', {
    position: 'start',
    orientation: state.orientation,
    pieceTheme: (piece) => window.BlunderlessPieces.getDataUri(piece),
    draggable: true,
    onDragStart: onSubgameDragStart,
    onDrop: onSubgameDrop,
    onSnapEnd: onSubgameSnapEnd,
    moveSpeed: 110,
    snapbackSpeed: 35,
    snapSpeed: 25,
  });



  const boardEl = $('board');
  const boardWrap = $('board-wrap');
  const boardContainer = document.querySelector('.board-container');
  const evalShell = $('eval-bar-shell');
  const topBar = $('top-player-bar');
  const botBar = $('bot-player-bar');
  const utilityRail = document.querySelector('.board-utility-rail');

  let resizeRaf = null;
  const resize = () => {
    const stage = document.querySelector('.left-stage');
    if (!stage || stage.clientWidth === 0) return;

    const vw = window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const coachEl = $('knight-coach-stage');
    const isStackedLayout = vw <= 1023; // Phone & Portrait iPad/Tablet
    let rawSize;

    if (isStackedLayout) {
      // Utility rail moves horizontally beneath the board, so only eval bar + gap take width.
      // Clamp strictly to viewport width so the board can NEVER overflow an iPhone/iPad screen.
      const isPhone = vw <= 767;
      const safeVw = Math.min(stage.clientWidth || vw, document.documentElement.clientWidth || vw, vw);
      const evalReserveW = (evalShell?.offsetWidth || (isPhone ? 20 : 22)) + (isPhone ? 5 : 6);
      const sidePad = isPhone ? 18 : 34;
      const maxWidthCap = isPhone ? 520 : 580;
      const availW = Math.min(safeVw - evalReserveW - sidePad, maxWidthCap);

      // Cap against viewport height so landscape phones & short screens stay comfortable
      const verticalChrome = isPhone ? 250 : 310;
      const availH = Math.max(240, vh - verticalChrome);
      rawSize = Math.max(224, Math.min(availW, availH));
    } else {
      const isDesktopSide = vw >= 1220 && coachEl;
      const coachReserveW = isDesktopSide ? Math.min(360, coachEl.offsetWidth + 28) : 0;
      const coachReserveH = (!isDesktopSide && coachEl) ? coachEl.offsetHeight + 16 : 0;

      // Available space accounting for padding, player bars, vertical utility rail, and Chester
      const availH = stage.clientHeight - 130 - coachReserveH;
      const availW = stage.clientWidth - 110 - coachReserveW;
      rawSize = Math.max(260, Math.min(availH, availW, 680));
    }

    // Snap to 8px multiple for pixel-crisp squares
    const snapped = Math.floor(rawSize / 8) * 8;

    boardEl.style.width = snapped + 'px';
    boardEl.style.height = snapped + 'px';

    // Eval bar height matches the 8x8 chessboard only
    evalShell.style.height = snapped + 'px';

    // Player bars (and horizontal mobile utility strip) match exact width of the 8x8 board
    topBar.style.width = snapped + 'px';
    botBar.style.width = snapped + 'px';
    if (utilityRail) {
      utilityRail.style.width = isStackedLayout ? snapped + 'px' : '';
    }

    // Align eval bar flush with the top edge of the 8x8 board when stacked vertically
    if (isStackedLayout && boardWrap && boardContainer) {
      const topOffset = Math.max(0, Math.round(boardWrap.getBoundingClientRect().top - boardContainer.getBoundingClientRect().top));
      evalShell.style.marginTop = topOffset + 'px';
    } else {
      evalShell.style.marginTop = '';
    }

    state.board.resize();
  };

  const scheduleResize = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      resize();
    });
  };

  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', () => setTimeout(scheduleResize, 120));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleResize);
  }
  setTimeout(resize, 50);
  setupBoardAnnotations();
  setupClickToMove();
}

// ── Right-Click Square Highlights & Editorial SVG Arrows ─────
function getAnnotationStyle(e) {
  if (e.shiftKey) {
    return {
      sq: 'rgba(46, 111, 64, 0.45)',
      arrow: '#2E6F40',
    };
  }
  if (e.altKey) {
    return {
      sq: 'rgba(196, 132, 29, 0.45)',
      arrow: '#C4841D',
    };
  }
  if (e.ctrlKey || e.metaKey) {
    return {
      sq: 'rgba(107, 91, 149, 0.45)',
      arrow: '#6B5B95',
    };
  }
  return {
    sq: 'rgba(200, 90, 40, 0.45)',
    arrow: '#C85A28',
  };
}

function getSquareFromPointer(e) {
  const pt = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
  const hitTarget =
    e.changedTouches && typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(pt.clientX, pt.clientY)
      : e.target;
  const sqEl = hitTarget?.closest?.('[data-square]');
  if (sqEl && sqEl.dataset.square) return sqEl.dataset.square;

  const boardInner = $('board').querySelector('.board-b72b1') || $('board');
  const rect = boardInner.getBoundingClientRect();
  if (
    pt.clientX < rect.left || pt.clientX > rect.right ||
    pt.clientY < rect.top || pt.clientY > rect.bottom
  ) {
    return null;
  }

  const col = Math.min(7, Math.max(0, Math.floor(((pt.clientX - rect.left) / rect.width) * 8)));
  const row = Math.min(7, Math.max(0, Math.floor(((pt.clientY - rect.top) / rect.height) * 8)));
  const fileIdx = state.orientation === 'white' ? col : 7 - col;
  const rankIdx = state.orientation === 'white' ? 7 - row : row;
  return String.fromCharCode(97 + fileIdx) + (rankIdx + 1);
}

function squareToGrid(sq) {
  const fileIdx = sq.charCodeAt(0) - 97;
  const rankIdx = parseInt(sq[1], 10) - 1;
  const col = state.orientation === 'white' ? fileIdx : 7 - fileIdx;
  const row = state.orientation === 'white' ? 7 - rankIdx : rankIdx;
  return { col, row, x: col * 100 + 50, y: row * 100 + 50 };
}

function renderUserHighlights() {
  $('board').querySelectorAll('.user-sq-highlight').forEach(el => el.remove());
  for (const [sq, color] of state.userHighlights.entries()) {
    const sqEl = $('board').querySelector(`[data-square="${sq}"]`);
    if (sqEl) {
      const hl = document.createElement('div');
      hl.className = 'user-sq-highlight';
      hl.style.backgroundColor = color;
      sqEl.appendChild(hl);
    }
  }
}

function buildArrowPath(fromSq, toSq) {
  const p1 = squareToGrid(fromSq);
  const p2 = squareToGrid(toSq);
  const dCol = p2.col - p1.col;
  const dRow = p2.row - p1.row;
  const isKnight =
    (Math.abs(dCol) === 1 && Math.abs(dRow) === 2) ||
    (Math.abs(dCol) === 2 && Math.abs(dRow) === 1);

  const hw = 7;   // 14px shaft width
  const hhw = 17; // 34px head width
  // Head length 32px: tip at +8px past target center, base at -24px

  if (isKnight) {
    const elbowX = Math.abs(dCol) === 2 ? p2.x : p1.x;
    const elbowY = Math.abs(dCol) === 2 ? p1.y : p2.y;

    const len1 = Math.hypot(elbowX - p1.x, elbowY - p1.y) || 1;
    const u1x = (elbowX - p1.x) / len1;
    const u1y = (elbowY - p1.y) / len1;
    const n1x = -u1y;
    const n1y = u1x;

    const len2 = Math.hypot(p2.x - elbowX, p2.y - elbowY) || 1;
    const u2x = (p2.x - elbowX) / len2;
    const u2y = (p2.y - elbowY) / len2;
    const n2x = -u2y;
    const n2y = u2x;

    const sx = p1.x + 18 * u1x;
    const sy = p1.y + 18 * u1y;
    const bx = p2.x - 24 * u2x;
    const by = p2.y - 24 * u2y;
    const tx = p2.x + 8 * u2x;
    const ty = p2.y + 8 * u2y;

    // Exact mitered inner/outer elbow corners
    const c1x = elbowX + hw * n1x + hw * n2x;
    const c1y = elbowY + hw * n1y + hw * n2y;
    const c2x = elbowX - hw * n1x - hw * n2x;
    const c2y = elbowY - hw * n1y - hw * n2y;

    return [
      `M ${(sx + hw * n1x).toFixed(1)} ${(sy + hw * n1y).toFixed(1)}`,
      `L ${c1x.toFixed(1)} ${c1y.toFixed(1)}`,
      `L ${(bx + hw * n2x).toFixed(1)} ${(by + hw * n2y).toFixed(1)}`,
      `L ${(bx + hhw * n2x).toFixed(1)} ${(by + hhw * n2y).toFixed(1)}`,
      `L ${tx.toFixed(1)} ${ty.toFixed(1)}`,
      `L ${(bx - hhw * n2x).toFixed(1)} ${(by - hhw * n2y).toFixed(1)}`,
      `L ${(bx - hw * n2x).toFixed(1)} ${(by - hw * n2y).toFixed(1)}`,
      `L ${c2x.toFixed(1)} ${c2y.toFixed(1)}`,
      `L ${(sx - hw * n1x).toFixed(1)} ${(sy - hw * n1y).toFixed(1)}`,
      'Z',
    ].join(' ');
  }

  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy;
  const py = ux;

  const sx = p1.x + 18 * ux;
  const sy = p1.y + 18 * uy;
  const bx = p2.x - 24 * ux;
  const by = p2.y - 24 * uy;
  const tx = p2.x + 8 * ux;
  const ty = p2.y + 8 * uy;

  return [
    `M ${(sx + hw * px).toFixed(1)} ${(sy + hw * py).toFixed(1)}`,
    `L ${(bx + hw * px).toFixed(1)} ${(by + hw * py).toFixed(1)}`,
    `L ${(bx + hhw * px).toFixed(1)} ${(by + hhw * py).toFixed(1)}`,
    `L ${tx.toFixed(1)} ${ty.toFixed(1)}`,
    `L ${(bx - hhw * px).toFixed(1)} ${(by - hhw * py).toFixed(1)}`,
    `L ${(bx - hw * px).toFixed(1)} ${(by - hw * py).toFixed(1)}`,
    `L ${(sx - hw * px).toFixed(1)} ${(sy - hw * py).toFixed(1)}`,
    'Z',
  ].join(' ');
}

function getBestMoveForCurrentPly() {
  if (state.subgame.active) {
    return state.subgame.bestMove || null;
  }
  if (state.plyIndex === 0) {
    return state.initialBestMove || state.moves[0]?.best_move || null;
  }
  const m = state.moves[state.plyIndex - 1];
  if (!m || !m.best_move) return null;
  if (m.uci === m.best_move || m.classification === 'best') return null;
  return m.best_move;
}

function renderBoardArrows() {
  const svg = $('board-arrows');
  if (!svg) return;
  svg.innerHTML = '';

  const ns = 'http://www.w3.org/2000/svg';

  const drawSingleArrow = (fromSq, toSq, color, isCoachBest = false) => {
    const pathD = buildArrowPath(fromSq, toSq);
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('opacity', '0.82');

    if (isCoachBest) {
      const p1 = squareToGrid(fromSq);
      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('cx', p1.x);
      ring.setAttribute('cy', p1.y);
      ring.setAttribute('r', '8');
      ring.setAttribute('fill', color);
      ring.setAttribute('class', 'board-arrow-shape');
      group.appendChild(ring);
    }

    const shape = document.createElementNS(ns, 'path');
    shape.setAttribute('d', pathD);
    shape.setAttribute('fill', color);
    shape.setAttribute('class', 'board-arrow-shape');
    group.appendChild(shape);

    svg.appendChild(group);
  };

  // Engine / Coach Best Move Arrow (hidden while actively retrying a mistake)
  if (state.showBestMove && !state.isPreviewingBest && !(state.retry.active && !state.retry.solved)) {
    const bestUci = getBestMoveForCurrentPly();
    if (bestUci && bestUci.length >= 4) {
      drawSingleArrow(bestUci.slice(0, 2), bestUci.slice(2, 4), '#2E6F40', true);
    }
  }

  // User Right-Click Annotations
  for (const arrow of state.userArrows) {
    drawSingleArrow(arrow.from, arrow.to, arrow.color, false);
  }
}

function clearAnnotations() {
  if (state.userHighlights.size === 0 && state.userArrows.length === 0) return;
  state.userHighlights.clear();
  state.userArrows = [];
  renderUserHighlights();
  renderBoardArrows();
}

function setupBoardAnnotations() {
  const boardWrap = $('board-wrap');
  if (!boardWrap) return;

  let rightDragStartSq = null;

  boardWrap.addEventListener('contextmenu', e => {
    e.preventDefault();
  });

  boardWrap.addEventListener('mousedown', e => {
    if (e.button === 0) {
      clearAnnotations();
      return;
    }
    if (e.button === 2) {
      rightDragStartSq = getSquareFromPointer(e);
    }
  });

  window.addEventListener('mouseup', e => {
    if (e.button !== 2 || !rightDragStartSq) return;
    const startSq = rightDragStartSq;
    rightDragStartSq = null;

    const endSq = getSquareFromPointer(e);
    if (!endSq) return;

    const style = getAnnotationStyle(e);

    if (startSq === endSq) {
      if (state.userHighlights.get(endSq) === style.sq) {
        state.userHighlights.delete(endSq);
      } else {
        state.userHighlights.set(endSq, style.sq);
      }
      renderUserHighlights();
    } else {
      const existingIdx = state.userArrows.findIndex(
        a => a.from === startSq && a.to === endSq && a.color === style.arrow
      );
      if (existingIdx !== -1) {
        state.userArrows.splice(existingIdx, 1);
      } else {
        // Remove any different-color arrow on same pair before adding
        state.userArrows = state.userArrows.filter(
          a => !(a.from === startSq && a.to === endSq)
        );
        state.userArrows.push({ from: startSq, to: endSq, color: style.arrow });
      }
      renderBoardArrows();
    }
  });
}

// ── Last-Move Highlighting & Square Badges ───────────────────
let _lastHighlightSquares = [];

function highlightLastMove(fromSq, toSq, classification) {
  _lastHighlightSquares.forEach(sq => {
    $('board').querySelectorAll(`[data-square="${sq}"]`).forEach(el => {
      el.classList.remove('highlight-last');
    });
  });
  $('board').querySelectorAll('.square-badge').forEach(el => el.remove());
  _lastHighlightSquares = [];

  if (!fromSq || !toSq) return;

  [fromSq, toSq].forEach(sq => {
    $('board').querySelectorAll(`[data-square="${sq}"]`).forEach(el => {
      el.classList.add('highlight-last');
    });
  });
  _lastHighlightSquares = [fromSq, toSq];

  // Render circular classification badge on destination square for EVERY classified move
  if (classification) {
    const toSquareEl = $('board').querySelector(`[data-square="${toSq}"]`);
    if (toSquareEl) {
      const meta = CLF_META[classification];
      if (meta && meta.glyph) {
        const badge = document.createElement('div');
        badge.className = `square-badge ${meta.badgeCls}`;
        badge.innerHTML = meta.glyph;
        toSquareEl.appendChild(badge);
      }
    }
  }
}

function cancelExplainDemo() {
  if (!state.explainDemo.active) return;
  for (const tid of state.explainDemo.timers) {
    clearTimeout(tid);
  }
  state.explainDemo.timers = [];
  state.explainDemo.active = false;
}

function playExplainDemo(bestLineUci, demoMode = 'best') {
  if (!Array.isArray(bestLineUci) || bestLineUci.length === 0) return;
  if (state.subgame.active) return;

  const firstUci = bestLineUci[0];
  if (!firstUci || firstUci.length < 4) return;

  // For Brilliant / Great / Best / Excellent moves (demoMode === 'played') OR when
  // the user already played the engine's best move, keep their move on the board and
  // animate the expected follow-up (opponent's best reply + user's continuation)!
  const curMove = state.plyIndex > 0 ? state.moves[state.plyIndex - 1] : null;
  const keepPlayedMove = demoMode === 'played' || (curMove && curMove.uci === firstUci);
  const branchPly = (state.plyIndex === 0 || keepPlayedMove) ? state.plyIndex : state.plyIndex - 1;

  cancelExplainDemo();
  clearMoveSelection();
  state.explainDemo = {
    active: true,
    originPly: state.plyIndex,
    timers: [],
  };

  const demoGame = buildGameAtPly(branchPly);

  if (!keepPlayedMove) {
    // Beat 1 (0ms): Rewind to position before the mistake and highlight best move arrow
    state.board.position(demoGame.fen(), true);
    highlightLastMove(null, null, null);
    state.showBestMove = true;
    updateBestMoveUI();
    renderBoardArrows();

    // Beat 2 (550ms): Play the Best Move on the board
    const t1 = setTimeout(() => {
      if (!state.explainDemo.active) return;
      const m1 = demoGame.move({
        from: firstUci.slice(0, 2),
        to: firstUci.slice(2, 4),
        promotion: firstUci.slice(4, 5) || 'q',
      });
      if (!m1) return;
      state.board.position(demoGame.fen(), true);
      highlightLastMove(m1.from, m1.to, 'best');
      playMoveSound({ san: m1.san }, demoGame);
      renderBoardArrows();

      // Beat 3 (1350ms total): Play opponent's best / most likely reply
      const replyUci = bestLineUci[1];
      if (replyUci && replyUci.length >= 4) {
        const t2 = setTimeout(() => {
          if (!state.explainDemo.active) return;
          const m2 = demoGame.move({
            from: replyUci.slice(0, 2),
            to: replyUci.slice(2, 4),
            promotion: replyUci.slice(4, 5) || 'q',
          });
          if (!m2) return;
          state.board.position(demoGame.fen(), true);
          highlightLastMove(m2.from, m2.to, null);
          playMoveSound({ san: m2.san }, demoGame);
        }, 800);
        state.explainDemo.timers.push(t2);
      }
    }, 550);
    state.explainDemo.timers.push(t1);
  } else if (bestLineUci[1] && bestLineUci[1].length >= 4) {
    // Keep user's Brilliant/Great/Best move on the board and show opponent's best reply + user's follow-up
    const replyUci = bestLineUci[1];
    const followUci = bestLineUci[2];
    const t1 = setTimeout(() => {
      if (!state.explainDemo.active) return;
      const m2 = demoGame.move({
        from: replyUci.slice(0, 2),
        to: replyUci.slice(2, 4),
        promotion: replyUci.slice(4, 5) || 'q',
      });
      if (!m2) return;
      state.board.position(demoGame.fen(), true);
      highlightLastMove(m2.from, m2.to, null);
      playMoveSound({ san: m2.san }, demoGame);

      if (followUci && followUci.length >= 4) {
        const t2 = setTimeout(() => {
          if (!state.explainDemo.active) return;
          const m3 = demoGame.move({
            from: followUci.slice(0, 2),
            to: followUci.slice(2, 4),
            promotion: followUci.slice(4, 5) || 'q',
          });
          if (!m3) return;
          state.board.position(demoGame.fen(), true);
          highlightLastMove(m3.from, m3.to, curMove?.classification || 'best');
          playMoveSound({ san: m3.san }, demoGame);
        }, 800);
        state.explainDemo.timers.push(t2);
      }
    }, 450);
    state.explainDemo.timers.push(t1);
  }
}

// ── Navigation ──────────────────────────────────────────────
function goToPly(ply) {
  if (state.explainDemo.active) {
    cancelExplainDemo();
  }
  if (state.retry.active) {
    exitRetryMode(true);
  }
  if (state.subgame.active) {
    exitSubgame(true);
  }
  if (ply < 0 || ply > state.moves.length) return;

  const prevPly = state.plyIndex;
  state.plyIndex = ply;
  state.isPreviewingBest = false;

  if (ply !== prevPly) {
    clearAnnotations();
  }

  const tmpGame = buildGameAtPly(ply);

  const currentFen = tmpGame.fen();
  state.board.position(currentFen, true);

  const moveData = ply > 0 ? state.moves[ply - 1] : null;
  if (moveData) {
    const uci = moveData.uci;
    highlightLastMove(uci.slice(0, 2), uci.slice(2, 4), moveData.classification);
    if (ply > prevPly) {
      playMoveSound(moveData, tmpGame);
    } else if (ply < prevPly) {
      sounds.reverse();
    }
    updateEngineLines(moveData.eval_after, moveData.best_move_san, moveData.top_lines || null);
  } else {
    highlightLastMove(null, null, null);
    if (ply < prevPly) {
      sounds.reverse();
    }
    updateEngineLines(
      state.initialEval,
      state.initialBestMoveSan || state.moves[0]?.best_move_san,
      state.initialTopLines?.length ? state.initialTopLines : null
    );
  }

  // Update Live Opening Explorer & ECO pill
  updateOpeningDisplay(currentFen);

  const evalScore = ply === 0 ? state.initialEval : moveData?.eval_after;
  if (evalScore) setEvalBar(evalScore);

  syncPlayerBars(ply);
  updateBestMoveUI();
  updateKeyMomentsUI();
  renderBoardArrows();
  updateEvalGraphCursor(ply);
  clearMoveSelection();
  updateCoachContext(currentFen, ply, moveData);

  document.querySelectorAll('.move-cell').forEach(c => c.classList.remove('active-ply'));
  if (ply > 0) {
    const activeCell = document.querySelector(`.move-cell[data-ply="${ply}"]`);
    if (activeCell) {
      activeCell.classList.add('active-ply');
      activeCell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

function playMoveSound(moveData, boardAfter) {
  const san = moveData.san;
  if (boardAfter.in_checkmate()) sounds.gameEnd();
  else if (boardAfter.in_check()) sounds.check();
  else if (san.includes('O-O')) sounds.castle();
  else if (san.includes('x')) sounds.capture();
  else sounds.move();
}

// ── Move List & Quality Summary Calculations ─────────────────
function calculateAccuracy(moves) {
  if (!moves || moves.length === 0) return { white: null, black: null };

  // Authentic Lichess volatility-weighted mean + harmonic mean (mirrors src/server.py)
  const scoreToWinPct = (score) => {
    if (!score) return 50.0;
    const cp = score.type === 'mate'
      ? (score.value > 0 ? 10000 : -10000)
      : score.value;
    const clamped = Math.max(-4000, Math.min(4000, cp));
    return 100.0 / (1.0 + Math.exp(-0.00368208 * clamped));
  };

  const winPcts = [scoreToWinPct(state.initialEval || { type: 'cp', value: 20 })];
  for (const m of moves) {
    winPcts.push(scoreToWinPct(m.eval_after));
  }

  const nPlies = moves.length;
  const winSize = Math.max(2, Math.min(8, Math.floor(nPlies / 10) || 2));
  const weights = [];
  for (let i = 0; i < nPlies; i++) {
    const start = Math.max(0, i - Math.floor(winSize / 2));
    const end = Math.min(winPcts.length, start + winSize);
    const slice = winPcts.slice(start, end);
    const meanW = slice.reduce((a, b) => a + b, 0) / slice.length;
    const varW = slice.reduce((a, b) => a + (b - meanW) ** 2, 0) / slice.length;
    weights.push(Math.max(0.5, Math.min(12.0, Math.sqrt(varW))));
  }

  const sideAcc = (color) => {
    const accs = [];
    const sideW = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m.color !== color) continue;
      const winLoss = typeof m.epl === 'number' ? m.epl * 100 : Math.max(0, -m.eval_change) / 4;
      const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * winLoss) - 3.1669));
      accs.push(acc);
      sideW.push(weights[i]);
    }
    if (accs.length === 0) return null;

    const totalW = sideW.reduce((a, b) => a + b, 0);
    const weightedMean = accs.reduce((sum, a, idx) => sum + a * sideW[idx], 0) / totalW;
    const harmonicMean = accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(1.0, a), 0);
    return ((weightedMean + harmonicMean) / 2).toFixed(1);
  };

  return {
    white: sideAcc('white'),
    black: sideAcc('black'),
  };
}

function renderMoveList(movesData) {
  moveTableBody.innerHTML = '';
  emptyMoves.classList.add('hidden');
  quickImportPanel.classList.add('hidden');
  resetSummaryCard();

  for (let i = 0; i < movesData.length; i += 2) {
    const wm = movesData[i];
    const bm = movesData[i + 1];
    const tr = document.createElement('tr');
    tr.className = 'move-row';

    const tdNum = document.createElement('td');
    tdNum.className = 'move-num';
    tdNum.textContent = `${wm.move_number}.`;
    tr.appendChild(tdNum);

    const makeMoveTd = (move) => {
      const td = document.createElement('td');
      if (!move) return td;
      const div = document.createElement('div');
      div.className = 'move-cell';
      div.dataset.ply = move.ply;
      div.dataset.clf = move.classification;
      div.dataset.color = move.color;

      const meta = CLF_META[move.classification] || CLF_META.good;
      const glyphHtml = meta.glyph ? `<span class="move-glyph ${meta.cls}">${meta.glyph}</span>` : '';

      let lossHtml = '';
      if (move.eval_change < -20) {
        lossHtml = `<span class="move-loss">${(move.eval_change / 100).toFixed(1)}</span>`;
      }

      div.innerHTML = `
        <div class="move-main">
          <span class="move-san">${move.san}</span>
          ${glyphHtml}
        </div>
        ${lossHtml}
      `;
      div.addEventListener('click', () => goToPly(move.ply));
      td.appendChild(div);
      return td;
    };

    tr.appendChild(makeMoveTd(wm));
    tr.appendChild(makeMoveTd(bm));

    const tdClks = document.createElement('td');
    tdClks.className = 'move-clocks-col';
    const wClk = wm?.clock || '';
    const bClk = bm?.clock || '';
    tdClks.innerHTML = `${wClk}${wClk && bClk ? '<br/>' : ''}${bClk}`;
    tr.appendChild(tdClks);

    moveTableBody.appendChild(tr);
  }
}

// ── Review Tab: Eval Graph & 2-Column Breakdown ─────────────
function scoreToGraphRatio(score) {
  if (!score) return 0.5;
  const cp = score.type === 'mate'
    ? (score.value > 0 ? 10000 : -10000)
    : score.value;
  // 0.0 = 0.5, +advantage -> toward 0 (top), -advantage -> toward 1 (bottom)
  const advantage = Math.tanh(cp / 450);
  return 0.5 - 0.46 * advantage;
}

function renderEvalGraph(movesData) {
  const svg = $('eval-graph-svg');
  if (!svg || !movesData || movesData.length === 0) return;
  svg.innerHTML = '';

  const ns = 'http://www.w3.org/2000/svg';
  const W = 400;
  const H = 110;
  const total = movesData.length;

  const points = [{ ply: 0, score: state.initialEval, clf: null }];
  for (const m of movesData) {
    points.push({ ply: m.ply, score: m.eval_after, clf: m.classification, san: m.san });
  }

  const coords = points.map((pt, idx) => ({
    x: (idx / Math.max(1, total)) * W,
    y: scoreToGraphRatio(pt.score) * H,
    pt,
  }));

  // White area fill (from bottom H up to the curve)
  const polyPts = [
    `0,${H}`,
    ...coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`),
    `${W},${H}`,
  ].join(' ');

  const whiteArea = document.createElementNS(ns, 'polygon');
  whiteArea.setAttribute('points', polyPts);
  whiteArea.setAttribute('fill', '#FAF6F0');
  svg.appendChild(whiteArea);

  // Center 0.0 reference line
  const midLine = document.createElementNS(ns, 'line');
  midLine.setAttribute('x1', '0');
  midLine.setAttribute('y1', String(H / 2));
  midLine.setAttribute('x2', String(W));
  midLine.setAttribute('y2', String(H / 2));
  midLine.setAttribute('stroke', 'rgba(140, 90, 60, 0.45)');
  midLine.setAttribute('stroke-width', '1');
  midLine.setAttribute('stroke-dasharray', '3,3');
  svg.appendChild(midLine);

  // Eval curve stroke
  const curve = document.createElementNS(ns, 'polyline');
  curve.setAttribute('points', coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '));
  curve.setAttribute('fill', 'none');
  curve.setAttribute('stroke', '#C08552');
  curve.setAttribute('stroke-width', '1.6');
  svg.appendChild(curve);

  // Color-coded classification dots for notable moves
  const dotColors = {
    brilliant: '#1B9AAA',
    great: '#4A7C9B',
    best: '#2E7D32',
    book: '#A67B5B',
    inaccuracy: '#D9822B',
    mistake: '#D9534F',
    miss: '#D46A5E',
    blunder: '#B71C1C',
  };
  for (const c of coords) {
    const col = dotColors[c.pt.clf];
    if (!col) continue;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', c.x.toFixed(1));
    dot.setAttribute('cy', c.y.toFixed(1));
    dot.setAttribute('r', c.pt.clf === 'blunder' ? '3.4' : '2.6');
    dot.setAttribute('fill', col);
    dot.setAttribute('stroke', '#22150E');
    dot.setAttribute('stroke-width', '0.8');
    svg.appendChild(dot);
  }

  // Active playhead cursor
  const cursor = document.createElementNS(ns, 'line');
  cursor.setAttribute('id', 'eval-graph-cursor');
  cursor.setAttribute('x1', '0');
  cursor.setAttribute('y1', '0');
  cursor.setAttribute('x2', '0');
  cursor.setAttribute('y2', String(H));
  cursor.setAttribute('stroke', '#C86D3B');
  cursor.setAttribute('stroke-width', '2');
  svg.appendChild(cursor);

  svg.onclick = (e) => {
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetPly = Math.round(ratio * total);
    goToPly(targetPly);
  };

  svg.onmousemove = (e) => {
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx = Math.round(ratio * total);
    const pt = points[idx];
    if (pt) {
      const lbl = pt.ply === 0 ? 'Start' : `${Math.ceil(pt.ply / 2)}. ${pt.san}`;
      $('eval-graph-hover').textContent = `${lbl} (${formatScoreStr(pt.score)})`;
    }
  };

  svg.onmouseleave = () => {
    $('eval-graph-hover').textContent = 'Click graph to jump';
  };
}

function updateEvalGraphCursor(ply) {
  const cursor = $('eval-graph-cursor');
  if (!cursor || state.moves.length === 0) return;
  const x = (Math.max(0, Math.min(ply, state.moves.length)) / state.moves.length) * 400;
  cursor.setAttribute('x1', x.toFixed(1));
  cursor.setAttribute('x2', x.toFixed(1));
}

function renderReviewTab(movesData, summary = null) {
  const emptyEl = $('review-empty');
  const bodyEl = $('review-body');
  if (!movesData || movesData.length === 0) {
    emptyEl.classList.remove('hidden');
    bodyEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  bodyEl.classList.remove('hidden');

  const acc = calculateAccuracy(movesData);
  const wAcc = summary?.white_accuracy ?? acc.white;
  const bAcc = summary?.black_accuracy ?? acc.black;
  $('rev-w-name').textContent = state.headers.white || 'White';
  $('rev-b-name').textContent = state.headers.black || 'Black';
  $('rev-w-avatar').textContent = (state.headers.white || 'W')[0].toUpperCase();
  $('rev-b-avatar').textContent = (state.headers.black || 'B')[0].toUpperCase();
  $('rev-w-acc').textContent = wAcc !== null && wAcc !== undefined ? `${wAcc}%` : '—';
  $('rev-b-acc').textContent = bAcc !== null && bAcc !== undefined ? `${bAcc}%` : '—';
  $('rev-w-rating').textContent = summary?.white_game_rating ?? '—';
  $('rev-b-rating').textContent = summary?.black_game_rating ?? '—';
  $('rev-w-acpl').textContent = summary?.white_acpl ?? '—';
  $('rev-b-acpl').textContent = summary?.black_acpl ?? '—';

  const emptyCounts = () => ({
    brilliant: 0, great: 0, best: 0, excellent: 0, good: 0,
    book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0,
  });
  const counts = { white: emptyCounts(), black: emptyCounts() };
  for (const m of movesData) {
    if (counts[m.color] && counts[m.color][m.classification] !== undefined) {
      counts[m.color][m.classification]++;
    }
  }

  const rows = [
    { key: 'brilliant', label: 'Brilliant', icon: '!!', cls: 'clf-brilliant' },
    { key: 'great', label: 'Great', icon: '!', cls: 'clf-great' },
    { key: 'best', label: 'Best', icon: '★', cls: 'clf-best' },
    { key: 'excellent', label: 'Excellent', icon: THUMB_SVG, cls: 'clf-excellent' },
    { key: 'good', label: 'Good', icon: '✓', cls: 'clf-good' },
    { key: 'book', label: 'Book', icon: BOOK_SVG, cls: 'clf-book' },
    { key: 'inaccuracy', label: 'Inaccuracy', icon: '?!', cls: 'clf-inaccuracy' },
    { key: 'mistake', label: 'Mistake', icon: '?', cls: 'clf-mistake' },
    { key: 'miss', label: 'Miss', icon: '✕', cls: 'clf-miss' },
    { key: 'blunder', label: 'Blunder', icon: '??', cls: 'clf-blunder' },
  ];

  const tbody = $('review-clf-tbody');
  tbody.innerHTML = '';

  for (const r of rows) {
    const wCnt = counts.white[r.key];
    const bCnt = counts.black[r.key];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="rt-label">${r.label}</td>
      <td class="rt-cnt"><button class="review-cnt-btn" data-clf="${r.key}" data-color="white" ${wCnt === 0 ? 'disabled' : ''}>${wCnt}</button></td>
      <td class="rt-ico"><span class="rt-badge ${r.cls}">${r.icon}</span></td>
      <td class="rt-cnt"><button class="review-cnt-btn" data-clf="${r.key}" data-color="black" ${bCnt === 0 ? 'disabled' : ''}>${bCnt}</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.review-cnt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterMovesByClassification(btn.dataset.clf, btn.dataset.color);
    });
  });

  renderEvalGraph(movesData);
  renderClockChart(movesData, state.gameReport);
  updateEvalGraphCursor(state.plyIndex);
}

// ── Time Spent Per Move Chart (Review Tab) ──────────────────
function renderClockChart(movesData, report = null) {
  const card = $('clock-chart-card');
  const svg = $('clock-graph-svg');
  const pillsEl = $('clock-pills-row');
  const summaryEl = $('clock-graph-summary');
  if (!card || !svg) return;

  const series = (report?.clock_series && report.clock_series.length)
    ? report.clock_series
    : (movesData || [])
        .filter(m => typeof m.time_spent === 'number')
        .map(m => ({
          ply: m.ply,
          move_number: m.move_number,
          color: m.color,
          san: m.san,
          time_spent: m.time_spent,
          clock_seconds: m.clock_seconds,
          classification: m.classification,
        }));

  if (!series.length) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  svg.innerHTML = '';
  const W = 400;
  const H = 84;
  const padY = 6;
  const maxSpend = Math.max(10, ...series.map(s => Number(s.time_spent || 0)));
  const barW = Math.max(2, (W - 8) / series.length);
  const ns = 'http://www.w3.org/2000/svg';

  const colorFor = (s) => {
    const c = (s.classification || '').toLowerCase();
    if (c === 'blunder') return '#B71C1C';
    if (c === 'miss' || c === 'mistake') return '#D9534F';
    if (c === 'inaccuracy') return '#D9822B';
    if (c === 'brilliant') return '#1B9AAA';
    return s.color === 'white' ? '#C08552' : '#5A3B2B';
  };

  series.forEach((pt, idx) => {
    const spent = Math.max(0.4, Number(pt.time_spent || 0));
    const bh = Math.max(3, (spent / maxSpend) * (H - padY * 2));
    const x = 4 + idx * barW;
    const y = H - padY - bh;

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', x.toFixed(1));
    rect.setAttribute('y', y.toFixed(1));
    rect.setAttribute('width', Math.max(1.5, barW - 0.8).toFixed(1));
    rect.setAttribute('height', bh.toFixed(1));
    rect.setAttribute('fill', colorFor(pt));
    rect.setAttribute('rx', '1');
    rect.style.cursor = 'pointer';
    rect.addEventListener('mouseenter', () => {
      if (summaryEl) summaryEl.textContent = `Move ${pt.move_number} (${pt.san}): ${pt.time_spent}s`;
    });
    rect.addEventListener('click', () => goToPly(pt.ply));
    svg.appendChild(rect);
  });

  if (summaryEl) summaryEl.textContent = `Peak ${Math.round(maxSpend)}s · Click bar`;
  if (pillsEl) {
    const side = state.reportSide || 'white';
    const clk = report?.[side]?.clock;
    if (clk && clk.has_clock_data) {
      const pills = [
        `<span class="clock-pill">Avg: ${clk.avg_time_spent}s/move</span>`,
      ];
      if (clk.rushed_blunders > 0) {
        pills.push(`<span class="clock-pill clock-pill-warn">Rushed errors: ${clk.rushed_blunders}</span>`);
      }
      if (clk.time_trouble_blunders > 0) {
        pills.push(`<span class="clock-pill clock-pill-danger">Low-clock errors: ${clk.time_trouble_blunders}</span>`);
      }
      if (clk.longest_think) {
        pills.push(`<span class="clock-pill">Longest: ${clk.longest_think.san} (${clk.longest_think.seconds}s)</span>`);
      }
      pillsEl.innerHTML = pills.join('');
    } else {
      pillsEl.innerHTML = '';
    }
  }
}

// ── Guided Key Moments Walkthrough & Retry Mistake Mode ─────
const KEY_MOMENT_CLASSES = new Set(['blunder', 'miss', 'mistake', 'brilliant', 'great']);

function getKeyMomentPlies() {
  return (state.moves || [])
    .filter(m => KEY_MOMENT_CLASSES.has((m.classification || '').toLowerCase()))
    .map(m => m.ply);
}

function updateKeyMomentsUI() {
  const strip = $('key-moments-strip');
  const counterEl = $('key-moment-counter');
  const retryBtn = $('btn-retry-mistake');
  const retryBanner = $('retry-banner');
  if (!strip) return;

  const keys = getKeyMomentPlies();
  if (!keys.length) {
    strip.classList.add('hidden');
    return;
  }

  strip.classList.remove('hidden');
  const idx = keys.indexOf(state.plyIndex);
  const curMove = state.plyIndex > 0 ? state.moves[state.plyIndex - 1] : null;
  if (counterEl) {
    if (idx !== -1 && curMove) {
      const lbl = curMove.classification.toUpperCase();
      counterEl.textContent = `Key ${idx + 1}/${keys.length} · ${lbl}`;
    } else {
      counterEl.textContent = `${keys.length} Key Moment${keys.length === 1 ? '' : 's'}`;
    }
  }

  const canRetry = Boolean(
    curMove &&
    ['blunder', 'miss', 'mistake'].includes((curMove.classification || '').toLowerCase()) &&
    curMove.best_move &&
    curMove.best_move !== curMove.uci
  );
  if (retryBtn) {
    retryBtn.classList.toggle('hidden', !canRetry || state.retry.active);
  }
  if (retryBanner) {
    retryBanner.classList.toggle('hidden', !state.retry.active);
  }
}

function jumpKeyMoment(delta = 1) {
  const keys = getKeyMomentPlies();
  if (!keys.length) return;
  let target;
  if (delta > 0) {
    target = keys.find(p => p > state.plyIndex) ?? keys[0];
  } else {
    const prevs = keys.filter(p => p < state.plyIndex);
    target = prevs.length ? prevs[prevs.length - 1] : keys[keys.length - 1];
  }
  goToPly(target);
}

function startRetryMistake() {
  if (state.plyIndex <= 0) return;
  const m = state.moves[state.plyIndex - 1];
  if (!m || !m.best_move || m.best_move === m.uci) return;

  cancelExplainDemo();
  exitSubgame(true);
  clearAnnotations();
  clearMoveSelection();

  state.retry = {
    active: true,
    targetPly: state.plyIndex,
    branchPly: state.plyIndex - 1,
    bestMove: m.best_move,
    bestMoveSan: m.best_move_san || m.best_move,
    playedSan: m.san,
    triesLeft: 2,
    solved: false,
    prevShowBest: state.showBestMove,
  };
  state.showBestMove = false;
  state.isPreviewingBest = false;

  const preGame = buildGameAtPly(state.retry.branchPly);
  state.board.position(preGame.fen(), true);
  highlightLastMove(null, null, null);
  renderBoardArrows();
  updateKeyMomentsUI();

  const statusEl = $('retry-status');
  if (statusEl) {
    statusEl.textContent = `Move ${m.move_number}: Find a better move than ${m.san} (2 tries left)`;
  }
  window.BlunderlessChesterArt?.say(
    `Retry Move ${m.move_number}! Instead of ${m.san}, tap or drag a stronger move on the board.`,
    'suspicious'
  );
}

function handleRetryAttempt(fromSq, toSq) {
  if (!state.retry.active || state.retry.solved) return false;
  const g = buildGameAtPly(state.retry.branchPly);
  const mv = g.move({ from: fromSq, to: toSq, promotion: 'q' });
  if (!mv) return false;

  const uci = mv.from + mv.to + (mv.promotion || '');
  const best = state.retry.bestMove || '';
  const isExact = uci === best || uci.slice(0, 4) === best.slice(0, 4);
  const statusEl = $('retry-status');

  if (isExact) {
    state.retry.solved = true;
    state.board.position(g.fen(), true);
    highlightLastMove(mv.from, mv.to, 'best');
    playMoveSound({ san: mv.san }, g);
    if (statusEl) statusEl.textContent = `Spot on! ${mv.san} is Stockfish's best move!`;
    window.BlunderlessChesterArt?.say(
      `Nailed it! ${mv.san} was the best move—much cleaner than ${state.retry.playedSan}!`,
      'smug'
    );
    state.showBestMove = true;
    renderBoardArrows();
    return true;
  }

  state.retry.triesLeft -= 1;
  sounds.reverse();
  if (state.retry.triesLeft > 0) {
    if (statusEl) {
      statusEl.textContent = `Not ${mv.san} — try again (${state.retry.triesLeft} try left)`;
    }
    window.BlunderlessChesterArt?.say(
      `Not quite with ${mv.san}. Scan checks, captures, and undefended pieces—1 try left!`,
      'annoyed'
    );
    state.board.position(buildGameAtPly(state.retry.branchPly).fen(), true);
  } else {
    revealRetryAnswer();
  }
  return true;
}

function revealRetryAnswer() {
  if (!state.retry.active) return;
  const best = state.retry.bestMove;
  const bestSan = state.retry.bestMoveSan;
  state.retry.solved = true;
  state.showBestMove = true;

  if (best && best.length >= 4) {
    const g = buildGameAtPly(state.retry.branchPly);
    const mv = g.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best.slice(4, 5) || 'q' });
    if (mv) {
      state.board.position(g.fen(), true);
      highlightLastMove(mv.from, mv.to, 'best');
      playMoveSound({ san: mv.san }, g);
    }
  }
  const statusEl = $('retry-status');
  if (statusEl) statusEl.textContent = `Best move was ${bestSan}. Click [EXPLAIN] to see why!`;
  window.BlunderlessChesterArt?.say(
    `The best move was ${bestSan} instead of ${state.retry.playedSan}. Hit [EXPLAIN] to see the full breakdown!`,
    'deadpan'
  );
  renderBoardArrows();
}

function exitRetryMode(skipGoToPly = false) {
  if (!state.retry.active) return;
  const targetPly = state.retry.targetPly;
  const restoreBest = state.retry.prevShowBest;
  state.retry.active = false;
  state.retry.solved = false;
  state.showBestMove = restoreBest;
  updateKeyMomentsUI();
  if (!skipGoToPly) {
    goToPly(targetPly);
  }
}

// ── Shareable Discord Review Card (PNG) & Annotated PGN ─────
async function generateReviewCardPng() {
  if (!state.moves || !state.moves.length) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');

  // Background & Editorial Frame
  ctx.fillStyle = isDark ? '#17110D' : '#FAF6F0';
  ctx.fillRect(0, 0, 960, 540);
  ctx.strokeStyle = isDark ? '#F1E6D8' : '#2B1A12';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, 924, 504);

  const ink = isDark ? '#F1E6D8' : '#2B1A12';
  const muted = isDark ? '#BBA38F' : '#8C5A3C';
  const cardBg = isDark ? '#221A14' : '#FFFDF9';
  const accent = '#C86D3B';

  // Header
  ctx.fillStyle = accent;
  ctx.font = 'bold 20px monospace';
  ctx.fillText('BLUNDERLESS · STOCKFISH GAME REVIEW', 44, 62);
  ctx.fillStyle = muted;
  ctx.font = '15px monospace';
  const openingStr = `${state.headers.eco ? state.headers.eco + ' · ' : ''}${state.lastKnownOpening || 'Chess Game'}`;
  ctx.fillText(openingStr.slice(0, 68), 44, 88);

  const resultTxt = state.headers.result || '*';
  ctx.fillStyle = ink;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(resultTxt, 916, 66);
  ctx.textAlign = 'left';

  // Player Accuracy Boxes
  const acc = calculateAccuracy(state.moves);
  const wAcc = state.summary?.white_accuracy ?? acc.white ?? '—';
  const bAcc = state.summary?.black_accuracy ?? acc.black ?? '—';
  const wRat = state.summary?.white_game_rating ?? '—';
  const bRat = state.summary?.black_game_rating ?? '—';
  const cnts = { white: { brilliant: 0, blunder: 0, mistake: 0 }, black: { brilliant: 0, blunder: 0, mistake: 0 } };
  for (const m of state.moves) {
    if (cnts[m.color] && cnts[m.color][m.classification] !== undefined) cnts[m.color][m.classification]++;
  }

  const drawPlayerBox = (x, label, name, elo, accuracy, rating, c) => {
    ctx.fillStyle = cardBg;
    ctx.fillRect(x, 110, 424, 152);
    ctx.strokeStyle = isDark ? 'rgba(241,230,216,0.28)' : 'rgba(43,26,18,0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 110, 424, 152);

    ctx.fillStyle = muted;
    ctx.font = 'bold 13px monospace';
    ctx.fillText(label, x + 18, 136);
    ctx.fillStyle = ink;
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`${(name || label).slice(0, 18)}${elo ? ' (' + elo + ')' : ''}`, x + 18, 166);
    ctx.fillStyle = accent;
    ctx.font = 'bold 34px monospace';
    ctx.fillText(`${accuracy}%`, x + 18, 212);
    ctx.fillStyle = muted;
    ctx.font = '14px monospace';
    ctx.fillText(`Est. Rating: ${rating}`, x + 168, 206);
    ctx.fillStyle = ink;
    ctx.font = '14px monospace';
    ctx.fillText(`!! ${c.brilliant}   ? ${c.mistake}   ?? ${c.blunder}`, x + 18, 244);
  };

  drawPlayerBox(44, 'WHITE', state.headers.white, state.headers.white_elo, wAcc, wRat, cnts.white);
  drawPlayerBox(492, 'BLACK', state.headers.black, state.headers.black_elo, bAcc, bRat, cnts.black);

  // Mini Evaluation Graph
  const gx = 44, gy = 286, gw = 872, gh = 112;
  ctx.fillStyle = isDark ? '#140D09' : '#2B1A12';
  ctx.fillRect(gx, gy, gw, gh);
  const pts = [scoreToGraphRatio(state.initialEval), ...state.moves.map(m => scoreToGraphRatio(m.eval_after))];
  const stepX = gw / Math.max(1, pts.length - 1);
  ctx.beginPath();
  ctx.moveTo(gx, gy + gh);
  pts.forEach((r, i) => {
    const px = gx + i * stepX;
    const py = gy + (1 - r) * gh;
    ctx.lineTo(px, py);
  });
  ctx.lineTo(gx + gw, gy + gh);
  ctx.closePath();
  ctx.fillStyle = '#FAF6F0';
  ctx.fill();

  ctx.strokeStyle = 'rgba(200,109,59,0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gx, gy + gh / 2);
  ctx.lineTo(gx + gw, gy + gh / 2);
  ctx.stroke();

  // Chester Summary Footer
  const side = state.reportSide || 'white';
  const rawQuote = state.gameReport?.[side]?.overall_summary || `Analysed ${state.moves.length} half-moves with Stockfish.`;
  ctx.fillStyle = ink;
  ctx.font = '15px monospace';
  const words = (`Chester: "${rawQuote}"`).split(/\s+/);
  let line = '';
  let ty = 432;
  for (const w of words) {
    if ((line + ' ' + w).length > 82) {
      ctx.fillText(line.trim(), 44, ty);
      line = w;
      ty += 22;
      if (ty > 492) break;
    } else {
      line += ' ' + w;
    }
  }
  if (line.trim() && ty <= 496) ctx.fillText(line.trim(), 44, ty);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const filename = `blunderless-${(state.headers.white || 'white').replace(/\W+/g, '')}-vs-${(state.headers.black || 'black').replace(/\W+/g, '')}.png`;

  if (navigator.canShare && typeof File !== 'undefined') {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: 'Blunderless Game Review', files: [file] });
        return;
      } catch (_) {}
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportAnnotatedPgn() {
  if (!state.moves || !state.moves.length) return;
  const h = state.headers || {};
  const lines = [
    `[Event "${h.event || 'Blunderless Review'}"]`,
    `[Site "${h.site || 'Blunderless'}"]`,
    `[Date "${h.date || '????.??.??'}"]`,
    `[White "${h.white || 'White'}"]`,
    `[Black "${h.black || 'Black'}"]`,
    `[Result "${h.result || '*'}"]`,
  ];
  if (h.eco) lines.push(`[ECO "${h.eco}"]`);
  if (state.lastKnownOpening) lines.push(`[Opening "${state.lastKnownOpening}"]`);
  lines.push('');

  const glyphs = {
    brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', miss: '?', blunder: '??',
  };
  const fmtEv = (sc) => {
    if (!sc) return '0.00';
    if (sc.type === 'mate') return `#${sc.value}`;
    return `${(sc.value / 100).toFixed(2)}`;
  };

  const tokens = [];
  for (const m of state.moves) {
    if (m.color === 'white') tokens.push(`${m.move_number}.`);
    const g = glyphs[m.classification] || '';
    const notes = [`[%eval ${fmtEv(m.eval_after)}]`];
    if (['blunder', 'miss', 'mistake'].includes(m.classification) && m.best_move_san && m.best_move_san !== m.san) {
      notes.push(`Best was ${m.best_move_san}`);
    }
    tokens.push(`${m.san}${g} { ${notes.join(' ')} }`);
  }
  tokens.push(h.result || '*');
  lines.push(tokens.join(' '));

  const blob = new Blob([lines.join('\n')], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blunderless-annotated.pgn`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderGameReport(report, side = 'white') {
  const section = $('coach-report-section');
  if (!section) return;
  if (!report || !report[side]) {
    section.classList.add('hidden');
    return;
  }

  state.reportSide = side;
  section.classList.remove('hidden');

  const data = report[side];
  const btnW = $('report-btn-white');
  const btnB = $('report-btn-black');
  if (btnW) {
    btnW.textContent = report.white?.player_name || 'White';
    btnW.classList.toggle('active', side === 'white');
  }
  if (btnB) {
    btnB.textContent = report.black?.player_name || 'Black';
    btnB.classList.toggle('active', side === 'black');
  }

  const tonePill = $('report-tone-pill');
  if (tonePill) {
    const toneLabels = {
      instructive: 'INSTRUCTIVE',
      candid: 'COACH NOTE',
      sarcastic: 'ROAST MODE',
    };
    tonePill.textContent = toneLabels[data.tone] || 'INSTRUCTIVE';
    tonePill.className = `report-tone-pill tone-${data.tone || 'instructive'}`;
  }

  const overallEl = $('report-overall-text');
  if (overallEl) overallEl.textContent = data.overall_summary || '';

  // Stage-by-stage cards (Opening, Middlegame, Endgame)
  const stagesEl = $('report-stages-list');
  if (stagesEl) {
    stagesEl.innerHTML = '';
    const stageMeta = [
      { key: 'opening', title: 'Opening' },
      { key: 'middlegame', title: 'Middlegame' },
      { key: 'endgame', title: 'Endgame' },
    ];
    for (const sm of stageMeta) {
      const st = data.stages?.[sm.key];
      if (!st) continue;
      const card = document.createElement('div');
      card.className = 'report-stage-card';

      const accText = st.reached && st.accuracy !== null ? `${st.accuracy}%` : '—';
      const gradeCls = st.grade?.cls || 'na';
      const gradeLbl = st.grade?.label || 'Not Reached';

      const topHtml = `
        <div class="stage-card-top">
          <div class="stage-name-wrap">
            <span class="stage-name">${sm.title}</span>
            <span class="stage-range">${st.move_range || ''}</span>
          </div>
          <div class="stage-metrics">
            <span class="stage-acc-num">${accText}</span>
            <span class="stage-grade-badge grade-${gradeCls}">${gradeLbl}</span>
          </div>
        </div>`;

      const commentsWrap = document.createElement('div');
      commentsWrap.className = 'stage-comments';
      for (const line of (st.comments || [])) {
        const p = document.createElement('p');
        p.textContent = line;
        commentsWrap.appendChild(p);
      }

      card.innerHTML = topHtml;
      card.appendChild(commentsWrap);

      const km = st.key_moment;
      if (km && km.ply) {
        const btn = document.createElement('button');
        btn.className = 'stage-key-move-btn';
        const prefix = km.is_positive ? '★ Jump to highlight:' : '▸ Jump to key moment:';
        btn.textContent = `${prefix} Move ${km.move_number} (${km.san}, ${km.eval_after})`;
        btn.addEventListener('click', () => {
          goToPly(km.ply);
        });
        card.appendChild(btn);
      }

      stagesEl.appendChild(card);
    }
  }

  // Tactics & Strategy cards
  const skillsEl = $('report-skills-grid');
  if (skillsEl) {
    skillsEl.innerHTML = '';
    const skillItems = [
      { title: 'Tactics', info: data.tactics },
      { title: 'Strategy', info: data.strategy },
    ];
    for (const item of skillItems) {
      if (!item.info) continue;
      const card = document.createElement('div');
      card.className = 'report-skill-card';
      const gradeCls = item.info.grade?.cls || 'solid';
      const score = item.info.score ?? 0;

      card.innerHTML = `
        <div class="skill-top-row">
          <span class="skill-title">${item.title}</span>
          <span class="skill-score-num">${score}/100 · ${item.info.grade?.label || ''}</span>
        </div>
        <div class="skill-bar-track">
          <div class="skill-bar-fill grade-${gradeCls}" style="width: ${score}%"></div>
        </div>
      `;

      const ul = document.createElement('ul');
      ul.className = 'report-bullets';
      for (const b of (item.info.bullets || [])) {
        const li = document.createElement('li');
        li.textContent = b;
        ul.appendChild(li);
      }
      card.appendChild(ul);
      skillsEl.appendChild(card);
    }
  }

  // Next-game tips
  const tipsEl = $('report-tips-list');
  if (tipsEl) {
    tipsEl.innerHTML = '';
    (data.tips || []).forEach((tip, idx) => {
      const li = document.createElement('li');
      li.className = 'report-tip-item';
      const titleEl = document.createElement('div');
      titleEl.className = 'report-tip-title';
      titleEl.textContent = `${idx + 1}. ${tip.title}`;
      const detailEl = document.createElement('p');
      detailEl.className = 'report-tip-detail';
      detailEl.textContent = tip.detail;
      li.appendChild(titleEl);
      li.appendChild(detailEl);
      tipsEl.appendChild(li);
    });
  }
}

// ── Filter Moves by Classification (Per-Player Cycle) ────────
function filterMovesByClassification(clf, colorFilter = null) {
  const filterKey = `${clf}:${colorFilter || 'all'}`;
  const buttons = document.querySelectorAll('.review-cnt-btn');

  const matchingPlies = state.moves
    .filter(m => m.classification === clf && (!colorFilter || m.color === colorFilter))
    .map(m => m.ply);

  if (matchingPlies.length === 0) return;

  if (state.activeFilter === filterKey) {
    // Cycle to next matching move for that player/category
    const nextIdx = matchingPlies.findIndex(p => p > state.plyIndex);
    const targetPly = nextIdx !== -1 ? matchingPlies[nextIdx] : matchingPlies[0];
    goToPly(targetPly);
    return;
  }

  state.activeFilter = filterKey;
  buttons.forEach(b => b.classList.toggle('filter-active', b.dataset.clf === clf && (!colorFilter || b.dataset.color === colorFilter)));

  document.querySelectorAll('.move-cell').forEach(c => {
    const isMatch = c.dataset.clf === clf && (!colorFilter || c.dataset.color === colorFilter);
    c.style.opacity = isMatch ? '1' : '0.35';
  });

  goToPly(matchingPlies[0]);
}

// ── Analysis Requests (Sequenced & Cancellable) ─────────────
let _analysisLoadSeq = 0;
let _analysisAbortCtrl = null;
const ANALYSE_BTN_DEFAULT_HTML = '<span class="cta-glyph">★</span><span>Game Review / Analyse</span>';

function setBoardLoading(isLoading, label = 'Analysing with Stockfish...', seq = null) {
  if (seq !== null && seq !== _analysisLoadSeq) return;
  analyseBtn.disabled = Boolean(isLoading);
  analyseBtn.innerHTML = isLoading
    ? `<span class="spinner"></span><span>${label}</span>`
    : ANALYSE_BTN_DEFAULT_HTML;
}

function beginNewAnalysisLoad(label = 'Analysing with Stockfish...') {
  _analysisLoadSeq += 1;
  const seq = _analysisLoadSeq;
  if (_analysisAbortCtrl) {
    try { _analysisAbortCtrl.abort(); } catch (_) {}
  }
  _analysisAbortCtrl = new AbortController();
  cancelExplainDemo();
  exitSubgame(true);
  clearAnnotations();
  clearMoveSelection();
  state.isPreviewingBest = false;
  setBoardLoading(true, label, seq);
  setStatus(`<span class="spinner"></span> ${label}`);
  return { seq, signal: _analysisAbortCtrl.signal };
}

function cancelPendingAnalysisLoad() {
  if (!_analysisAbortCtrl) return;
  _analysisLoadSeq += 1;
  try { _analysisAbortCtrl.abort(); } catch (_) {}
  _analysisAbortCtrl = null;
  document.querySelectorAll('.game-card.loading').forEach(el => el.classList.remove('loading'));
  setBoardLoading(false);
}

async function runAnalysis(customText = null, opts = {}) {
  const fallbackVal = (pgnInput.value || '').trim() || (quickInput?.value || '').trim();
  const raw = (customText !== null && customText !== undefined ? String(customText) : fallbackVal).trim();
  if (!raw) {
    // On mobile/tablet, jump to Moves tab (Quick Import + Sample Game) and scroll it into view
    // so tapping "Game Review / Analyse" on an empty board clearly shows how to load a game.
    if (window.innerWidth <= 1023) {
      switchTab('moves');
      const importEl = $('quick-import-panel') || document.querySelector('.right-sidebar');
      if (importEl) importEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const typedEl = $('knight-typed');
      if (typedEl) typedEl.textContent = 'Paste a PGN or tap SAMPLE GAME below to run Game Review!';
    } else {
      switchTab('info');
    }
    return setStatus('Paste a PGN or FEN first (or tap SAMPLE GAME).', 'error');
  }
  if (!pgnInput.value.trim()) pgnInput.value = raw;

  const label = opts.label || 'Analysing with Stockfish...';
  const { seq, signal } = beginNewAnalysisLoad(label);
  const isFen = !raw.includes('\n') && raw.split(/\s+/).length === 6;

  try {
    if (isFen) await analyseFen(raw, seq, signal);
    else await analysePgn(raw, null, opts.targetPly || 0, opts.userHandle || null, seq, signal);
  } catch (err) {
    if (err?.name === 'AbortError' || seq !== _analysisLoadSeq) return;
    setStatus(err.message, 'error');
    if (opts.errorBannerContainer) {
      const existing = opts.errorBannerContainer.querySelector('.games-error-banner');
      if (existing) existing.remove();
      const banner = document.createElement('div');
      banner.className = 'games-error-banner';
      banner.textContent = `Could not load game: ${err.message}`;
      opts.errorBannerContainer.prepend(banner);
    }
  } finally {
    if (seq === _analysisLoadSeq) {
      _analysisAbortCtrl = null;
      document.querySelectorAll('.game-card.loading').forEach(el => el.classList.remove('loading'));
      setBoardLoading(false, '', seq);
    }
  }
}

async function analyseFen(fen, seq = _analysisLoadSeq, signal = null) {
  const res = await fetchApi('/api/analyse-fen', 'POST', { fen, depth: 12 }, signal);
  if (seq !== _analysisLoadSeq) return;

  state.initialFen = fen;
  state.initialEval = res.engine.score;
  state.initialBestMove = res.engine.best_move || null;
  state.initialBestMoveSan = res.engine.best_move_san || null;
  state.topLines = res.engine.top_lines || [];
  state.moves = [];
  state.plyIndex = 0;
  state.lastKnownOpening = 'Custom FEN Position';
  state.lastKnownEco = '';
  state.lastBookPly = 0;
  state.headers = { white: 'White', black: 'Black', white_elo: '', black_elo: '', initial_clock: '--:--' };

  engineMeta.textContent = `Stockfish · d${res.depth || 12}`;
  state.board.position(fen, true);
  setEvalBar(res.engine.score);
  updateEngineLines(res.engine.score, res.engine.best_move_san);
  updateOpeningDisplay(fen);
  syncPlayerBars(0);
  resetSummaryCard();
  updateBestMoveUI();
  renderBoardArrows();
  updateCoachContext(fen, 0, null);

  moveTableBody.innerHTML = '';
  gameHeaders.classList.add('hidden');
  emptyMoves.textContent = `FEN loaded. Best move: ${res.engine.best_move_san || '—'}`;
  emptyMoves.classList.remove('hidden');
  quickImportPanel.classList.add('hidden');
  highlightLastMove(null, null, null);
  setStatus('FEN analysed · depth 12', 'ok');
  switchTab('moves');
}

function getPreferredDepth() {
  try {
    const n = parseInt(localStorage.getItem('blunderless_depth') || '10', 10);
    return Number.isFinite(n) && n >= 6 && n <= 18 ? n : 10;
  } catch (_) {
    return 10;
  }
}

async function fetchPgnStream(pgn, depth, seq, signal = null) {
  const resp = await fetch('/api/analyse-pgn/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pgn, depth }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    return fetchApi('/api/analyse-pgn', 'POST', { pgn, depth }, signal);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;
  let streamError = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      let evName = 'message';
      let dataStr = '';
      for (const ln of frame.split('\n')) {
        if (ln.startsWith('event:')) evName = ln.slice(6).trim();
        else if (ln.startsWith('data:')) dataStr += ln.slice(5).trim();
      }
      if (!dataStr) continue;
      let parsed;
      try { parsed = JSON.parse(dataStr); } catch (_) { continue; }

      if (evName === 'progress') {
        const p = parsed.ply ?? 0;
        const tot = parsed.total ?? 0;
        const pct = parsed.pct ?? 0;
        const lbl = tot > 0 ? `Analysing ${p}/${tot} (${pct}%)...` : 'Analysing with Stockfish...';
        setBoardLoading(true, lbl, seq);
        setStatus(`<span class="spinner"></span> ${lbl}`);
      } else if (evName === 'done') {
        finalResult = parsed;
      } else if (evName === 'error') {
        streamError = parsed.detail || 'Analysis stream error';
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (finalResult) return finalResult;
  return fetchApi('/api/analyse-pgn', 'POST', { pgn, depth }, signal);
}

async function analysePgn(pgn, cachedResult = null, targetPly = 0, userHandleOverride = null, seq = _analysisLoadSeq, signal = null) {
  const depth = getPreferredDepth();
  const res = cachedResult || await fetchPgnStream(pgn, depth, seq, signal);
  if (seq !== _analysisLoadSeq) return;

  cancelExplainDemo();
  exitRetryMode(true);
  exitSubgame(true);
  clearAnnotations();
  clearMoveSelection();
  state.isPreviewingBest = false;
  state.summary = res.summary || null;

  if (userHandleOverride) {
    state.searchedUser = userHandleOverride.trim().toLowerCase();
  }

  state.initialFen = res.initial_fen;
  state.initialEval = res.initial_eval;
  state.initialTopLines = res.initial_top_lines || [];
  state.initialBestMove = res.moves[0]?.best_move || null;
  state.initialBestMoveSan = res.moves[0]?.best_move_san || null;
  state.topLines = state.initialTopLines;
  state.moves = res.moves;
  state.plyIndex = 0;
  state.lastKnownOpening = res.headers.opening || 'Starting Position';
  state.lastKnownEco = res.headers.eco || '';
  state.lastBookPly = 0;
  // Preserve Termination header even for previously cached analyses by parsing raw PGN as fallback
  let termination = res.headers.termination || '';
  if (!termination && typeof pgn === 'string') {
    const termMatch = pgn.match(/\[Termination\s+"([^"]+)"\]/i);
    if (termMatch) termination = termMatch[1];
  }
  state.headers = { ...res.headers, termination };

  engineMeta.textContent = `Stockfish · d${res.depth || 10}`;

  gameHeaders.classList.remove('hidden');
  gameHeaders.innerHTML = `
    <div class="info-row"><span class="info-key">MATCHUP</span><span class="info-val">${res.headers.white} vs ${res.headers.black}</span></div>
    <div class="info-row"><span class="info-key">EVENT / DATE</span><span class="info-val">${res.headers.event || '—'} · ${res.headers.date || '—'}</span></div>
    <div class="info-row"><span class="info-key">TIME CONTROL</span><span class="info-val">${res.headers.time_control || '—'}</span></div>
    <div class="info-row"><span class="info-key">RESULT</span><span class="info-val">${res.headers.result || '*'}</span></div>
  `;

  renderMoveList(res.moves);
  renderReviewTab(res.moves, res.summary || null);
  emptyMoves.classList.add('hidden');

  // Auto-POV orientation based on searched username
  const blackPlayer = (res.headers.black || '').trim().toLowerCase();
  const shouldFlip = Boolean(state.searchedUser && blackPlayer === state.searchedUser);
  setBoardOrientation(shouldFlip ? 'black' : 'white');

  // Render Coach's Game Report defaulting to the user's own side
  state.gameReport = res.report || null;
  renderGameReport(state.gameReport, shouldFlip ? 'black' : 'white');
  renderClockChart(res.moves, state.gameReport);

  const jumpPly = Math.max(0, Math.min(targetPly || 0, res.moves.length));
  goToPly(jumpPly);
  setStatus(`Loaded · ${res.moves.length} half-moves`, 'ok');
  switchTab(jumpPly > 0 ? 'moves' : 'review');
}

// ── Chess.com Loader ────────────────────────────────────────
async function loadChessComGames(usernameOverride = null) {
  const username = usernameOverride || $('chesscom-input').value.trim() || $('tab-chesscom-input').value.trim();
  if (!username) return;

  // Prevent an in-flight sample/older game load from yanking the user back out of the Games tab
  cancelPendingAnalysisLoad();

  state.searchedUser = username.trim().toLowerCase();
  $('chesscom-input').value = username;
  $('tab-chesscom-input').value = username;

  gamesList.innerHTML = '<div class="empty-state"><span class="spinner"></span> Fetching games from Chess.com...</div>';
  switchTab('games');

  try {
    const res = await fetchApi(`/api/chesscom/${encodeURIComponent(username)}`);
    renderGameCards(res.games, username);
  } catch (err) {
    gamesList.innerHTML = `<div class="empty-state" style="color:var(--c-blunder)">${err.message}</div>`;
  }
}

function renderGameCards(games, currentUser) {
  if (!games || games.length === 0) {
    gamesList.innerHTML = '<div class="empty-state">No games found for this user.</div>';
    return;
  }
  gamesList.innerHTML = '';

  for (const g of games) {
    const me = g.white.username.toLowerCase() === currentUser.toLowerCase();
    const myRes = me ? g.white.result : g.black.result;
    const oppName = me ? g.black.username : g.white.username;
    const myRat = me ? g.white.rating : g.black.rating;
    const oppRat = me ? g.black.rating : g.white.rating;

    const cls = myRes === 'win' ? 'result-win'
      : (myRes === 'resigned' || myRes === 'checkmated' || myRes === 'timeout') ? 'result-loss'
        : 'result-draw';
    const lbl = myRes === 'win' ? 'Win'
      : (myRes === 'resigned' || myRes === 'checkmated' || myRes === 'timeout') ? 'Loss' : 'Draw';
    const date = g.end_time ? new Date(g.end_time * 1000).toLocaleDateString() : '';

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML =
      `<div class="game-card-players">${currentUser} (${myRat}) vs ${oppName} (${oppRat})</div>` +
      `<div class="game-card-meta">
        <span class="${cls}">${lbl}</span>
        <span>${g.time_class}</span>
        <span>${date}</span>
      </div>`;
    card.addEventListener('click', () => {
      if (!g.pgn || !g.pgn.trim()) {
        const banner = document.createElement('div');
        banner.className = 'games-error-banner';
        banner.textContent = 'This game has no PGN moves available to analyse.';
        gamesList.querySelector('.games-error-banner')?.remove();
        gamesList.prepend(banner);
        return;
      }
      gamesList.querySelector('.games-error-banner')?.remove();
      document.querySelectorAll('.game-card.loading').forEach(el => el.classList.remove('loading'));
      card.classList.add('loading');

      state.searchedUser = currentUser.trim().toLowerCase();
      pgnInput.value = g.pgn;
      if (quickInput) quickInput.value = g.pgn;
      runAnalysis(g.pgn, {
        label: `Analysing vs ${oppName}...`,
        userHandle: currentUser,
        errorBannerContainer: gamesList,
      });
    });
    gamesList.appendChild(card);
  }
}

// ── Sample Game Helper ──────────────────────────────────────
const SAMPLE_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org"]
[Date "2024.03.15"]
[White "Morphy, Paul"]
[Black "Duke of Brunswick"]
[Result "1-0"]
[WhiteElo "2400"]
[BlackElo "2100"]
[TimeControl "300+0"]
[ECO "C41"]
[Opening "Philidor Defense"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

// ── Tabs & Utilities ────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(pane => {
    const match = pane.id === `tab-${name}`;
    pane.classList.toggle('active', match);
    pane.classList.toggle('hidden', !match);
  });
}

function setStatus(html, type) {
  statusMsg.innerHTML = html;
  statusMsg.className = 'status-msg' + (type ? ' ' + type : '');
}

async function fetchApi(path, method = 'GET', body = null, signal = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  if (signal) opts.signal = signal;
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function setBoardOrientation(orientation) {
  const target = orientation === 'black' ? 'black' : 'white';
  if (state.orientation === target) {
    syncPlayerBars(state.plyIndex);
    return;
  }

  state.orientation = target;
  state.board.orientation(target);
  syncPlayerBars(state.plyIndex);
  renderUserHighlights();
  renderBoardArrows();

  // Re-apply last-move highlight and classification badge after board DOM rebuild
  if (state.plyIndex > 0) {
    const moveData = state.moves[state.plyIndex - 1];
    if (moveData) {
      highlightLastMove(
        moveData.uci.slice(0, 2),
        moveData.uci.slice(2, 4),
        moveData.classification
      );
    }
  }

  const evalScore = state.plyIndex === 0
    ? state.initialEval
    : state.moves[state.plyIndex - 1]?.eval_after;
  if (evalScore) setEvalBar(evalScore);

  // Refresh Chester context when orientation changes (updates user vs opponent if no searchedUser)
  const curFen = buildGameAtPly(state.plyIndex).fen();
  const curMove = state.plyIndex > 0 ? state.moves[state.plyIndex - 1] : null;
  updateCoachContext(curFen, state.plyIndex, curMove);
}

function flipBoard() {
  setBoardOrientation(state.orientation === 'white' ? 'black' : 'white');
}

function toggleSound() {
  sounds.enabled = !sounds.enabled;
  const btn = $('btn-rail-sound');
  const icon = $('sound-icon');
  btn.classList.toggle('active', sounds.enabled);
  icon.textContent = sounds.enabled ? '🔊' : '🔇';
}

function toggleCoordinates() {
  state.showCoords = !state.showCoords;
  const btn = $('btn-rail-coords');
  btn.classList.toggle('active', state.showCoords);
  $('board').classList.toggle('hide-coordinates', !state.showCoords);
}

function toggleEngineLines() {
  state.engineLinesExpanded = !state.engineLinesExpanded;
  $('engine-lines-panel').classList.toggle('collapsed', !state.engineLinesExpanded);
  $('engine-toggle-arrow').textContent = state.engineLinesExpanded ? '▾' : '▸';
}

// ── Show Best Move & Coach Layer Hook ───────────────────────
function formatScoreStr(score) {
  if (!score) return '—';
  if (score.type === 'mate') {
    const prefix = score.value > 0 ? '+' : '-';
    return `${prefix}M${Math.abs(score.value)}`;
  }
  const val = score.value / 100;
  return (val >= 0 ? '+' : '') + val.toFixed(2);
}

function updateBestMoveUI() {
  const strip = $('best-move-strip');
  const textEl = $('best-move-text');
  const previewBtn = $('btn-preview-best');
  const playBtn = $('btn-play-best');
  const railBtn = $('btn-rail-best');
  const sideBtn = $('btn-show-best');

  if (railBtn) railBtn.classList.toggle('active', state.showBestMove);
  if (sideBtn) sideBtn.classList.toggle('active', state.showBestMove);

  if (state.subgame.active) {
    strip.classList.add('hidden');
    return;
  }

  if (!state.showBestMove) {
    strip.classList.add('hidden');
    if (previewBtn) previewBtn.textContent = 'Preview';
    return;
  }

  strip.classList.remove('hidden');
  if (previewBtn) {
    previewBtn.textContent = state.isPreviewingBest ? 'Restore' : 'Preview';
  }

  if (state.plyIndex === 0) {
    const bestSan = state.initialBestMoveSan || state.moves[0]?.best_move_san;
    const bestUci = state.initialBestMove || state.moves[0]?.best_move;
    if (bestSan || bestUci) {
      textEl.textContent = `Best: ${bestSan || bestUci} (${formatScoreStr(state.initialEval)})`;
      previewBtn.classList.toggle('hidden', !bestUci);
      if (playBtn) playBtn.classList.toggle('hidden', !bestUci);
    } else {
      textEl.textContent = 'Starting Position';
      previewBtn.classList.add('hidden');
      if (playBtn) playBtn.classList.add('hidden');
    }
    return;
  }

  const m = state.moves[state.plyIndex - 1];
  if (!m) {
    textEl.textContent = 'No move data';
    previewBtn.classList.add('hidden');
    if (playBtn) playBtn.classList.add('hidden');
    return;
  }

  if (m.uci === m.best_move || m.classification === 'best') {
    textEl.textContent = '★ Best move played';
    previewBtn.classList.add('hidden');
    if (playBtn) playBtn.classList.add('hidden');
    return;
  }

  const playedEvalStr = formatScoreStr(m.eval_after);
  // Estimate eval of best move from eval_after - eval_change (from mover perspective)
  let bestEvalStr = '';
  if (m.eval_after && m.eval_after.type === 'cp' && typeof m.eval_change === 'number') {
    const sign = m.color === 'white' ? 1 : -1;
    const bestCp = m.eval_after.value - sign * m.eval_change;
    bestEvalStr = formatScoreStr({ type: 'cp', value: bestCp });
  }

  const evalPart = bestEvalStr ? `(${bestEvalStr} vs played ${playedEvalStr})` : `(played ${playedEvalStr})`;
  textEl.textContent = `Best: ${m.best_move_san || m.best_move || '—'} ${evalPart}`;
  previewBtn.classList.toggle('hidden', !m.best_move);
  if (playBtn) playBtn.classList.toggle('hidden', !m.best_move);
}

function toggleBestMove() {
  state.showBestMove = !state.showBestMove;
  if (!state.showBestMove && state.isPreviewingBest) {
    goToPly(state.plyIndex);
    return;
  }
  updateBestMoveUI();
  renderBoardArrows();

  const tmpGame = buildGameAtPly(state.plyIndex);
  const moveData = state.plyIndex > 0 ? state.moves[state.plyIndex - 1] : null;
  updateCoachContext(tmpGame.fen(), state.plyIndex, moveData);
}

function previewBestMove() {
  if (state.isPreviewingBest) {
    goToPly(state.plyIndex);
    return;
  }

  const bestUci = getBestMoveForCurrentPly();
  if (!bestUci || bestUci.length < 4) return;

  const tmpGame = buildGameAtPly(Math.max(0, state.plyIndex - 1));

  const moveObj = tmpGame.move({
    from: bestUci.slice(0, 2),
    to: bestUci.slice(2, 4),
    promotion: bestUci.slice(4, 5) || 'q',
  });
  if (!moveObj) return;

  state.isPreviewingBest = true;
  state.board.position(tmpGame.fen(), true);
  highlightLastMove(moveObj.from, moveObj.to, 'best');
  sounds.move();
  updateBestMoveUI();
  renderBoardArrows();
}

// ── Play-from-Best-Move Subgame & Click-to-Move Engine ───────
let _selectedSquare = null;
let _pendingDropMove = null;

function clearMoveSelection() {
  _selectedSquare = null;
  $('board').querySelectorAll('.highlight-selected').forEach(el => el.classList.remove('highlight-selected'));
  $('board').querySelectorAll('.legal-dot').forEach(el => el.remove());
}

function getActiveChessInstance() {
  if (state.retry.active && !state.retry.solved) {
    return buildGameAtPly(state.retry.branchPly);
  }
  if (state.subgame.active && state.subgame.game) {
    return state.subgame.game;
  }
  return buildGameAtPly(state.plyIndex);
}

function showLegalMovesFrom(square, game) {
  clearMoveSelection();
  const moves = game.moves({ square, verbose: true });
  if (!moves || moves.length === 0) return;

  _selectedSquare = square;
  const sqEl = $('board').querySelector(`[data-square="${square}"]`);
  if (sqEl) sqEl.classList.add('highlight-selected');

  for (const m of moves) {
    const destEl = $('board').querySelector(`[data-square="${m.to}"]`);
    if (destEl) {
      const dot = document.createElement('div');
      dot.className = 'legal-dot' + (m.captured ? ' legal-capture' : '');
      destEl.appendChild(dot);
    }
  }
}

function enterSubgameWithMove(fromSq, toSq, branchPly = state.plyIndex) {
  const subGame = buildGameAtPly(branchPly);
  const userColor = subGame.turn();
  const moveObj = subGame.move({ from: fromSq, to: toSq, promotion: 'q' });
  if (!moveObj) return false;

  clearAnnotations();
  clearMoveSelection();
  clearTimeout(state.subgame.autoReplyTimer);

  state.isPreviewingBest = false;
  state.showBestMove = true;
  state.subgame = {
    active: true,
    returnPly: state.plyIndex,
    userColor,
    game: subGame,
    history: [],
    busy: false,
    bestMove: null,
    bestMoveSan: null,
    autoReplyTimer: null,
  };

  updateBestMoveUI();
  handleSubgameMove(moveObj, true);
  return true;
}

function handleSquareTap(sq) {
  if (!sq || state.subgame.busy) return;

  // 1. If Best Move Arrow is visible in main-game mode and user taps its destination square,
  //    take back the move (ply - 1), play the best move, and enter Subgame Mode vs Stockfish!
  if (!state.subgame.active && state.showBestMove && !state.isPreviewingBest) {
    const bestUci = getBestMoveForCurrentPly();
    if (bestUci && bestUci.length >= 4 && sq === bestUci.slice(2, 4)) {
      const branchPly = state.plyIndex === 0 ? 0 : state.plyIndex - 1;
      enterSubgameWithMove(bestUci.slice(0, 2), bestUci.slice(2, 4), branchPly);
      return;
    }
  }

  const game = getActiveChessInstance();
  if (game.game_over()) return;

  // 2. If a piece is already selected, check if tapped square is a legal destination
  if (_selectedSquare) {
    if (_selectedSquare === sq) {
      clearMoveSelection();
      return;
    }
    const legalMatch = game.moves({ square: _selectedSquare, verbose: true }).find(m => m.to === sq);
    if (legalMatch) {
      const fromSq = _selectedSquare;
      clearMoveSelection();
      if (state.retry.active && !state.retry.solved) {
        handleRetryAttempt(fromSq, sq);
        return;
      }
      if (state.subgame.active) {
        const moveObj = state.subgame.game.move({ from: fromSq, to: sq, promotion: 'q' });
        if (moveObj) handleSubgameMove(moveObj, true);
      } else {
        enterSubgameWithMove(fromSq, sq, state.plyIndex);
      }
      return;
    }
  }

  // 3. Otherwise, if tapped square has a piece of the active turn, select it & show all legal moves
  const piece = game.get(sq);
  if (piece && piece.color === game.turn()) {
    showLegalMovesFrom(sq, game);
  } else {
    clearMoveSelection();
  }
}

function setupClickToMove() {
  const boardEl = $('board');
  if (!boardEl) return;

  let downPos = null;
  let touchStartPos = null;
  let lastTouchEndTs = 0;

  // Touch tap-to-move for phones & iPads (avoids conflicting with drag-and-drop)
  boardEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      touchStartPos = null;
    }
  }, { passive: true });

  boardEl.addEventListener('touchend', (e) => {
    if (!touchStartPos || e.changedTouches.length === 0) return;
    const t = e.changedTouches[0];
    const dist = Math.hypot(t.clientX - touchStartPos.x, t.clientY - touchStartPos.y);
    touchStartPos = null;
    lastTouchEndTs = Date.now();
    // Slightly larger 10px tolerance for finger taps on mobile/tablet
    if (dist > 10 || state.subgame.busy) return;
    handleSquareTap(getSquareFromPointer(e));
  }, { passive: true });

  boardEl.addEventListener('mousedown', (e) => {
    if (Date.now() - lastTouchEndTs < 450) return;
    if (e.button === 0) {
      downPos = { x: e.clientX, y: e.clientY };
    }
  });

  boardEl.addEventListener('mouseup', (e) => {
    if (Date.now() - lastTouchEndTs < 450) return;
    if (e.button !== 0 || !downPos) return;
    const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    // Only treat as click-to-move when pointer didn't drag
    if (dist > 6 || state.subgame.busy) return;
    handleSquareTap(getSquareFromPointer(e));
  });
}

function onSubgameDragStart(source, piece) {
  if (state.subgame.busy) return false;

  const game = getActiveChessInstance();
  if (game.game_over()) return false;
  if (piece[0] !== game.turn()) return false;

  // Immediately show every legal move dot while dragging!
  showLegalMovesFrom(source, game);
  return true;
}

function onSubgameDrop(source, target) {
  if (state.subgame.busy) return 'snapback';
  if (source === target) {
    // Same square release = click; keep selection & dots alive
    return 'snapback';
  }

  clearMoveSelection();

  if (state.retry.active && !state.retry.solved) {
    const testRetry = buildGameAtPly(state.retry.branchPly);
    const mv = testRetry.move({ from: source, to: target, promotion: 'q' });
    if (!mv) return 'snapback';
    _pendingDropMove = { from: source, to: target, isRetry: true };
    return;
  }

  if (state.subgame.active && state.subgame.game) {
    const moveObj = state.subgame.game.move({ from: source, to: target, promotion: 'q' });
    if (!moveObj) return 'snapback';
    _pendingDropMove = { moveObj, isNewSubgame: false };
    return;
  }

  // Validate against current position before entering subgame in onSnapEnd
  const testGame = buildGameAtPly(state.plyIndex);
  const moveObj = testGame.move({ from: source, to: target, promotion: 'q' });
  if (!moveObj) return 'snapback';
  _pendingDropMove = { from: source, to: target, isNewSubgame: true };
}

function onSubgameSnapEnd() {
  if (_pendingDropMove) {
    const pending = _pendingDropMove;
    _pendingDropMove = null;
    clearAnnotations();
    if (pending.isRetry) {
      handleRetryAttempt(pending.from, pending.to);
    } else if (pending.isNewSubgame) {
      enterSubgameWithMove(pending.from, pending.to, state.plyIndex);
    } else if (state.subgame.active && state.subgame.game) {
      handleSubgameMove(pending.moveObj, true);
    }
    return;
  }
  if (state.subgame.active && state.subgame.game && !_selectedSquare) {
    state.board.position(state.subgame.game.fen(), false);
  }
}

function renderSubgameUI(statusOverride = null) {
  const strip = $('subgame-strip');
  const statusEl = $('subgame-status');
  const movesEl = $('subgame-moves');
  const undoBtn = $('btn-subgame-undo');
  const stepBtn = $('btn-subgame-step');

  if (!state.subgame.active) {
    strip.classList.add('hidden');
    return;
  }

  strip.classList.remove('hidden');

  const g = state.subgame.game;
  if (statusOverride) {
    statusEl.textContent = statusOverride;
  } else if (g.in_checkmate()) {
    statusEl.textContent = g.turn() === 'w' ? 'Checkmate · Black wins' : 'Checkmate · White wins';
  } else if (g.in_draw()) {
    statusEl.textContent = 'Draw';
  } else if (state.subgame.busy) {
    statusEl.textContent = 'Stockfish thinking...';
  } else {
    const turnLabel = g.turn() === 'w' ? 'White' : 'Black';
    const who = g.turn() === state.subgame.userColor ? 'Your turn' : 'Computer turn';
    statusEl.textContent = `${who} (${turnLabel})`;
  }

  if (undoBtn) undoBtn.disabled = state.subgame.busy || state.subgame.history.length <= 1;
  if (stepBtn) stepBtn.disabled = state.subgame.busy || g.game_over() || !state.subgame.bestMove;

  // Format breadcrumb move list
  const parts = [];
  for (let i = 0; i < state.subgame.history.length; i++) {
    const entry = state.subgame.history[i];
    if (entry.color === 'w') {
      parts.push(`${entry.moveNum}. ${entry.san}`);
    } else if (i === 0) {
      parts.push(`${entry.moveNum}... ${entry.san}`);
    } else {
      parts.push(entry.san);
    }
  }
  movesEl.textContent = parts.join(' ') || '—';
  movesEl.scrollTop = movesEl.scrollHeight;
}

async function handleSubgameMove(moveObj, shouldAutoReply) {
  const g = state.subgame.game;
  const fenAfter = g.fen();
  const moveNum = Math.ceil((state.subgame.returnPly + state.subgame.history.length + 1) / 2);

  state.subgame.history.push({
    san: moveObj.san,
    uci: moveObj.from + moveObj.to + (moveObj.promotion || ''),
    color: moveObj.color,
    moveNum,
    fen: fenAfter,
  });

  state.board.position(fenAfter, true);
  highlightLastMove(moveObj.from, moveObj.to, null);
  playMoveSound({ san: moveObj.san }, g);
  updateOpeningDisplay(fenAfter);
  renderSubgameUI('Analysing...');

  await analyseSubgamePosition(shouldAutoReply);
}

async function analyseSubgamePosition(autoReply = false) {
  const g = state.subgame.game;
  if (!state.subgame.active || !g) return;

  const fen = g.fen();
  state.subgame.busy = true;
  renderSubgameUI('Analysing...');

  try {
    const res = await fetchApi('/api/analyse-fen', 'POST', { fen, depth: 12 });
    if (!state.subgame.active || g.fen() !== fen) return;

    const eng = res.engine;
    state.subgame.bestMove = eng.best_move || null;
    state.subgame.bestMoveSan = eng.best_move_san || null;
    state.topLines = eng.top_lines || [];

    engineMeta.textContent = `Stockfish · d${res.depth || 12}`;
    setEvalBar(eng.score);
    updateEngineLines(eng.score, eng.best_move_san, eng.top_lines);

    if (autoReply && !g.game_over() && g.turn() !== state.subgame.userColor && eng.best_move) {
      renderSubgameUI('Computer playing best...');
      clearTimeout(state.subgame.autoReplyTimer);
      state.subgame.autoReplyTimer = setTimeout(() => {
        if (!state.subgame.active) return;
        const reply = g.move({
          from: eng.best_move.slice(0, 2),
          to: eng.best_move.slice(2, 4),
          promotion: eng.best_move.slice(4, 5) || 'q',
        });
        state.subgame.busy = false;
        if (reply) {
          handleSubgameMove(reply, false);
        } else {
          renderSubgameUI();
          renderBoardArrows();
        }
      }, 360);
      return;
    }

    state.subgame.busy = false;
    renderSubgameUI();
    renderBoardArrows();
    updateCoachContext(fen, state.subgame.returnPly + state.subgame.history.length, null);
  } catch (err) {
    state.subgame.busy = false;
    renderSubgameUI(`Engine error: ${err.message}`);
  }
}

function startBestMoveSubgame() {
  const branchPly = state.plyIndex === 0 ? 0 : state.plyIndex - 1;
  const bestUci = state.plyIndex === 0
    ? (state.initialBestMove || state.moves[0]?.best_move)
    : state.moves[state.plyIndex - 1]?.best_move;

  if (!bestUci || bestUci.length < 4) return;

  const subGame = buildGameAtPly(branchPly);
  const userColor = subGame.turn();

  const moveObj = subGame.move({
    from: bestUci.slice(0, 2),
    to: bestUci.slice(2, 4),
    promotion: bestUci.slice(4, 5) || 'q',
  });
  if (!moveObj) return;

  clearAnnotations();
  clearTimeout(state.subgame.autoReplyTimer);

  state.isPreviewingBest = false;
  state.showBestMove = true;
  state.subgame = {
    active: true,
    returnPly: state.plyIndex,
    userColor,
    game: subGame,
    history: [],
    busy: false,
    bestMove: null,
    bestMoveSan: null,
    autoReplyTimer: null,
  };

  updateBestMoveUI();
  handleSubgameMove(moveObj, true);
}

function stepSubgameBestMove() {
  if (!state.subgame.active || state.subgame.busy || !state.subgame.game) return;
  const g = state.subgame.game;
  const bestUci = state.subgame.bestMove;
  if (g.game_over() || !bestUci || bestUci.length < 4) return;

  const moveObj = g.move({
    from: bestUci.slice(0, 2),
    to: bestUci.slice(2, 4),
    promotion: bestUci.slice(4, 5) || 'q',
  });
  if (!moveObj) return;

  // Step one best move for whichever side is to move, then analyse next position
  handleSubgameMove(moveObj, false);
}

function undoSubgameMove() {
  if (!state.subgame.active || state.subgame.busy || !state.subgame.game) return;
  if (state.subgame.history.length <= 1) return;

  const g = state.subgame.game;
  // If it's currently the user's turn and computer already replied, undo 2 plies back to user's turn
  const steps = (g.turn() === state.subgame.userColor && state.subgame.history.length >= 3) ? 2 : 1;
  for (let i = 0; i < steps; i++) {
    g.undo();
    state.subgame.history.pop();
  }

  const fen = g.fen();
  const last = state.subgame.history[state.subgame.history.length - 1];
  state.board.position(fen, true);
  if (last) {
    highlightLastMove(last.uci.slice(0, 2), last.uci.slice(2, 4), null);
  }
  sounds.reverse();
  updateOpeningDisplay(fen);
  analyseSubgamePosition(false);
}

function exitSubgame(skipGoToPly = false) {
  if (!state.subgame.active) return;
  clearTimeout(state.subgame.autoReplyTimer);
  const returnPly = state.subgame.returnPly;
  state.subgame.active = false;
  state.subgame.busy = false;
  state.subgame.game = null;
  state.subgame.history = [];
  state.subgame.bestMove = null;
  $('subgame-strip').classList.add('hidden');
  updateBestMoveUI();
  if (!skipGoToPly) {
    goToPly(returnPly);
  }
}

function updateCoachContext(fen, ply, moveData) {
  const cpToEp = (cp) => Number((1 / (1 + Math.exp(-0.00368208 * cp))).toFixed(4));
  const scoreToCp = (score) => {
    if (!score) return 0;
    if (score.type === 'mate') return score.value > 0 ? 10000 : -10000;
    return score.value;
  };

  let epBefore = null;
  let epAfter = null;
  let epBest = null;
  let epl = null;

  if (moveData && moveData.eval_after) {
    const cpAfter = scoreToCp(moveData.eval_after);
    const sign = moveData.color === 'white' ? 1 : -1;
    const cpBest = typeof moveData.eval_change === 'number'
      ? cpAfter - sign * moveData.eval_change
      : cpAfter;
    const prevScore = ply > 1 ? state.moves[ply - 2]?.eval_after : state.initialEval;
    const cpBefore = prevScore ? scoreToCp(prevScore) : cpBest;

    epBefore = cpToEp(cpBefore);
    epAfter = cpToEp(cpAfter);
    epBest = cpToEp(cpBest);
    epl = Number(Math.abs(epBest - epAfter).toFixed(4));
  } else if (state.initialEval) {
    const cp = scoreToCp(state.initialEval);
    epBefore = cpToEp(cp);
    epAfter = epBefore;
    epBest = epBefore;
    epl = 0;
  }

  // Identify user vs opponent (matches searched Chess.com username, else board bottom POV)
  const whiteName = state.headers.white || 'White';
  const blackName = state.headers.black || 'Black';
  let userColor = state.orientation === 'black' ? 'black' : 'white';
  if (state.searchedUser) {
    if (whiteName.trim().toLowerCase() === state.searchedUser) {
      userColor = 'white';
    } else if (blackName.trim().toLowerCase() === state.searchedUser) {
      userColor = 'black';
    }
  }
  const oppColor = userColor === 'white' ? 'black' : 'white';
  const userName = userColor === 'white' ? whiteName : blackName;
  const opponentName = oppColor === 'white' ? whiteName : blackName;
  const moverColor = moveData ? moveData.color : null;
  const moverName = moveData ? (moveData.color === 'white' ? whiteName : blackName) : null;
  const isUserMove = moveData ? (moveData.color === userColor) : true;

  // Compute cumulative/recent blunders, clean recovery streak, user play quality & intensity
  let totalBlunders = 0;
  let blunderStreak = 0;
  let recentBlunders = 0;
  let cleanStreak = 0;
  let userEplSum = 0;
  let userMovesSeen = 0;
  let gameIntensity = 0;
  const checkLimit = Math.min(ply, state.moves.length);
  for (let i = 0; i < checkLimit; i++) {
    const m = state.moves[i];
    const c = m?.classification;
    const mEpl = typeof m?.epl === 'number' ? m.epl : 0;
    if (m?.color === userColor) {
      userEplSum += mEpl;
      userMovesSeen++;
    }

    const isBad = c === 'blunder' || c === 'miss';
    const isClean = c === 'book' || c === 'good' || c === 'excellent' || c === 'best' || c === 'great' || c === 'brilliant';

    if (isBad) {
      totalBlunders++;
      blunderStreak++;
      cleanStreak = 0;
      if (i >= checkLimit - 4) recentBlunders++;
    } else {
      blunderStreak = 0;
      cleanStreak = isClean ? cleanStreak + 1 : 0;
    }

    if (i >= checkLimit - 6 && (isBad || c === 'mistake' || c === 'brilliant' || (m?.san && m.san.includes('+')))) {
      gameIntensity++;
    }
  }

  const meanEpl = userMovesSeen > 0 ? Number((userEplSum / userMovesSeen).toFixed(4)) : 0;

  // Dynamic personality tone (respecting explicit override in Settings)
  let tone = 'instructive';
  if (checkLimit <= 8 && totalBlunders === 0) {
    tone = 'instructive';
  } else if (meanEpl <= 0.045 && totalBlunders <= 1 && checkLimit >= 6) {
    tone = 'analytical';
  } else if (checkLimit >= 14 || gameIntensity >= 2 || totalBlunders >= 2) {
    tone = 'sarcastic';
  }
  try {
    const prefTone = localStorage.getItem('blunderless_tone');
    if (prefTone && prefTone !== 'auto') tone = prefTone;
  } catch (_) {}

  const evalFlip =
    epBefore !== null &&
    epAfter !== null &&
    Math.abs(epAfter - epBefore) >= 0.25 &&
    ((epBefore >= 0.55 && epAfter <= 0.45) || (epBefore <= 0.45 && epAfter >= 0.55) || Math.abs(epAfter - epBefore) >= 0.30);

  let destGrid = null;
  if (moveData && moveData.uci && moveData.uci.length >= 4) {
    destGrid = squareToGrid(moveData.uci.slice(2, 4));
  }

  // Detect resignation on the final move of the game (supports Chess.com & Lichess PGNs)
  let gameEndType = null;
  let resignedSide = null;
  let opponentResigned = false;
  let userResigned = false;
  const isFinalPly = ply > 0 && state.moves.length > 0 && ply === state.moves.length;
  if (isFinalPly) {
    const resStr = (state.headers.result || '').trim();
    const termLow = (state.headers.termination || '').toLowerCase();
    const winnerColor = resStr === '1-0' ? 'white' : (resStr === '0-1' ? 'black' : null);
    const isMateEnd = Boolean(moveData?.san && moveData.san.includes('#')) || termLow.includes('checkmate');
    const isOtherEnd =
      termLow.includes('time') ||
      termLow.includes('abandon') ||
      termLow.includes('draw') ||
      termLow.includes('stalemate') ||
      termLow.includes('repetition') ||
      termLow.includes('insufficient') ||
      termLow.includes('agreement');

    if (winnerColor && !isMateEnd && (termLow.includes('resign') || !isOtherEnd)) {
      gameEndType = 'resignation';
      resignedSide = winnerColor === 'white' ? 'black' : 'white';
      opponentResigned = resignedSide !== userColor;
      userResigned = resignedSide === userColor;
    }
  }

  const payload = {
    fen,
    ply,
    moveSan: moveData ? moveData.san : null,
    playedMoveUci: moveData ? moveData.uci : null,
    bestMoveUci: moveData ? moveData.best_move : state.initialBestMove,
    bestMoveSan: moveData ? moveData.best_move_san : state.initialBestMoveSan,
    classification: moveData ? moveData.classification : null,
    evalAfter: moveData ? moveData.eval_after : state.initialEval,
    evalChange: moveData ? moveData.eval_change : 0,
    epBefore,
    epAfter,
    epBest,
    epl,
    totalBlunders,
    blunderStreak,
    recentBlunders,
    cleanStreak,
    meanEpl,
    gameIntensity,
    tone,
    evalFlip,
    destGrid,
    userColor,
    userName,
    opponentName,
    moverColor,
    moverName,
    isUserMove,
    gameEndType,
    resignedSide,
    opponentResigned,
    userResigned,
    soundEnabled: sounds.enabled,
    topLines: state.topLines,
  };

  window.BlunderlessCoachContext = payload;
  window.dispatchEvent(new CustomEvent('blunderless:position-analyzed', { detail: payload }));
}

window.BlunderlessCoach = {
  getContext: () => window.BlunderlessCoachContext || null,
  toggleBestMove,
  previewBestMove,
  playExplainDemo,
  cancelExplainDemo,
};

// Bridge for Home / My Games / Insights views in platform.js
window.BlunderlessBoard = {
  beginExternalLoad: (label = 'Loading game...') => {
    const { seq } = beginNewAnalysisLoad(label);
    return seq;
  },
  endExternalLoad: (seq = null) => {
    if (seq === null || seq === _analysisLoadSeq) {
      _analysisAbortCtrl = null;
      setBoardLoading(false);
    }
  },
  openGame: async (pgn, cachedAnalysis = null, targetPly = 0, userHandle = null, externalSeq = null) => {
    // If an external caller already started a load token, respect it; otherwise start a fresh one
    // to immediately cancel any in-flight SAMPLE_PGN or older game analysis!
    let seq = externalSeq;
    if (seq !== null && seq !== _analysisLoadSeq) return;
    if (seq === null) {
      seq = beginNewAnalysisLoad('Loading game...').seq;
    }

    pgnInput.value = pgn || '';
    if (quickInput) quickInput.value = pgn || '';
    try {
      if (cachedAnalysis) {
        await analysePgn(pgn, cachedAnalysis, targetPly, userHandle, seq, null);
      } else {
        await runAnalysis(pgn, { targetPly, userHandle });
      }
    } finally {
      if (seq === _analysisLoadSeq) {
        _analysisAbortCtrl = null;
        setBoardLoading(false, '', seq);
      }
    }
  },
  loadSample: () => {
    pgnInput.value = SAMPLE_PGN;
    if (quickInput) quickInput.value = SAMPLE_PGN;
    runAnalysis(SAMPLE_PGN, { label: 'Loading sample game...' });
  },
  resize: () => {
    window.dispatchEvent(new Event('resize'));
  },
  setSearchedUser: (u) => {
    state.searchedUser = (u || '').trim().toLowerCase();
  },
};

function switchDatabase(db) {
  state.selectedDb = db;
  $('db-btn-masters').classList.toggle('active', db === 'masters');
  $('db-btn-lichess').classList.toggle('active', db === 'lichess');

  updateOpeningDisplay(buildGameAtPly(state.plyIndex).fen());
}

// ── Drag & Drop PGN Setup ───────────────────────────────────
function setupDragAndDrop() {
  const dropzone = $('import-dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = evt => {
        const content = evt.target.result;
        pgnInput.value = content;
        quickInput.value = content;
        runAnalysis(content);
      };
      reader.readAsText(file);
    }
  });
}

// ── Bootstrap ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initBoard();
  state.initialEval = { type: 'cp', value: 20 };
  setEvalBar(state.initialEval);
  syncPlayerBars(0);
  updateEngineLines(state.initialEval, 'e4');
  updateOpeningDisplay('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

  // Playback Navigation
  $('btn-start').addEventListener('click', () => goToPly(0));
  $('btn-prev').addEventListener('click', () => goToPly(state.plyIndex - 1));
  $('btn-next').addEventListener('click', () => goToPly(state.plyIndex + 1));
  $('btn-end').addEventListener('click', () => goToPly(state.moves.length));

  // Board Utility Rail
  $('btn-rail-flip').addEventListener('click', flipBoard);
  $('btn-rail-sound').addEventListener('click', toggleSound);
  $('btn-rail-coords').addEventListener('click', toggleCoordinates);
  $('btn-rail-best').addEventListener('click', toggleBestMove);

  // Best Move, Subgame, Key Moments & Retry Controls
  $('btn-show-best').addEventListener('click', toggleBestMove);
  $('btn-preview-best').addEventListener('click', previewBestMove);
  $('btn-play-best').addEventListener('click', startBestMoveSubgame);
  $('btn-subgame-undo').addEventListener('click', undoSubgameMove);
  $('btn-subgame-step').addEventListener('click', stepSubgameBestMove);
  $('btn-subgame-exit').addEventListener('click', () => exitSubgame(false));
  $('btn-key-prev')?.addEventListener('click', () => jumpKeyMoment(-1));
  $('btn-key-next')?.addEventListener('click', () => jumpKeyMoment(1));
  $('btn-retry-mistake')?.addEventListener('click', startRetryMistake);
  $('btn-retry-reveal')?.addEventListener('click', revealRetryAnswer);
  $('btn-retry-exit')?.addEventListener('click', () => exitRetryMode(false));

  // Share Card (PNG) & Export Annotated PGN
  $('btn-share-card')?.addEventListener('click', generateReviewCardPng);
  $('btn-export-pgn')?.addEventListener('click', exportAnnotatedPgn);

  // Return to last book move button
  $('btn-return-book').addEventListener('click', () => {
    goToPly(state.lastBookPly);
  });

  // Database Toggle (Masters vs Lichess)
  $('db-btn-masters').addEventListener('click', () => switchDatabase('masters'));
  $('db-btn-lichess').addEventListener('click', () => switchDatabase('lichess'));

  // Coach Game Report White/Black Perspective Toggle
  $('report-btn-white')?.addEventListener('click', () => {
    if (state.gameReport) {
      renderGameReport(state.gameReport, 'white');
      renderClockChart(state.moves, state.gameReport);
    }
  });
  $('report-btn-black')?.addEventListener('click', () => {
    if (state.gameReport) {
      renderGameReport(state.gameReport, 'black');
      renderClockChart(state.moves, state.gameReport);
    }
  });

  // Engine Lines Collapse Toggle
  $('btn-engine-toggle').addEventListener('click', toggleEngineLines);

  // Action Buttons
  $('analyse-btn').addEventListener('click', () => runAnalysis());
  $('info-load-btn').addEventListener('click', () => runAnalysis());
  $('quick-load-btn').addEventListener('click', () => {
    const val = quickInput.value.trim();
    if (val) {
      pgnInput.value = val;
      runAnalysis(val);
    }
  });
  $('quick-sample-btn').addEventListener('click', () => {
    pgnInput.value = SAMPLE_PGN;
    quickInput.value = SAMPLE_PGN;
    runAnalysis(SAMPLE_PGN);
  });

  // Chess.com Buttons
  $('chesscom-btn').addEventListener('click', () => loadChessComGames());
  $('tab-chesscom-btn').addEventListener('click', () => {
    loadChessComGames($('tab-chesscom-input').value.trim());
  });

  // Enter key listeners
  pgnInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) runAnalysis();
  });
  quickInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = quickInput.value.trim();
      if (val) {
        pgnInput.value = val;
        runAnalysis(val);
      }
    }
  });
  $('chesscom-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadChessComGames();
  });
  $('tab-chesscom-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadChessComGames($('tab-chesscom-input').value.trim());
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // Drag and drop setup
  setupDragAndDrop();

  // Global Keyboard Navigation (Arrow Keys)
  document.addEventListener('keydown', e => {
    if (document.activeElement === pgnInput) return;
    if (document.activeElement === quickInput) return;
    if (document.activeElement === $('chesscom-input')) return;
    if (document.activeElement === $('tab-chesscom-input')) return;

    switch (e.key) {
      case 'Escape':
        if (state.retry.active) {
          e.preventDefault();
          exitRetryMode(false);
        } else if (state.subgame.active) {
          e.preventDefault();
          exitSubgame(false);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (state.subgame.active) undoSubgameMove();
        else goToPly(state.plyIndex - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (state.subgame.active) stepSubgameBestMove();
        else goToPly(state.plyIndex + 1);
        break;
      case 'ArrowUp':
      case 'Home':
        e.preventDefault();
        goToPly(0);
        break;
      case 'ArrowDown':
      case 'End':
        e.preventDefault();
        goToPly(state.moves.length);
        break;
      case 'f':
      case 'F':
        flipBoard();
        break;
      case 'b':
      case 'B':
        toggleBestMove();
        break;
    }
  });
});
