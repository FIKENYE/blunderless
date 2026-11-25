/* ============================================================
   Blunderless — app.js  v2
   Piece-movement animations via chessboard.js moveSpeed.
   Wood-thud sounds synthesised with Web Audio API (no files).
   ============================================================ */

'use strict';

// ── Sound system ────────────────────────────────────────────
/**
 * Generates chess sounds programmatically using the Web Audio API.
 * No audio files needed. All sounds are wood-like noise transients.
 */
class SoundSystem {
  constructor() {
    this._ctx = null;
  }

  _ctx_get() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume on first user gesture (browser autoplay policy).
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  /**
   * Wood transient: shaped white noise with exponential decay.
   * pitch controls how 'thuddy' (low) vs 'clicky' (high) the sound is.
   */
  _wood(pitch = 1.0, vol = 0.6, dur = 0.09) {
    const ctx      = this._ctx_get();
    const bufSize  = Math.floor(ctx.sampleRate * dur);
    const buffer   = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data     = buffer.getChannelData(0);

    for (let i = 0; i < bufSize; i++) {
      // Noise shaped with exponential decay and pitch-controlled filter via
      // a simple IIR-like smoothing (higher pitch = less smoothing = clickier).
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2 + pitch * 3);
    }

    const src  = ctx.createBufferSource();
    src.buffer = buffer;

    // Band-pass-like effect: a biquad filter tuned to 'wood' frequency range.
    const filter      = ctx.createBiquadFilter();
    filter.type       = 'bandpass';
    filter.frequency.value = 300 + pitch * 1200;
    filter.Q.value    = 0.8;

    const gain     = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur + 0.03);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(ctx.currentTime);
    src.stop(ctx.currentTime + dur + 0.05);
  }

  /** Quiet click for a standard piece move. */
  move() {
    this._wood(1.6, 0.5, 0.07);
  }

  /** Louder double-thud for a capture. */
  capture() {
    this._wood(0.6, 0.75, 0.10);
    setTimeout(() => this._wood(0.4, 0.5, 0.09), 40);
  }

  /** Sharp ring for a check. */
  check() {
    const ctx   = this._ctx_get();
    const osc   = ctx.createOscillator();
    const gain  = ctx.createGain();
    osc.type    = 'sine';
    osc.frequency.setValueAtTime(1050, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    // Add the thud on top.
    setTimeout(() => this._wood(1.5, 0.45, 0.07), 15);
  }

  /** Two-part click for castling (rook then king). */
  castle() {
    this._wood(1.4, 0.5, 0.07);
    setTimeout(() => this._wood(1.6, 0.5, 0.07), 130);
  }

  /** Muted thud for game end. */
  gameEnd() {
    this._wood(0.3, 0.9, 0.18);
  }
}

const sounds = new SoundSystem();

// ── State ──────────────────────────────────────────────────
const state = {
  game:         null,   // chess.js instance used for board replaying
  moves:        [],     // array of analysed move objects from /api/analyse-pgn
  plyIndex:     0,      // 0 = initial position
  initialFen:   null,
  initialEval:  null,
  orientation:  'white',
  board:        null,   // chessboard.js instance
};

// ── DOM helpers ────────────────────────────────────────────
const $  = id => document.getElementById(id);

const evalBlackFill = $('eval-black-fill');
const evalWhiteFill = $('eval-white-fill');
const evalLabelT    = $('eval-label-top');
const evalLabelB    = $('eval-label-bot');
const moveTableBody = $('move-tbody');
const emptyMoves    = $('empty-moves');
const gameHeaders   = $('game-headers');
const pgnInput      = $('pgn-input');
const statusMsg     = $('status-msg');
const analyseBtn    = $('analyse-btn');
const playerWhite   = $('player-white');
const playerBlack   = $('player-black');
const gamesList     = $('games-list');

// ── Classification meta ─────────────────────────────────────
const CLF_META = {
  best:       { cls: 'clf-best',       title: 'Best move'   },
  good:       { cls: 'clf-good',       title: 'Good move'   },
  inaccuracy: { cls: 'clf-inaccuracy', title: 'Inaccuracy'  },
  mistake:    { cls: 'clf-mistake',    title: 'Mistake'     },
  blunder:    { cls: 'clf-blunder',    title: 'Blunder'     },
};

function clfDot(clf) {
  const m = CLF_META[clf] || CLF_META.good;
  return `<span class="clf-dot ${m.cls}" title="${m.title}"></span>`;
}

// ── Eval bar ───────────────────────────────────────────────
function setEvalBar(score) {
  let cp;
  if (score.type === 'mate') {
    cp = score.value > 0 ? 10000 : -10000;
    const mv = Math.abs(score.value);
    const lbl = `M${mv}`;
    if (score.value > 0) {
      evalLabelT.textContent = '';
      evalLabelB.textContent = lbl;
    } else {
      evalLabelT.textContent = lbl;
      evalLabelB.textContent = '';
    }
  } else {
    cp = score.value;
    const disp = (Math.abs(cp) / 100).toFixed(1);
    if (cp >= 0) {
      evalLabelT.textContent = '';
      evalLabelB.textContent = '+' + disp;
    } else {
      evalLabelT.textContent = '-' + disp;
      evalLabelB.textContent = '';
    }
  }

  // Sigmoid-like map from centipawns to 0–100%.
  const pct      = Math.round(50 + 50 * Math.tanh(cp / 350));
  const blackPct = 100 - pct;
  evalBlackFill.style.height = blackPct + '%';
  evalWhiteFill.style.height = pct + '%';
}

// ── Board initialisation ────────────────────────────────────
function initBoard() {
  state.board = Chessboard('board', {
    position:    'start',
    orientation: state.orientation,
    pieceTheme:  'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    draggable:   false,
    moveSpeed:   180,     // ms — smooth piece-slide animation
    snapbackSpeed: 150,
    snapSpeed:   80,
  });

  // Dynamically fit the board to available width.
  const boardEl = document.getElementById('board');
  const resize  = () => {
    const avail = boardEl.parentElement.clientWidth - 48;
    const max   = Math.min(avail, parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--board-max') || '600'
    ));
    boardEl.style.width = max + 'px';
    state.board.resize();
  };
  window.addEventListener('resize', resize);
  resize();
}

// ── Last-move highlighting ──────────────────────────────────
let _lastHighlightSquares = [];

function highlightLastMove(fromSq, toSq) {
  // Remove old highlights.
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

  const prevPly   = state.plyIndex;
  state.plyIndex  = ply;

  // Rebuild board to this ply position.
  const tmpGame = new Chess();
  if (state.initialFen) tmpGame.load(state.initialFen);
  for (let i = 0; i < ply; i++) {
    tmpGame.move(state.moves[i].san);
  }

  // Animate: use chessboard.js's built-in animated position change.
  state.board.position(tmpGame.fen(), true /* animate */);

  // Determine source/target squares for highlight & sound.
  if (ply > 0 && ply > prevPly) {
    // Moving forward: play the move at ply-1 (index ply-1 is 1-based).
    const moveData  = state.moves[ply - 1];
    const uci       = moveData.uci;
    const fromSq    = uci.slice(0, 2);
    const toSq      = uci.slice(2, 4);
    highlightLastMove(fromSq, toSq);
    playMoveSound(moveData, tmpGame);
  } else if (ply < prevPly && ply > 0) {
    // Moving backward: show highlight for the move now at top.
    const moveData  = state.moves[ply - 1];
    const uci       = moveData.uci;
    highlightLastMove(uci.slice(0, 2), uci.slice(2, 4));
  } else {
    highlightLastMove(null, null);
  }

  // Update eval bar.
  const evalScore = ply === 0 ? state.initialEval : state.moves[ply - 1].eval_after;
  if (evalScore) setEvalBar(evalScore);

  // Highlight the active move row.
  document.querySelectorAll('.move-row').forEach(r => r.classList.remove('active'));
  if (ply > 0) {
    const activeRow = document.querySelector(`.move-row[data-ply="${ply}"]`);
    if (activeRow) {
      activeRow.classList.add('active');
      activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

// ── Sound selection ─────────────────────────────────────────
function playMoveSound(moveData, boardAfter) {
  const san = moveData.san;

  if (boardAfter.in_checkmate()) {
    sounds.gameEnd();
  } else if (boardAfter.in_check()) {
    sounds.check();
  } else if (san.includes('O-O')) {
    sounds.castle();
  } else if (san.includes('x')) {
    sounds.capture();
  } else {
    sounds.move();
  }
}

// ── Move list ───────────────────────────────────────────────
function renderMoveList(movesData) {
  moveTableBody.innerHTML = '';
  emptyMoves.classList.add('hidden');

  for (let i = 0; i < movesData.length; i += 2) {
    const wm = movesData[i];
    const bm = movesData[i + 1];
    const tr = document.createElement('tr');
    tr.className   = 'move-row';
    tr.dataset.ply = wm.ply;   // row highlighted on white move by default

    const tdNum = document.createElement('td');
    tdNum.className     = 'move-num';
    tdNum.textContent   = wm.move_number;
    tr.appendChild(tdNum);

    const makeCell = (move) => {
      const td  = document.createElement('td');
      if (!move) return td;
      const div       = document.createElement('div');
      div.className   = 'move-cell';
      div.dataset.ply = move.ply;
      div.innerHTML   = `${clfDot(move.classification)}<span>${move.san}</span>`;
      div.addEventListener('click', () => goToPly(move.ply));
      td.appendChild(div);
      return td;
    };

    tr.appendChild(makeCell(wm));
    tr.appendChild(makeCell(bm));
    moveTableBody.appendChild(tr);
  }
}

// ── Analyse from input ──────────────────────────────────────
async function runAnalysis() {
  const raw = pgnInput.value.trim();
  if (!raw) return setStatus('Paste a PGN or FEN first.', 'error');

  setStatus('<span class="spinner"></span> analysing…');
  analyseBtn.disabled = true;

  // Heuristic: FEN = single line, exactly 6 tokens.
  const isFen = !raw.includes('\n') && raw.split(/\s+/).length === 6;

  try {
    if (isFen) await analyseFen(raw);
    else        await analysePgn(raw);
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    analyseBtn.disabled = false;
  }
}

async function analyseFen(fen) {
  const res = await fetchApi('/api/analyse-fen', 'POST', { fen, depth: 12 });

  state.initialFen  = fen;
  state.initialEval = res.engine.score;
  state.moves       = [];
  state.plyIndex    = 0;

  state.board.position(fen, true);
  setEvalBar(res.engine.score);
  moveTableBody.innerHTML = '';
  gameHeaders.classList.add('hidden');
  emptyMoves.textContent = `FEN loaded. Best: ${res.engine.best_move_san || '—'}`;
  emptyMoves.classList.remove('hidden');
  highlightLastMove(null, null);
  setStatus('FEN analysed · depth 12', 'ok');
}

async function analysePgn(pgn) {
  const res = await fetchApi('/api/analyse-pgn', 'POST', { pgn, depth: 10 });

  state.initialFen  = res.initial_fen;
  state.initialEval = res.initial_eval;
  state.moves       = res.moves;
  state.plyIndex    = 0;

  playerWhite.textContent = res.headers.white || 'White';
  playerBlack.textContent = res.headers.black || 'Black';

  if (res.headers.white || res.headers.black) {
    gameHeaders.classList.remove('hidden');
    gameHeaders.innerHTML =
      `<div class="header-players">${res.headers.white} vs ${res.headers.black}</div>` +
      `<div>${res.headers.event || ''} · ${res.headers.date || ''} · ${res.headers.result || ''}</div>`;
  }

  renderMoveList(res.moves);
  emptyMoves.classList.add('hidden');
  goToPly(0);
  setStatus(`Game loaded · ${res.moves.length} half-moves`, 'ok');
}

// ── Chess.com game loader ───────────────────────────────────
async function loadChessComGames() {
  const username = $('chesscom-input').value.trim();
  if (!username) return;

  gamesList.innerHTML = '<div class="empty-state"><span class="spinner"></span> loading…</div>';
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
    const me      = g.white.username.toLowerCase() === currentUser.toLowerCase();
    const myRes   = me ? g.white.result : g.black.result;
    const oppName = me ? g.black.username : g.white.username;
    const myRat   = me ? g.white.rating : g.black.rating;
    const oppRat  = me ? g.black.rating : g.white.rating;

    const cls = myRes === 'win' ? 'result-win'
              : (myRes === 'resigned' || myRes === 'checkmated' || myRes === 'timeout') ? 'result-loss'
              : 'result-draw';
    const lbl = myRes === 'win' ? 'Win'
              : (myRes === 'resigned' || myRes === 'checkmated') ? 'Loss' : 'Draw';
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
      switchTab('moves');
      runAnalysis();
    });
    gamesList.appendChild(card);
  }
}

// ── Tab switching ───────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(pane => {
    const match = pane.id === `tab-${name}`;
    pane.classList.toggle('active', match);
    pane.classList.toggle('hidden', !match);
  });
}

// ── Utilities ───────────────────────────────────────────────
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

// ── Bootstrap ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initBoard();
  setEvalBar({ type: 'cp', value: 20 });

  // Navigation buttons.
  $('btn-start').addEventListener('click', () => goToPly(0));
  $('btn-prev' ).addEventListener('click', () => goToPly(state.plyIndex - 1));
  $('btn-next' ).addEventListener('click', () => goToPly(state.plyIndex + 1));
  $('btn-end'  ).addEventListener('click', () => goToPly(state.moves.length));
  $('btn-flip' ).addEventListener('click', () => {
    state.orientation = state.orientation === 'white' ? 'black' : 'white';
    state.board.flip();
  });

  $('analyse-btn'  ).addEventListener('click', runAnalysis);
  $('chesscom-btn' ).addEventListener('click', loadChessComGames);

  pgnInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) runAnalysis();
  });
  $('chesscom-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadChessComGames();
  });

  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // Keyboard shortcuts.
  document.addEventListener('keydown', e => {
    if (document.activeElement === pgnInput) return;
    if (document.activeElement === $('chesscom-input')) return;

    switch (e.key) {
      case 'ArrowLeft':  goToPly(state.plyIndex - 1); break;
      case 'ArrowRight': goToPly(state.plyIndex + 1); break;
      case 'Home':       goToPly(0);                  break;
      case 'End':        goToPly(state.moves.length); break;
      case 'f': case 'F':
        state.orientation = state.orientation === 'white' ? 'black' : 'white';
        state.board.flip();
        break;
    }
  });
});
