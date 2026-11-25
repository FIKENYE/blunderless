/* ============================================================
   Blunderless — app.js
   Single-page chess analysis frontend.
   Talks to the FastAPI backend (/api/*) for all engine work.
   ============================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────
const state = {
  game:        null,   // current chess.js Game instance
  moves:       [],     // array of analysed move objects from /api/analyse-pgn
  plyIndex:    0,      // which position we are viewing (0 = initial)
  orientation: 'white',
  board:       null,   // chessboard.js instance
};

// ── DOM refs ───────────────────────────────────────────────
const $  = id => document.getElementById(id);
const evalBlack   = $('eval-black-fill');
const evalWhite   = $('eval-fill') || null;  // alias set below
const evalLabelT  = $('eval-label-top');
const evalLabelB  = $('eval-label-bot');
const moveTableBody  = $('move-tbody');
const emptyMoves  = $('empty-moves');
const gameHeaders = $('game-headers');
const pgnInput    = $('pgn-input');
const statusMsg   = $('status-msg');
const analyseBtn  = $('analyse-btn');
const playerWhite = $('player-white');
const playerBlack = $('player-black');
const gamesList   = $('games-list');

// ── Classification display helpers ─────────────────────────
const CLF_META = {
  best:       { label: '★', cls: 'clf-best',       title: 'Best move'   },
  good:       { label: '✓', cls: 'clf-good',       title: 'Good move'   },
  inaccuracy: { label: '?!', cls: 'clf-inaccuracy', title: 'Inaccuracy' },
  mistake:    { label: '?',  cls: 'clf-mistake',    title: 'Mistake'    },
  blunder:    { label: '??', cls: 'clf-blunder',    title: 'Blunder'    },
};

function clfDot(clf) {
  const m = CLF_META[clf] || CLF_META.good;
  return `<span class="clf-dot ${m.cls}" title="${m.title + ': ' + clf}"></span>`;
}

// ── Eval bar ───────────────────────────────────────────────
/**
 * Update the vertical eval bar.
 * score: { type: "cp"|"mate", value: <number> }  — White-POV from server.
 */
function setEvalBar(score) {
  let cp;
  if (score.type === 'mate') {
    cp = score.value > 0 ? 10000 : -10000;
    const mv = Math.abs(score.value);
    const label = score.value > 0 ? `M${mv}` : `-M${mv}`;
    evalLabelT.textContent = score.value < 0 ? label : '';
    evalLabelB.textContent = score.value > 0 ? label : '';
  } else {
    cp = score.value;
    const disp = (Math.abs(cp) / 100).toFixed(1);
    const sign  = cp >= 0 ? '+' : '-';
    evalLabelT.textContent = cp < 0 ? sign + disp : '';
    evalLabelB.textContent = cp >= 0 ? sign + disp : '';
  }

  // Map centipawns to a 0-100 percentage with a sigmoid-like clamp.
  const pct = Math.round(50 + 50 * Math.tanh(cp / 400));
  const blackPct = 100 - pct;

  $('eval-black-fill').style.height = blackPct + '%';
  $('eval-white-fill').style.height = pct + '%';
}

// ── Board ──────────────────────────────────────────────────
function initBoard() {
  state.game = new Chess();
  state.board = Chessboard('board', {
    position:    'start',
    orientation: state.orientation,
    pieceTheme:  'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    draggable:   false,   // navigation-only until we add drag-to-move later
  });

  // Set board width to match its container dynamically.
  const boardEl = document.getElementById('board');
  const resize  = () => {
    const avail = boardEl.parentElement.clientWidth - 40;
    const max   = Math.min(avail, 480);
    boardEl.style.width  = max + 'px';
    state.board.resize();
  };
  window.addEventListener('resize', resize);
  resize();
}

// ── Navigation ─────────────────────────────────────────────
function goToPly(ply) {
  // ply 0 = initial position, 1..n = after each half-move.
  if (ply < 0 || ply > state.moves.length) return;
  state.plyIndex = ply;

  // Replay from starting FEN to reach target ply.
  const game = new Chess();
  if (state.initialFen) game.load(state.initialFen);
  for (let i = 0; i < ply; i++) {
    game.move(state.moves[i].san);
  }
  state.board.position(game.fen(), false);

  // Eval bar: use the eval_after of the last move, or initial eval.
  const evalScore = ply === 0
    ? state.initialEval
    : state.moves[ply - 1].eval_after;
  if (evalScore) setEvalBar(evalScore);

  // Highlight the active move row.
  document.querySelectorAll('.move-row').forEach(row => row.classList.remove('active'));
  if (ply > 0) {
    const activeRow = document.querySelector(`.move-row[data-ply="${ply}"]`);
    if (activeRow) {
      activeRow.classList.add('active');
      activeRow.scrollIntoView({ block: 'nearest' });
    }
  }
}

// ── Move list rendering ─────────────────────────────────────
function renderMoveList(movesData) {
  moveTableBody.innerHTML = '';
  emptyMoves.classList.add('hidden');

  // Group into pairs: white move + black move per row.
  for (let i = 0; i < movesData.length; i += 2) {
    const whiteMove = movesData[i];
    const blackMove = movesData[i + 1];
    const moveNum   = whiteMove.move_number;

    const tr = document.createElement('tr');
    tr.className = 'move-row';

    // Move number cell.
    const tdNum = document.createElement('td');
    tdNum.className = 'move-num';
    tdNum.textContent = moveNum;
    tr.appendChild(tdNum);

    // Helper: build one move cell.
    const makeCell = (move) => {
      if (!move) return document.createElement('td');
      const td  = document.createElement('td');
      const div = document.createElement('div');
      div.className = 'move-cell';
      div.dataset.ply = move.ply;
      div.innerHTML = `${clfDot(move.classification)}<span>${move.san}</span>`;
      div.addEventListener('click', () => goToPly(move.ply));

      // The row gets its data-ply from the first (white) move for simple highlighting.
      tr.dataset.ply = move.ply;
      td.appendChild(div);
      return td;
    };

    tr.appendChild(makeCell(whiteMove));
    tr.appendChild(makeCell(blackMove));
    moveTableBody.appendChild(tr);
  }
}

// ── Analyse PGN/FEN ─────────────────────────────────────────
async function runAnalysis() {
  const raw = pgnInput.value.trim();
  if (!raw) return setStatus('Paste a PGN or FEN first.', 'error');

  setStatus('<span class="spinner"></span> analysing…');
  analyseBtn.disabled = true;

  // Detect FEN vs PGN: a FEN has exactly 6 space-separated tokens and no newlines.
  const isFen = !raw.includes('\n') && raw.split(' ').length === 6;

  try {
    if (isFen) {
      await analyseFen(raw);
    } else {
      await analysePgn(raw);
    }
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

  state.board.position(fen, false);
  setEvalBar(res.engine.score);
  moveTableBody.innerHTML = '';
  gameHeaders.classList.add('hidden');
  emptyMoves.textContent = 'FEN loaded. Best move: ' + (res.engine.best_move_san || '—');
  emptyMoves.classList.remove('hidden');
  setStatus('FEN analysed. Depth 12.', 'ok');
}

async function analysePgn(pgn) {
  const res = await fetchApi('/api/analyse-pgn', 'POST', { pgn, depth: 10 });

  state.initialFen  = res.initial_fen;
  state.initialEval = res.initial_eval;
  state.moves       = res.moves;
  state.plyIndex    = 0;

  // Update player names.
  playerWhite.textContent = res.headers.white || 'White';
  playerBlack.textContent = res.headers.black || 'Black';

  // Show game header.
  if (res.headers.white !== '' || res.headers.black !== '') {
    gameHeaders.classList.remove('hidden');
    gameHeaders.innerHTML =
      `<div class="header-players">${res.headers.white} vs ${res.headers.black}</div>` +
      `<div>${res.headers.event || ''} · ${res.headers.date || ''} · ${res.headers.result || ''}</div>`;
  }

  renderMoveList(res.moves);
  emptyMoves.classList.add('hidden');
  goToPly(0);
  setStatus(`Game loaded · ${res.moves.length} half-moves analysed.`, 'ok');
}

// ── Chess.com game loader ───────────────────────────────────
async function loadChessComGames() {
  const username = $('chesscom-input').value.trim();
  if (!username) return;

  gamesList.innerHTML = '<div class="empty-state"><span class="spinner"></span> loading games…</div>';
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
    const myResult = me ? g.white.result : g.black.result;
    const oppName  = me ? g.black.username : g.white.username;
    const myRating = me ? g.white.rating : g.black.rating;
    const oppRating= me ? g.black.rating : g.white.rating;

    const resultCls = myResult === 'win' ? 'result-win'
                    : myResult === 'resigned' || myResult === 'checkmated' || myResult === 'timeout' ? 'result-loss'
                    : 'result-draw';
    const resultLabel = myResult === 'win' ? 'Win' : (myResult === 'resigned' || myResult === 'checkmated') ? 'Loss' : 'Draw';

    const date = g.end_time
      ? new Date(g.end_time * 1000).toLocaleDateString()
      : '';

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML =
      `<div class="game-card-players">${currentUser} (${myRating}) vs ${oppName} (${oppRating})</div>` +
      `<div class="game-card-meta">` +
        `<span class="${resultCls}">${resultLabel}</span>` +
        `<span>${g.time_class}</span>` +
        `<span>${date}</span>` +
      `</div>`;

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
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('.tab-content').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${name}`);
    pane.classList.toggle('hidden', pane.id !== `tab-${name}`);
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

// ── Event wiring ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initBoard();
  setEvalBar({ type: 'cp', value: 20 });   // neutral-ish start

  $('btn-start').addEventListener('click', () => goToPly(0));
  $('btn-prev' ).addEventListener('click', () => goToPly(state.plyIndex - 1));
  $('btn-next' ).addEventListener('click', () => goToPly(state.plyIndex + 1));
  $('btn-end'  ).addEventListener('click', () => goToPly(state.moves.length));
  $('btn-flip' ).addEventListener('click', () => {
    state.orientation = state.orientation === 'white' ? 'black' : 'white';
    state.board.flip();
  });

  $('analyse-btn').addEventListener('click', runAnalysis);
  pgnInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) runAnalysis();
  });

  $('chesscom-btn').addEventListener('click', loadChessComGames);
  $('chesscom-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') loadChessComGames();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Keyboard navigation: arrow keys.
  document.addEventListener('keydown', e => {
    if (document.activeElement === pgnInput) return;
    if (e.key === 'ArrowLeft')  goToPly(state.plyIndex - 1);
    if (e.key === 'ArrowRight') goToPly(state.plyIndex + 1);
    if (e.key === 'ArrowUp')    goToPly(0);
    if (e.key === 'ArrowDown')  goToPly(state.moves.length);
  });
});
