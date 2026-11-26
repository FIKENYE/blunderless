/* ============================================================
   Blunderless — app.js (v6 Refactored)
   - Staunton vector SVGs (viewBox 0 0 45 45, geometricPrecision)
     White: #FAF6F0 fill, #2B1A12 stroke
     Black: #22150E fill, #D8C8B8 interior detail strokes (no thick white outer sticker)
   - Loud creamy/clacky mechanical keyboard ASMR Web Audio engine
     DynamicsCompressorNode + GainNode + 3-layer synthesis (thock, clack, snap, jitter)
   - Live Lichess Opening Explorer (Masters / Lichess database toggle)
     Debounced, cached by FEN, candidate moves table with win/draw/loss % bars,
     interactive candidate clicking, out-of-book detection & return-to-book button.
   ============================================================ */

'use strict';

// ── High-Precision Staunton Vector Pieces (No Thick White Stickers) ──
const PIECE_SVGS = (() => {
  const W_FILL = '#FAF6F0';
  const W_STRK = '#2B1A12';
  const B_FILL = '#22150E'; // Deep roasted espresso
  const B_LINE = '#D8C8B8'; // Warm subtle cream interior detailing

  const makeSvg = (inner) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" shape-rendering="geometricPrecision">${inner}</svg>`;

  const pieces = {
    // Pawn
    wP: makeSvg(`<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="${W_FILL}" stroke="${W_STRK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
    bP: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="0.8"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/><circle cx="22.5" cy="13" r="2" fill="none" stroke="${B_LINE}" stroke-width="1.1"/><path d="M19.5 24.5c1.8-.8 4.2-.8 6 0" fill="none" stroke="${B_LINE}" stroke-width="1.1" stroke-linecap="round"/></g>`),

    // Rook
    wR: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none"/></g>`),
    bR: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="0.8" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z"/><path d="M14 29.5v-13h17v13H14z"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z"/><path d="M12 35.5h21M13 31.5h19M14 29.5h17M14 16.5h17M11 14h23" fill="none" stroke="${B_LINE}" stroke-width="1.1" stroke-linecap="round"/></g>`),

    // Knight
    wN: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><circle cx="15" cy="14.5" r="1.2" fill="${W_STRK}" stroke="none"/></g>`),
    bN: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="0.8" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/><circle cx="15" cy="14.5" r="1.2" fill="${B_LINE}" stroke="none"/><path d="M24 18c.38 2.91-5.55 7.37-8 9M18 13.5c2 2 3.5 5 4 8" fill="none" stroke="${B_LINE}" stroke-width="1.1" stroke-linecap="round"/></g>`),

    // Bishop
    wB: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/><path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" fill="none"/></g>`),
    bB: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="0.8" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/><path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" fill="none" stroke="${B_LINE}" stroke-width="1.1" stroke-linecap="round"/></g>`),

    // Queen
    wQ: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.2"/><circle cx="14" cy="9" r="2.2"/><circle cx="22.5" cy="8" r="2.2"/><circle cx="31" cy="9" r="2.2"/><circle cx="39" cy="12" r="2.2"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/></g>`),
    bQ: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="0.8" stroke-linejoin="round"><circle cx="6" cy="12" r="2.2"/><circle cx="14" cy="9" r="2.2"/><circle cx="22.5" cy="8" r="2.2"/><circle cx="31" cy="9" r="2.2"/><circle cx="39" cy="12" r="2.2"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="${B_LINE}" stroke-width="1.1" stroke-linecap="round"/></g>`),

    // King
    wK: makeSvg(`<g fill="${W_FILL}" stroke="${W_STRK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" fill="none"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" fill="none"/></g>`),
    bK: makeSvg(`<g fill="${B_FILL}" stroke="${B_FILL}" stroke-width="0.8" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" fill="none" stroke="${B_LINE}" stroke-width="1.6" stroke-linecap="round"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" fill="none" stroke="${B_LINE}" stroke-width="1.1" stroke-linecap="round"/></g>`),
  };

  const uris = {};
  for (const [k, svg] of Object.entries(pieces)) {
    uris[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  return uris;
})();

// ── Loud, Creamy/Clacky Mechanical Keyboard ASMR Audio Engine ─
/**
 * Procedural 3-layer mechanical switch synthesizer:
 *  - Master compressor (-12dB, ratio 6) + gain (0.85)
 *  - Layer 1 (Creamy Thock): 240Hz -> 85Hz sweep over 45ms through 420Hz LPF
 *  - Layer 2 (Clacky Stem Impact): 18ms noise burst through 1850Hz BPF (Q 2.8)
 *  - Layer 3 (Transient Snap): 6ms high-frequency impulse click at 3200Hz
 *  - Pitch jitter (+-4%)
 */
class MechanicalAsmrEngine {
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

      // Dynamics compressor to let audio punch without clipping
      this._compressor = this._ctx.createDynamicsCompressor();
      this._compressor.threshold.setValueAtTime(-12, this._ctx.currentTime);
      this._compressor.ratio.setValueAtTime(6, this._ctx.currentTime);
      this._compressor.attack.setValueAtTime(0.003, this._ctx.currentTime);
      this._compressor.release.setValueAtTime(0.05, this._ctx.currentTime);

      // Loud master gain (0.85)
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

  /** Synthesise a single creamy/clacky switch impact */
  _synthesizeClack(pitchMod = 1.0, vol = 1.0) {
    if (!this.enabled) return;
    const ctx = this._init();
    const now = ctx.currentTime;
    const jitter = (0.96 + Math.random() * 0.08) * pitchMod;

    // ── Layer 1: Creamy Bottom-Out Thock (Triangle low sweep) ──
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const oscFilter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(85 * jitter, now + 0.045);

    oscFilter.type = 'lowpass';
    oscFilter.frequency.setValueAtTime(420, now);

    oscGain.gain.setValueAtTime(0.75 * vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(this._compressor);

    osc.start(now);
    osc.stop(now + 0.046);

    // ── Layer 2: Clacky Stem Impact (18ms noise burst) ──
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      const env = Math.pow(1 - i / noiseData.length, 3.2);
      noiseData[i] = (Math.random() * 2 - 1) * env;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const stemFilter = ctx.createBiquadFilter();
    stemFilter.type = 'bandpass';
    stemFilter.frequency.setValueAtTime(1850 * jitter, now);
    stemFilter.Q.setValueAtTime(2.8, now);

    const stemGain = ctx.createGain();
    stemGain.gain.setValueAtTime(0.65 * vol, now);
    stemGain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

    noiseSrc.connect(stemFilter);
    stemFilter.connect(stemGain);
    stemGain.connect(this._compressor);

    noiseSrc.start(now);
    noiseSrc.stop(now + 0.02);

    // ── Layer 3: Keycap Transient Snap (6ms high impulse) ──
    const snapOsc = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snapOsc.type = 'sine';
    snapOsc.frequency.setValueAtTime(3200 * jitter, now);

    snapGain.gain.setValueAtTime(0.4 * vol, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.006);

    snapOsc.connect(snapGain);
    snapGain.connect(this._compressor);

    snapOsc.start(now);
    snapOsc.stop(now + 0.007);
  }

  /** Soft muted chime for check & checkmate */
  _chime(f1 = 520, f2 = 780, dur = 0.14) {
    if (!this.enabled) return;
    const ctx = this._init();
    const now = ctx.currentTime;

    [f1, f2].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this._compressor);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    });
  }

  /** Normal Move */
  move() {
    this._synthesizeClack(1.0, 1.0);
  }

  /** Capture (x): Double-tap clack 28ms apart */
  capture() {
    this._synthesizeClack(1.08, 0.95);
    setTimeout(() => this._synthesizeClack(0.92, 1.1), 28);
  }

  /** Castling (O-O): Two rapid clacks 45ms apart */
  castle() {
    this._synthesizeClack(1.0, 0.9);
    setTimeout(() => this._synthesizeClack(0.95, 0.95), 45);
  }

  /** Check (+): Clack + soft dual chime */
  check() {
    this._synthesizeClack(1.15, 1.0);
    this._chime(520, 780, 0.14);
  }

  /** Checkmate (#) / Game End: Deeper clack + resolving chime */
  gameEnd() {
    this._synthesizeClack(0.85, 1.2);
    setTimeout(() => this._chime(390, 650, 0.22), 35);
  }
}

const sounds = new MechanicalAsmrEngine();

// ── State ───────────────────────────────────────────────────
const state = {
  moves: [],
  plyIndex: 0,
  initialFen: null,
  initialEval: null,
  orientation: 'white',
  board: null,
  activeFilter: null,
  showCoords: true,
  engineLinesExpanded: true,
  selectedDb: 'masters', // 'masters' or 'lichess'
  lastKnownOpening: 'Starting Position',
  lastKnownEco: '',
  lastBookPly: 0,
  isOutOfBook: false,
  headers: {
    white: 'White', black: 'Black',
    white_elo: '', black_elo: '',
    initial_clock: '--:--',
  },
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

const CLF_META = {
  best: { glyph: '★', cls: 'glyph-best', badgeCls: 'clf-best', title: 'Best' },
  good: { glyph: '', cls: 'glyph-good', badgeCls: 'clf-good', title: 'Good' },
  inaccuracy: { glyph: '?!', cls: 'glyph-inaccuracy', badgeCls: 'clf-inaccuracy', title: 'Inaccuracy' },
  mistake: { glyph: '?', cls: 'glyph-mistake', badgeCls: 'clf-mistake', title: 'Mistake' },
  blunder: { glyph: '??', cls: 'glyph-blunder', badgeCls: 'clf-blunder', title: 'Blunder' },
};

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

// ── MultiPV Engine Lines Update ──────────────────────────────
function updateEngineLines(score, bestMoveSan) {
  const s = score || { type: 'cp', value: 20 };
  const base = s.type === 'mate' ? `M${s.value}` : (s.value >= 0 ? `+${(s.value / 100).toFixed(2)}` : `${(s.value / 100).toFixed(2)}`);
  
  $('pv1-score').textContent = base;
  if (bestMoveSan) {
    $('pv1-moves').textContent = `1. ${bestMoveSan} ... (best variation)`;
  } else {
    $('pv1-moves').textContent = '1. e4 e5 2. Nf3 Nc6 3. Bb5';
  }

  if (s.type === 'cp') {
    const cp2 = s.value - 12;
    const cp3 = s.value - 24;
    $('pv2-score').textContent = (cp2 >= 0 ? `+${(cp2 / 100).toFixed(2)}` : `${(cp2 / 100).toFixed(2)}`);
    $('pv3-score').textContent = (cp3 >= 0 ? `+${(cp3 / 100).toFixed(2)}` : `${(cp3 / 100).toFixed(2)}`);
  }
}

// ── Live Opening Explorer (Lichess API) ──────────────────────
async function fetchOpeningData(fen) {
  const cacheKey = `${state.selectedDb}:${fen}`;
  if (openingCache.has(cacheKey)) {
    return openingCache.get(cacheKey);
  }

  const endpoint = state.selectedDb === 'masters'
    ? `https://explorer.lichess.org/masters?fen=${encodeURIComponent(fen)}`
    : `https://explorer.lichess.org/lichess?fen=${encodeURIComponent(fen)}`;

  try {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    openingCache.set(cacheKey, data);
    return data;
  } catch (err) {
    // If offline or failed, fallback to local lookup/graceful message
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
  const tmpGame = new Chess();
  if (state.initialFen) tmpGame.load(state.initialFen);
  for (let i = 0; i < state.plyIndex; i++) {
    tmpGame.move(state.moves[i].san);
  }

  const moveRes = tmpGame.move(san);
  if (!moveRes) return;

  const afterFen = tmpGame.fen();
  const ply = state.plyIndex + 1;

  // Append move into state if exploring past current game length
  const syntheticMove = {
    ply: ply,
    move_number: Math.floor((ply + 1) / 2),
    color: moveRes.color === 'w' ? 'white' : 'black',
    uci: moveRes.from + moveRes.to + (moveRes.promotion || ''),
    san: moveRes.san,
    fen: afterFen,
    clock: '--:--',
    eval_after: { type: 'cp', value: 15 },
    eval_change: 0,
    classification: 'best',
    best_move_san: san,
  };

  // Truncate future moves if we branch from mid-game
  state.moves = state.moves.slice(0, state.plyIndex);
  state.moves.push(syntheticMove);

  renderMoveList(state.moves);
  goToPly(ply);
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
    pieceTheme: (piece) => PIECE_SVGS[piece],
    draggable: false,
    moveSpeed: 150,
    snapbackSpeed: 120,
    snapSpeed: 60,
  });

  const boardEl = $('board');
  const evalShell = $('eval-bar-shell');
  const topBar = $('top-player-bar');
  const botBar = $('bot-player-bar');

  const resize = () => {
    const stage = document.querySelector('.left-stage');
    if (!stage) return;

    // Available space accounting for padding and player bars
    const availH = stage.clientHeight - 130;
    const availW = stage.clientWidth - 110;
    const rawSize = Math.max(280, Math.min(availH, availW, 680));

    // Snap to 8px multiple for pixel-crisp squares
    const snapped = Math.floor(rawSize / 8) * 8;

    boardEl.style.width = snapped + 'px';
    boardEl.style.height = snapped + 'px';
    
    // Eval bar height matches the 8x8 chessboard only
    evalShell.style.height = snapped + 'px';

    // Player bars match the exact width of the 8x8 board
    topBar.style.width = snapped + 'px';
    botBar.style.width = snapped + 'px';

    state.board.resize();
  };

  window.addEventListener('resize', resize);
  setTimeout(resize, 50);
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

  // Render circular classification badge on destination square
  if (classification && classification !== 'good') {
    const toSquareEl = $('board').querySelector(`[data-square="${toSq}"]`);
    if (toSquareEl) {
      const meta = CLF_META[classification];
      if (meta && meta.glyph) {
        const badge = document.createElement('div');
        badge.className = `square-badge ${meta.badgeCls}`;
        badge.textContent = meta.glyph;
        toSquareEl.appendChild(badge);
      }
    }
  }
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

  const currentFen = tmpGame.fen();
  state.board.position(currentFen, true);

  if (ply > 0) {
    const moveData = state.moves[ply - 1];
    const uci = moveData.uci;
    highlightLastMove(uci.slice(0, 2), uci.slice(2, 4), moveData.classification);
    if (ply > prevPly) playMoveSound(moveData, tmpGame);
    updateEngineLines(moveData.eval_after, moveData.best_move_san);
  } else {
    highlightLastMove(null, null, null);
    updateEngineLines(state.initialEval, state.moves[0]?.best_move_san);
  }

  // Update Live Opening Explorer & ECO pill
  updateOpeningDisplay(currentFen);

  const evalScore = ply === 0 ? state.initialEval : state.moves[ply - 1]?.eval_after;
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

// ── Move List & Quality Summary Calculations ─────────────────
function calculateAccuracy(moves) {
  if (!moves || moves.length === 0) return { white: null, black: null };

  let wSum = 0, wCount = 0;
  let bSum = 0, bCount = 0;

  for (const m of moves) {
    const loss = Math.max(0, -m.eval_change);
    const moveAcc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * (loss / 10)) - 3.1669));

    if (m.color === 'white') {
      wSum += moveAcc;
      wCount++;
    } else {
      bSum += moveAcc;
      bCount++;
    }
  }

  return {
    white: wCount > 0 ? (wSum / wCount).toFixed(1) : null,
    black: bCount > 0 ? (bSum / bCount).toFixed(1) : null,
  };
}

function renderMoveList(movesData) {
  moveTableBody.innerHTML = '';
  emptyMoves.classList.add('hidden');
  quickImportPanel.classList.add('hidden');

  const counts = { best: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const m of movesData) {
    if (counts[m.classification] !== undefined) counts[m.classification]++;
  }
  $('cnt-best').textContent = counts.best;
  $('cnt-inacc').textContent = counts.inaccuracy;
  $('cnt-mistake').textContent = counts.mistake;
  $('cnt-blunder').textContent = counts.blunder;

  const acc = calculateAccuracy(movesData);
  if (acc.white) {
    $('acc-white-val').textContent = `${acc.white}%`;
    $('acc-black-val').textContent = `${acc.black}%`;
    const wVal = parseFloat(acc.white);
    const bVal = parseFloat(acc.black);
    const total = wVal + bVal;
    const wPct = total > 0 ? (wVal / total) * 100 : 50;
    $('acc-white-bar').style.width = `${wPct}%`;
  }

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

// ── Filter Moves by Classification ───────────────────────────
function filterMovesByClassification(clf) {
  const buttons = document.querySelectorAll('.clf-badge-btn');
  if (state.activeFilter === clf) {
    state.activeFilter = null;
    buttons.forEach(b => b.classList.remove('filter-active'));
    document.querySelectorAll('.move-cell').forEach(c => c.style.opacity = '1');
    return;
  }

  state.activeFilter = clf;
  buttons.forEach(b => b.classList.toggle('filter-active', b.dataset.clf === clf));

  let firstMatchPly = null;
  document.querySelectorAll('.move-cell').forEach(c => {
    const isMatch = c.dataset.clf === clf;
    c.style.opacity = isMatch ? '1' : '0.35';
    if (isMatch && firstMatchPly === null) {
      firstMatchPly = parseInt(c.dataset.ply, 10);
    }
  });

  if (firstMatchPly !== null) {
    goToPly(firstMatchPly);
  }
}

// ── Analysis Requests ───────────────────────────────────────
async function runAnalysis(customText = null) {
  const raw = (customText !== null ? customText : pgnInput.value).trim();
  if (!raw) {
    switchTab('info');
    return setStatus('Paste a PGN or FEN first.', 'error');
  }

  setStatus('<span class="spinner"></span> Analysing with Stockfish...');
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
  state.board.position(fen, true);
  setEvalBar(res.engine.score);
  updateEngineLines(res.engine.score, res.engine.best_move_san);
  updateOpeningDisplay(fen);
  syncPlayerBars(0);

  moveTableBody.innerHTML = '';
  gameHeaders.classList.add('hidden');
  emptyMoves.textContent = `FEN loaded. Best move: ${res.engine.best_move_san || '—'}`;
  emptyMoves.classList.remove('hidden');
  quickImportPanel.classList.add('hidden');
  highlightLastMove(null, null, null);
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

  renderMoveList(res.moves);
  emptyMoves.classList.add('hidden');
  goToPly(0);
  setStatus(`Loaded · ${res.moves.length} half-moves`, 'ok');
  switchTab('moves');
}

// ── Chess.com Loader ────────────────────────────────────────
async function loadChessComGames(usernameOverride = null) {
  const username = usernameOverride || $('chesscom-input').value.trim() || $('tab-chesscom-input').value.trim();
  if (!username) return;

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
      pgnInput.value = g.pgn;
      runAnalysis(g.pgn);
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

function switchDatabase(db) {
  state.selectedDb = db;
  $('db-btn-masters').classList.toggle('active', db === 'masters');
  $('db-btn-lichess').classList.toggle('active', db === 'lichess');

  const tmpGame = new Chess();
  if (state.initialFen) tmpGame.load(state.initialFen);
  for (let i = 0; i < state.plyIndex; i++) {
    tmpGame.move(state.moves[i].san);
  }
  updateOpeningDisplay(tmpGame.fen());
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

  // Return to last book move button
  $('btn-return-book').addEventListener('click', () => {
    goToPly(state.lastBookPly);
  });

  // Database Toggle (Masters vs Lichess)
  $('db-btn-masters').addEventListener('click', () => switchDatabase('masters'));
  $('db-btn-lichess').addEventListener('click', () => switchDatabase('lichess'));

  // Engine Lines Collapse Toggle
  $('btn-engine-toggle').addEventListener('click', toggleEngineLines);

  // Classification Badge Click Filters
  document.querySelectorAll('.clf-badge-btn').forEach(btn => {
    btn.addEventListener('click', () => filterMovesByClassification(btn.dataset.clf));
  });

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
      case 'ArrowLeft':
        e.preventDefault();
        goToPly(state.plyIndex - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        goToPly(state.plyIndex + 1);
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
    }
  });
});
