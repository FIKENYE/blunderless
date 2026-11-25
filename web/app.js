/* ============================================================
   Blunderless — app.js (v4)
   - Clean 4-color SVG piece set (no outer glow highlights)
   - Pure impulse-acoustic mechanical keyboard clack (no oscillators)
   - High-legibility sidebar & clock bindings
   ============================================================ */

'use strict';

// ── Clean 4-Color Coffee SVG Piece Set (No Outer Highlights) ──
const PIECE_SVGS = (() => {
  const W_FILL = '#FFF8F0';
  const W_STRK = '#4B2E2B';
  const B_FILL = '#4B2E2B';
  const B_LINE = '#FFF8F0';

  const makeSvg = (inner) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">${inner}</svg>`;

  const pieces = {
    wP: makeSvg(`<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="${W_FILL}" stroke="${W_STRK}" stroke-width="2.1" stroke-linecap="round"/>`),
    bP: makeSvg(`<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="${B_FILL}" stroke="${B_FILL}" stroke-width="1"/>`),

    wR: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none"/></g>`),
    bR: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="1" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z"/><path d="M14 29.5v-13h17v13H14z"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z"/><path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none" stroke="${B_LINE}" stroke-width="1.2"/></g>`),

    wN: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><circle cx="15" cy="14.5" r="1.1" fill="${W_STRK}" stroke="none"/></g>`),
    bN: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="1" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><circle cx="15" cy="14.5" r="1.2" fill="${B_LINE}" stroke="none"/></g>`),

    wB: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/><path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" fill="none"/></g>`),
    bB: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="1" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/><path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" fill="none" stroke="${B_LINE}" stroke-width="1.4" stroke-linecap="round"/></g>`),

    wQ: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.2"/><circle cx="14" cy="9" r="2.2"/><circle cx="22.5" cy="8" r="2.2"/><circle cx="31" cy="9" r="2.2"/><circle cx="39" cy="12" r="2.2"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/></g>`),
    bQ: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="1" stroke-linejoin="round"><circle cx="6" cy="12" r="2.2"/><circle cx="14" cy="9" r="2.2"/><circle cx="22.5" cy="8" r="2.2"/><circle cx="31" cy="9" r="2.2"/><circle cx="39" cy="12" r="2.2"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="${B_LINE}" stroke-width="1.3" stroke-linecap="round"/></g>`),

    wK: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" fill="none"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" fill="none"/></g>`),
    bK: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="1" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" fill="none" stroke="${B_FILL}" stroke-width="2.2" stroke-linecap="round"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" fill="none" stroke="${B_LINE}" stroke-width="1.3" stroke-linecap="round"/></g>`),
  };

  const uris = {};
  for (const [k, svg] of Object.entries(pieces)) {
    uris[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  return uris;
})();

// ── Pure Acoustic Mechanical Keyboard Clack Engine ───────────
/**
 * Zero oscillator tones (no 8-bit video game sweeps).
 * Synthesises real physical keycap/piece impact acoustics using two
 * ultra-short filtered noise transients:
 *   Layer A (Clack): 4.5ms high-mid PBT stem impact (1400-1900 Hz)
 *   Layer B (Body):  16ms deep low-mid plate/board resonance (280-420 Hz)
 */
class SoundSystem {
  constructor() { this._ctx = null; }

  _ctx_get() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  _noiseBurst(ctx, startTime, duration, freq, q, filterType, gainVal, decayPower = 4.0) {
    const bufSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufSize; i++) {
      const env = Math.pow(1 - i / bufSize, decayPower);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(startTime);
    src.stop(startTime + duration + 0.005);
  }

  /**
   * Single mechanical keycap clack (stem clack + board body thud).
   */
  _clack(clackHz = 1650, bodyHz = 340, vol = 0.75) {
    const ctx = this._ctx_get();
    const now = ctx.currentTime;
    const jitter = 0.94 + Math.random() * 0.12;

    // 1. Crisp 5ms keycap stem clack
    this._noiseBurst(ctx, now, 0.006, clackHz * jitter, 2.2, 'bandpass', vol * 0.85, 3.5);
    // 2. Warm 18ms board / housing resonance
    this._noiseBurst(ctx, now + 0.001, 0.018, bodyHz * jitter, 1.8, 'bandpass', vol * 1.15, 3.0);
  }

  /** Standard move: single tactile PBT clack */
  move() {
    this._clack(1680, 350, 0.72);
  }

  /** Capture: sharp initial top-out snap + heavier bottom-out clack */
  capture() {
    this._clack(2100, 440, 0.55);
    setTimeout(() => this._clack(1420, 270, 0.92), 28);
  }

  /** Castling: fast two-key roll */
  castle() {
    this._clack(1780, 370, 0.65);
    setTimeout(() => this._clack(1560, 320, 0.72), 62);
  }

  /** Check: crisp double-tap clack on a brighter key */
  check() {
    this._clack(2250, 480, 0.75);
    setTimeout(() => this._clack(2450, 520, 0.65), 55);
  }

  /** Game end: deep spacebar stabilizer clack */
  gameEnd() {
    this._clack(1150, 220, 1.0);
  }
}

const sounds = new SoundSystem();

// ── State ───────────────────────────────────────────────────
const state = {
  moves: [],
  plyIndex: 0,
  initialFen: null,
  initialEval: null,
  orientation: 'white',
  board: null,
  headers: {
    white: 'White', black: 'Black',
    white_elo: '', black_elo: '',
    initial_clock: '--:--',
  },
};

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
const gameHeaders = $('game-headers');
const pgnInput = $('pgn-input');
const statusMsg = $('status-msg');
const analyseBtn = $('analyse-btn');
const gamesList = $('games-list');

const CLF_META = {
  best: { cls: 'clf-best', title: 'Best move' },
  good: { cls: 'clf-good', title: 'Good move' },
  inaccuracy: { cls: 'clf-inaccuracy', title: 'Inaccuracy' },
  mistake: { cls: 'clf-mistake', title: 'Mistake' },
  blunder: { cls: 'clf-blunder', title: 'Blunder' },
};

function clfDot(clf) {
  const m = CLF_META[clf] || CLF_META.good;
  return `<span class="clf-dot ${m.cls}" title="${m.title}"></span>`;
}

// ── Eval Bar & Engine Strip ─────────────────────────────────
function setEvalBar(score) {
  let cp;
  let formatted;

  if (score.type === 'mate') {
    cp = score.value > 0 ? 10000 : -10000;
    const prefix = score.value > 0 ? '+' : '-';
    formatted = `${prefix}M${Math.abs(score.value)}`;
    if (score.value > 0) {
      evalLabelT.textContent = '';
      evalLabelB.textContent = `M${Math.abs(score.value)}`;
    } else {
      evalLabelT.textContent = `M${Math.abs(score.value)}`;
      evalLabelB.textContent = '';
    }
  } else {
    cp = score.value;
    const disp = (Math.abs(cp) / 100).toFixed(1);
    const disp2 = (Math.abs(cp) / 100).toFixed(2);
    if (cp >= 0) {
      formatted = '+' + disp2;
      evalLabelT.textContent = '';
      evalLabelB.textContent = '+' + disp;
    } else {
      formatted = '-' + disp2;
      evalLabelT.textContent = '-' + disp;
      evalLabelB.textContent = '';
    }
  }

  engineEval.textContent = formatted;

  const pct = Math.round(50 + 50 * Math.tanh(cp / 350));
  if (state.orientation === 'white') {
    evalBlackFill.style.height = (100 - pct) + '%';
    evalWhiteFill.style.height = pct + '%';
  } else {
    evalBlackFill.style.height = pct + '%';
    evalWhiteFill.style.height = (100 - pct) + '%';
  }
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

// ── Board Initialisation & 1:1 Responsive Sizing ────────────
function initBoard() {
  state.board = Chessboard('board', {
    position: 'start',
    orientation: state.orientation,
    pieceTheme: (piece) => PIECE_SVGS[piece],
    draggable: false,
    moveSpeed: 150,
    snapbackSpeed: 120,
    snapSpeed: 60,
  });

  const boardEl = $('board');
  const evalShell = $('eval-bar-shell');

  const resize = () => {
    const stage = document.querySelector('.left-stage');
    const availH = stage.clientHeight - 128;
    const availW = stage.clientWidth - 84;
    const size = Math.max(280, Math.min(availH, availW, 640));

    const snapped = Math.floor(size / 8) * 8;
    boardEl.style.width = snapped + 'px';
    boardEl.style.height = snapped + 'px';
    evalShell.style.height = snapped + 'px';
    state.board.resize();
  };

  window.addEventListener('resize', resize);
  resize();
}

// ── Last-Move Highlighting ──────────────────────────────────
let _lastHighlightSquares = [];

function highlightLastMove(fromSq, toSq) {
  _lastHighlightSquares.forEach(sq => {
    $('board').querySelectorAll(`[data-square="${sq}"]`).forEach(el => {
      el.classList.remove('highlight-last');
    });
  });
  _lastHighlightSquares = [];
  if (!fromSq || !toSq) return;

  [fromSq, toSq].forEach(sq => {
    $('board').querySelectorAll(`[data-square="${sq}"]`).forEach(el => {
      el.classList.add('highlight-last');
    });
  });
  _lastHighlightSquares = [fromSq, toSq];
}

// ── Navigation ──────────────────────────────────────────────
function goToPly(ply) {
  if (ply < 0 || ply > state.moves.length) return;

  const prevPly = state.plyIndex;
  state.plyIndex = ply;

  const tmpGame = new Chess();
  if (state.initialFen) tmpGame.load(state.initialFen);
  for (let i = 0; i < ply; i++) {
    tmpGame.move(state.moves[i].san);
  }

  state.board.position(tmpGame.fen(), true);

  if (ply > 0) {
    const moveData = state.moves[ply - 1];
    const uci = moveData.uci;
    highlightLastMove(uci.slice(0, 2), uci.slice(2, 4));
    if (ply > prevPly) playMoveSound(moveData, tmpGame);
    $('opening-best').textContent = moveData.best_move_san || '—';
  } else {
    highlightLastMove(null, null);
  }

  const evalScore = ply === 0 ? state.initialEval : state.moves[ply - 1].eval_after;
  if (evalScore) setEvalBar(evalScore);

  syncPlayerBars(ply);

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

// ── Move List & Summary Counts ──────────────────────────────
function renderMoveList(movesData) {
  moveTableBody.innerHTML = '';
  emptyMoves.classList.add('hidden');

  const counts = { best: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const m of movesData) {
    if (counts[m.classification] !== undefined) counts[m.classification]++;
  }
  $('cnt-best').textContent = counts.best;
  $('cnt-inacc').textContent = counts.inaccuracy;
  $('cnt-mistake').textContent = counts.mistake;
  $('cnt-blunder').textContent = counts.blunder;

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
      div.innerHTML = `${clfDot(move.classification)}<span>${move.san}</span>`;
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

// ── Analysis Requests ───────────────────────────────────────
async function runAnalysis() {
  const raw = pgnInput.value.trim();
  if (!raw) {
    switchTab('info');
    return setStatus('Paste a PGN or FEN above first.', 'error');
  }

  setStatus('<span class="spinner"></span> Analysing...');
  analyseBtn.disabled = true;

  const isFen = !raw.includes('\n') && raw.split(/\s+/).length === 6;

  try {
    if (isFen) await analyseFen(raw);
    else await analysePgn(raw);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    analyseBtn.disabled = false;
  }
}

async function analyseFen(fen) {
  const res = await fetchApi('/api/analyse-fen', 'POST', { fen, depth: 12 });

  state.initialFen = fen;
  state.initialEval = res.engine.score;
  state.moves = [];
  state.plyIndex = 0;
  state.headers = { white: 'White', black: 'Black', white_elo: '', black_elo: '', initial_clock: '--:--' };

  engineMeta.textContent = `Stockfish · d${res.depth || 12}`;
  $('opening-banner').textContent = 'Custom FEN Position';
  $('opening-eco-badge').textContent = '';
  $('opening-best').textContent = res.engine.best_move_san || '—';

  state.board.position(fen, true);
  setEvalBar(res.engine.score);
  syncPlayerBars(0);
  moveTableBody.innerHTML = '';
  gameHeaders.classList.add('hidden');
  emptyMoves.textContent = `FEN loaded. Best move: ${res.engine.best_move_san || '—'}`;
  emptyMoves.classList.remove('hidden');
  highlightLastMove(null, null);
  setStatus('FEN analysed · depth 12', 'ok');
  switchTab('moves');
}

async function analysePgn(pgn) {
  const res = await fetchApi('/api/analyse-pgn', 'POST', { pgn, depth: 10 });

  state.initialFen = res.initial_fen;
  state.initialEval = res.initial_eval;
  state.moves = res.moves;
  state.plyIndex = 0;
  state.headers = res.headers;

  engineMeta.textContent = `Stockfish · d${res.depth || 10}`;

  gameHeaders.classList.remove('hidden');
  gameHeaders.innerHTML = `
    <div class="info-row"><span class="info-key">MATCHUP</span><span class="info-val">${res.headers.white} vs ${res.headers.black}</span></div>
    <div class="info-row"><span class="info-key">EVENT / DATE</span><span class="info-val">${res.headers.event || '—'} · ${res.headers.date || '—'}</span></div>
    <div class="info-row"><span class="info-key">TIME CONTROL</span><span class="info-val">${res.headers.time_control || '—'}</span></div>
    <div class="info-row"><span class="info-key">RESULT</span><span class="info-val">${res.headers.result || '*'}</span></div>
  `;

  const openingTitle = res.headers.opening || 'Starting Position';
  $('opening-banner').textContent = openingTitle;
  $('opening-eco-badge').textContent = res.headers.eco || '';
  $('opening-eco').textContent = res.headers.eco || '—';
  $('opening-name').textContent = openingTitle;
  $('opening-best').textContent = res.moves[0]?.best_move_san || '—';

  renderMoveList(res.moves);
  emptyMoves.classList.add('hidden');
  goToPly(0);
  setStatus(`Loaded · ${res.moves.length} half-moves`, 'ok');
  switchTab('moves');
}

// ── Chess.com Loader ────────────────────────────────────────
async function loadChessComGames() {
  const username = $('chesscom-input').value.trim();
  if (!username) return;

  gamesList.innerHTML = '<div class="empty-state"><span class="spinner"></span> Fetching games...</div>';
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
    gamesList.innerHTML = '<div class="empty-state">No games found.</div>';
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
      pgnInput.value = g.pgn;
      runAnalysis();
    });
    gamesList.appendChild(card);
  }
}

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

async function fetchApi(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

function flipBoard() {
  state.orientation = state.orientation === 'white' ? 'black' : 'white';
  state.board.flip();
  syncPlayerBars(state.plyIndex);
  const evalScore = state.plyIndex === 0
    ? state.initialEval
    : state.moves[state.plyIndex - 1]?.eval_after;
  if (evalScore) setEvalBar(evalScore);
}

// ── Bootstrap ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initBoard();
  state.initialEval = { type: 'cp', value: 20 };
  setEvalBar(state.initialEval);
  syncPlayerBars(0);

  $('btn-start').addEventListener('click', () => goToPly(0));
  $('btn-prev').addEventListener('click', () => goToPly(state.plyIndex - 1));
  $('btn-next').addEventListener('click', () => goToPly(state.plyIndex + 1));
  $('btn-end').addEventListener('click', () => goToPly(state.moves.length));
  $('btn-flip').addEventListener('click', flipBoard);

  $('analyse-btn').addEventListener('click', runAnalysis);
  $('chesscom-btn').addEventListener('click', loadChessComGames);

  pgnInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) runAnalysis();
  });
  $('chesscom-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadChessComGames();
  });

  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  document.addEventListener('keydown', e => {
    if (document.activeElement === pgnInput) return;
    if (document.activeElement === $('chesscom-input')) return;

    switch (e.key) {
      case 'ArrowLeft': goToPly(state.plyIndex - 1); break;
      case 'ArrowRight': goToPly(state.plyIndex + 1); break;
      case 'Home': goToPly(0); break;
      case 'End': goToPly(state.moves.length); break;
      case 'f': case 'F': flipBoard(); break;
    }
  });
});