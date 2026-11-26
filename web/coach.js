/* ============================================================
   Blunderless — coach.js
   Floating Geometric Bauhaus Pixel-Art Knight Mascot
   - 32x32 crispEdges <rect>-only SVG (zero curves/gradients/AA)
   - Palette: #22150E (espresso), #FAF6F0 (ivory), #A67B5B (tan),
              #C86D3B (terracotta)
   - Modular animated layers:
       #knight-head, #knight-ears, #knight-brows, #knight-eyes,
       #knight-pupils, #knight-mouth, #knight-sweat-tear
   - 5-State Escalation State Machine:
       deadpan -> brilliant_shock -> flabbergasted ->
       manic_meltdown -> depressed (greyscale + sliding tear)
   - Typewriter reveal (20ms/char, 170ms punctuation pause) +
     4ms mechanical key-tick every 3rd character + sarcasm bank
   ============================================================ */

(function (global) {
  'use strict';

  const PAL = {
    E: '#22150E', // Deep Roasted Espresso (outlines & deep shadows)
    I: '#FAF6F0', // Warm Parchment Ivory (main planar face & highlights)
    T: '#A67B5B', // Warm Tan (neck, mane & snout shading)
    C: '#C86D3B', // Terracotta (stepped pedestal base & collar)
    W: '#FFFFFF', // Bright pixel teeth / sclera glint
    B: '#A6C8DC', // Light-blue ivory pixel tear
  };

  /**
   * Compile an array of ASCII strings (at offset x0, y0) into horizontal-merged
   * crisp <rect> pixel blocks so there are zero curves and minimal DOM nodes.
   */
  function gridToRects(rows, x0 = 0, y0 = 0) {
    const out = [];
    for (let r = 0; r < rows.length; r++) {
      const line = rows[r];
      let c = 0;
      while (c < line.length) {
        const ch = line[c];
        if (!PAL[ch]) {
          c++;
          continue;
        }
        let run = 1;
        while (c + run < line.length && line[c + run] === ch) run++;
        out.push(
          `<rect x="${x0 + c}" y="${y0 + r}" width="${run}" height="1" fill="${PAL[ch]}"/>`
        );
        c += run;
      }
    }
    return out.join('');
  }

  // ── 32x32 Bauhaus Pixel-Art Knight Sprite Layers ───────────
  const EARS_NORMAL = gridToRects([
    '..........EE.EE.................',
    '.........EIIEIIE................',
    '........ETTTETIIE...............',
    '.........EETETIIE...............',
    '..........EE.ETIE...............',
  ], 0, 1);

  const EARS_DEPRESSED = gridToRects([
    '................................',
    '................................',
    '.......EEEE.EEE.................',
    '......ETTTTEIIEE................',
    '.......EEEEEIIIE................',
  ], 0, 1);

  // Planar Head, Arched Neck, Jagged Stepped Mane & Stepped Terracotta Pedestal
  const HEAD_NECK_BASE = gridToRects([
    '................EEEE............', // y=4
    '..........EEEEEEEEIIE...........', // y=5
    '.........EIIIIIIEETTTTE.........', // y=6
    '........EIIIIIIIEETTTTIE........', // y=7
    '.......EIIIIIIIIIIETTTTIE.......', // y=8
    '......EIIIIIIIIIIIETTTTTIE......', // y=9
    '.....EIIIIIIIIIIIIETTTTTE.......', // y=10
    '....EIIIIIIIIIITTTETTTTTIE......', // y=11
    '...EITIIIIIIIITTTETTTTTTIE......', // y=12
    '..EITIIIIIIIITTTETTTTTTTIE......', // y=13
    '..ETTTIIIITTTTTETTTTITTEEE......', // y=14
    '..ETETTTTEEEEEEETTTIITEETEE.....', // y=15
    '...ETTTTEEE..EETTTIITEETEE......', // y=16
    '....EEEE....EETTTIITEEEEE.......', // y=17
    '...........EETTTIITEEEEE........', // y=18
    '..........EETTTIITEEEEE.........', // y=19
    '.........EETTTIITEEEEE..........', // y=20
    '.........EETTIITEEEEE...........', // y=21
    '........EEEEEEEEEEEEEEE.........', // y=22  collar top
    '.......ECCIICCCCCCEEEEE.........', // y=23  collar fill
    '........EEEEEEEEEEEEEEE.........', // y=24  collar bottom
    '.......ECCIICCCCCCCEEEEE........', // y=25  pedestal step 1
    '......ECCIIICCCCCCCEEEEEE.......', // y=26
    '......EEEEEEEEEEEEEEEEEEE.......', // y=27
    '.....ECCIIICCCCCCCCCEEEEEE......', // y=28  pedestal plinth
    '.....ECCIIICCCCCCCCCEEEEEE......', // y=29
    '.....EEEEEEEEEEEEEEEEEEEEE......', // y=30  bottom border
  ], 0, 4);

  // ── Modular Expression Layers (Deadpan, Brilliant, Flabbergasted, Manic, Depressed) ──
  const BROWS_SVG = [
    // deadpan: flat unimpressed heavy brow
    `<g class="expr-layer expr-deadpan">${gridToRects(['EEEEEEE'], 10, 9)}</g>`,
    // brilliant_shock: high raised startled brow
    `<g class="expr-layer expr-brilliant_shock">${gridToRects(['.EEEEE.', 'E.....E'], 10, 7)}</g>`,
    // flabbergasted: sharply furrowed V brow
    `<g class="expr-layer expr-flabbergasted">${gridToRects(['EE...EE', '..EEE..'], 10, 8)}</g>`,
    // manic_meltdown: wild unhinged brows
    `<g class="expr-layer expr-manic_meltdown">${gridToRects(['.EE.EE.', 'E..E..E'], 10, 7)}</g>`,
    // depressed: heavy drooping slanted brow
    `<g class="expr-layer expr-depressed">${gridToRects(['EE.....', '..EEEEE'], 10, 9)}</g>`,
  ].join('');

  const EYES_SVG = [
    // deadpan: half-lidded flat side-eye
    `<g class="expr-layer expr-deadpan">${gridToRects([
      'EWWWE',
      'EEEEE',
      '.TTT.',
    ], 11, 10)}</g>`,
    // brilliant_shock: wide-eyed disbelief
    `<g class="expr-layer expr-brilliant_shock">${gridToRects([
      '.EEE.',
      'EWWWE',
      'EWWWE',
      '.EEE.',
    ], 11, 9)}</g>`,
    // flabbergasted: startled wide eye
    `<g class="expr-layer expr-flabbergasted">${gridToRects([
      'EEEEE',
      'EWWWE',
      'EWWWE',
      'EEEEE',
    ], 11, 9)}</g>`,
    // manic_meltdown: huge unhinged bulging eyes
    `<g class="expr-layer expr-manic_meltdown">${gridToRects([
      '.EEEE.',
      'EWWWWE',
      'EWWWWE',
      'EWWWWE',
      '.EEEE.',
    ], 10, 8)}</g>`,
    // depressed: defeated closed eyes
    `<g class="expr-layer expr-depressed">${gridToRects([
      'TTTTT',
      'EEEEE',
    ], 11, 10)}</g>`,
  ].join('');

  const PUPILS_SVG = [
    // deadpan: side-eye pupil (shifts +-1px via JS transform)
    `<g class="expr-layer expr-deadpan">${gridToRects(['E'], 12, 10)}</g>`,
    // brilliant_shock: tiny stunned pinpoint
    `<g class="expr-layer expr-brilliant_shock">${gridToRects(['E'], 13, 10)}</g>`,
    // flabbergasted: startled pupil
    `<g class="expr-layer expr-flabbergasted">${gridToRects(['EE'], 12, 10)}</g>`,
    // manic_meltdown: unhinged tiny pinpoint in bulging white eye
    `<g class="expr-layer expr-manic_meltdown">${gridToRects(['E'], 13, 10)}</g>`,
  ].join('');

  const MOUTH_SVG = [
    // deadpan: flat unamused mouth
    `<g class="expr-layer expr-deadpan">${gridToRects(['EEEE'], 3, 16)}</g>`,
    // brilliant_shock: jaw-dropped open O mouth
    `<g class="expr-layer expr-brilliant_shock">${gridToRects([
      'EEEEE',
      'ECCCE',
      'ECCCE',
      '.EEE.',
    ], 3, 15)}</g>`,
    // flabbergasted: agape shouting mouth
    `<g class="expr-layer expr-flabbergasted">${gridToRects([
      'EEEEE',
      'EWWWE',
      'ECCCE',
      'EEEEE',
    ], 3, 15)}</g>`,
    // manic_meltdown: Lloyd Frontera maniacal wide toothy grin!
    `<g class="expr-layer expr-manic_meltdown">${gridToRects([
      'EEEEEEEE.',
      'EWEWEWEWE',
      'EWEWEWEWE',
      '.EEEEEEE.',
    ], 2, 15)}</g>`,
    // depressed: slumped defeated frown
    `<g class="expr-layer expr-depressed">${gridToRects([
      '.EEE',
      'E...',
    ], 3, 16)}</g>`,
  ].join('');

  const SWEAT_TEAR_SVG = [
    // brilliant_shock: single pixel sweat drop
    `<g class="expr-layer expr-brilliant_shock">${gridToRects([
      '.E.',
      'EBE',
      '.E.',
    ], 17, 9)}</g>`,
    // flabbergasted: sweat drop
    `<g class="expr-layer expr-flabbergasted">${gridToRects([
      '.E.',
      'EBE',
      'EBE',
      '.E.',
    ], 17, 9)}</g>`,
    // manic_meltdown: multiple flying sweat drops
    `<g class="expr-layer expr-manic_meltdown">${gridToRects([
      '.E....',
      'EBE..E',
      '.E..EB',
      '.....E',
    ], 17, 7)}</g>`,
    // depressed: single light-blue/ivory sliding pixel tear
    `<g class="expr-layer expr-depressed tear-drop">${gridToRects([
      'B',
      'B',
    ], 12, 12)}</g>`,
  ].join('');

  function buildKnightSvg() {
    return `
      <svg class="knight-pixel-svg" viewBox="0 0 32 32" width="128" height="128" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g id="knight-head">${HEAD_NECK_BASE}</g>
        <g id="knight-ears">
          <g class="ears-normal">${EARS_NORMAL}</g>
          <g class="ears-depressed">${EARS_DEPRESSED}</g>
        </g>
        <g id="knight-brows">${BROWS_SVG}</g>
        <g id="knight-eyes">${EYES_SVG}</g>
        <g id="knight-pupils">${PUPILS_SVG}</g>
        <g id="knight-mouth">${MOUTH_SVG}</g>
        <g id="knight-sweat-tear">${SWEAT_TEAR_SVG}</g>
      </svg>`;
  }

  // ── Sarcastic GothamChess-Style Commentary Bank ────────────
  const MOOD_HEADERS = {
    deadpan: 'KNIGHT · UNIMPRESSED',
    brilliant_shock: 'KNIGHT · WAIT WHAT?!',
    flabbergasted: 'KNIGHT · MY EYES!!',
    manic_meltdown: 'KNIGHT · LOSING IT',
    depressed: 'KNIGHT · GIVEN UP',
  };

  const COMMENTARY_BANK = {
    opening: [
      'Theory? Sure, let\'s pretend you meant to play {moveSan}.',
      'Ah yes, {moveSan}. Truly a scholar of the first three moves.',
      'Book move {moveSan}. Enjoy it while your memory lasts.',
    ],
    routine: [
      'Cool. You played {moveSan}. Want a trophy?',
      'I\'ve seen paint dry with more tactical ambition than {moveSan}.',
      '{moveSan}. Technically legal. Moving on.',
      'Solid? Sure. Exciting? I almost fell off my pedestal.',
    ],
    brilliant_shock: [
      'WAIT A SECOND—DID YOU ACTUALLY CALCULATE {moveSan}?! Who are you and what did you do with the real player?!',
      'HOLD EVERYTHING!! {moveSan}?! A sound sacrifice?! Check the closet for Stockfish!',
    ],
    flabbergasted: [
      'AND HE SACRIFICES... HIS ENTIRE ELO!! {bestMoveSan} was screaming at you!',
      'The eval bar just did a backflip. I cannot watch this. ({bestMoveSan} was right there!)',
      'Bro played {moveSan} when {bestMoveSan} was literally glowing on the board.',
    ],
    manic_meltdown: [
      'HAHAHA NOBODY WANTS TO WIN THIS GAME!! You blunder, they blunder back—PURE CINEMA!!',
      'THREE IN A ROW?! THIS ISN\'T CHESS, THIS IS A COMEDY SPECIAL!! {bestMoveSan} IS CRYING IN THE CORNER!!',
    ],
    depressed: [
      'I\'m done. Wake me up when someone finds a legal move that doesn\'t hang a piece...',
      'Four+ blunders. The colour has literally drained from my soul. Play {bestMoveSan} or don\'t. Whatever.',
      'I used to dream of grandmaster games. Now I just stare at {moveSan} in greyscale.',
    ],
    idle: [
      'Load a game. Show me how fast you can ruin a perfectly good position.',
      'Sitting here waiting for a blunder. Take your time.',
    ],
  };

  function pickLine(bucket, ctx) {
    const list = COMMENTARY_BANK[bucket] || COMMENTARY_BANK.routine;
    const seed = (ctx?.ply || 0) + (ctx?.totalBlunders || 0);
    const tpl = list[seed % list.length];
    return tpl
      .replace(/\{moveSan\}/g, ctx?.moveSan || 'that move')
      .replace(/\{bestMoveSan\}/g, ctx?.bestMoveSan || 'the best move');
  }

  // ── 4ms Mechanical Key-Tick Synthesizer (Typewriter Sync) ──
  class TypewriterAudio {
    constructor() {
      this.muted = false;
      this._ctx = null;
    }

    _getCtx() {
      if (!this._ctx) {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (Ctx) this._ctx = new Ctx();
      }
      if (this._ctx && this._ctx.state === 'suspended') {
        this._ctx.resume();
      }
      return this._ctx;
    }

    tick() {
      if (this.muted) return;
      // Respect global SND toggle if present
      const globalSndOn = global.BlunderlessCoachContext?.soundEnabled !== false;
      if (!globalSndOn) return;

      const ctx = this._getCtx();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2200 + (Math.random() * 140 - 70), now);

      gain.gain.setValueAtTime(0.032, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.004);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.005);
    }
  }

  const twAudio = new TypewriterAudio();

  // ── State Machine, Typewriter & Micro-Animations ───────────
  let _currentState = 'deadpan';
  let _typeTimer = null;
  let _blinkTimer = null;
  let _lastContextKey = '';

  function determineKnightState(ctx) {
    if (!ctx || !ctx.ply) return 'deadpan';

    const clf = (ctx.classification || '').toLowerCase();
    const total = ctx.totalBlunders || 0;
    const streak = ctx.blunderStreak || 0;
    const recent = ctx.recentBlunders || 0;

    // 1. Brilliant (!!) triggers genuine shock (unless already in 4+ total collapse? Prompt:
    //    "refuses to hype anything until a new game is loaded or you step back before the collapse")
    if (total >= 4) return 'depressed';
    if (clf === 'brilliant') return 'brilliant_shock';
    if (streak >= 3 || recent >= 3) return 'manic_meltdown';
    if (clf === 'blunder' || clf === 'miss' || ctx.evalFlip) return 'flabbergasted';
    return 'deadpan';
  }

  function applyStateTransition(newState) {
    const stage = document.getElementById('knight-coach-stage');
    const mascotBtn = document.getElementById('knight-mascot-btn');
    const moodLabel = document.getElementById('knight-mood-label');
    if (!stage || !mascotBtn) return;

    const prevState = _currentState;
    _currentState = newState;
    stage.dataset.state = newState;
    if (moodLabel) {
      moodLabel.textContent = MOOD_HEADERS[newState] || MOOD_HEADERS.deadpan;
    }

    // Clear prior transition classes
    mascotBtn.classList.remove(
      'knight-anim-pop',
      'knight-anim-shake',
      'knight-anim-slump',
      'knight-anim-snap',
      'knight-eyeroll'
    );
    // Force reflow so repeat triggers re-play animation cleanly
    void mascotBtn.offsetWidth;

    if (newState === 'brilliant_shock') {
      mascotBtn.classList.add('knight-anim-pop');
      setTimeout(() => mascotBtn.classList.remove('knight-anim-pop'), 300);
    } else if (newState === 'flabbergasted' || newState === 'manic_meltdown') {
      mascotBtn.classList.add('knight-anim-shake');
      setTimeout(() => mascotBtn.classList.remove('knight-anim-shake'), 420);
    } else if (newState === 'depressed') {
      mascotBtn.classList.add('knight-anim-slump');
    } else if (newState === 'deadpan' && prevState !== 'deadpan') {
      mascotBtn.classList.add('knight-anim-snap', 'knight-eyeroll');
      setTimeout(() => {
        mascotBtn.classList.remove('knight-anim-snap', 'knight-eyeroll');
      }, 450);
    }
  }

  function updatePupilTracking(destGrid) {
    const pupils = document.getElementById('knight-pupils');
    if (!pupils) return;

    if (!destGrid || _currentState === 'depressed') {
      pupils.style.transform = 'translate(0px, 0px)';
      return;
    }

    // Shift +-1px horizontally/vertically toward the destination square on the 8x8 grid
    const dx = destGrid.col <= 2 ? -1 : destGrid.col >= 5 ? 1 : 0;
    const dy = destGrid.row <= 2 ? -1 : destGrid.row >= 5 ? 1 : 0;
    pupils.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function scheduleRandomBlink() {
    clearTimeout(_blinkTimer);
    const delay = 3000 + Math.random() * 2000; // every 3-5 seconds
    _blinkTimer = setTimeout(() => {
      const stage = document.getElementById('knight-coach-stage');
      if (stage && _currentState === 'deadpan') {
        stage.classList.add('knight-blinking');
        setTimeout(() => stage.classList.remove('knight-blinking'), 100);
      }
      scheduleRandomBlink();
    }, delay);
  }

  function typeMessage(fullText) {
    clearTimeout(_typeTimer);
    const typedEl = document.getElementById('knight-typed');
    if (!typedEl) return;

    typedEl.textContent = '';
    const text = String(fullText || '');
    let idx = 0;

    const step = () => {
      if (idx >= text.length) return;
      const ch = text[idx];
      typedEl.textContent += ch;
      idx++;

      if (idx % 3 === 0 && ch !== ' ') {
        twAudio.tick();
      }

      const isPausePunct = ch === '.' || ch === ',' || ch === '?' || ch === '!';
      _typeTimer = setTimeout(step, isPausePunct ? 170 : 20);
    };

    step();
  }

  function pickCommentaryForState(knightState, ctx) {
    if (!ctx || !ctx.moveSan) return pickLine('idle', ctx);
    if (knightState === 'depressed') return pickLine('depressed', ctx);
    if (knightState === 'manic_meltdown') return pickLine('manic_meltdown', ctx);
    if (knightState === 'brilliant_shock') return pickLine('brilliant_shock', ctx);
    if (knightState === 'flabbergasted') return pickLine('flabbergasted', ctx);

    const clf = (ctx.classification || '').toLowerCase();
    if (clf === 'book') return pickLine('opening', ctx);
    return pickLine('routine', ctx);
  }

  async function requestDetailedExplanation(ctx) {
    if (!ctx || !ctx.fen) return;

    let fenBefore = ctx.fen;
    if (ctx.ply > 0 && typeof global.buildGameAtPly === 'function') {
      fenBefore = global.buildGameAtPly(ctx.ply - 1).fen();
    }

    typeMessage('Checking Stockfish...');

    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fen_before: fenBefore,
          played_uci: ctx.playedMoveUci,
          played_san: ctx.moveSan,
          classification: ctx.classification,
          eval_after: ctx.evalAfter || null,
          eval_change: ctx.evalChange || 0,
          best_move: ctx.bestMoveUci,
          best_move_san: ctx.bestMoveSan,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      typeMessage(data.text || pickCommentaryForState(_currentState, ctx));
    } catch (_) {
      typeMessage(pickCommentaryForState(_currentState, ctx));
    }
  }

  function handlePositionAnalyzed(ctx) {
    if (!ctx) return;
    const key = `${ctx.fen}|${ctx.ply}|${ctx.playedMoveUci || ''}`;
    const newState = determineKnightState(ctx);

    applyStateTransition(newState);
    updatePupilTracking(ctx.destGrid);

    if (key !== _lastContextKey) {
      _lastContextKey = key;
      typeMessage(pickCommentaryForState(newState, ctx));
    }
  }

  function initKnightCoach() {
    const mascotBtn = document.getElementById('knight-mascot-btn');
    const voiceBtn = document.getElementById('btn-coach-voice');
    const explainBtn = document.getElementById('btn-coach-explain');
    if (!mascotBtn) return;

    mascotBtn.innerHTML = buildKnightSvg();
    applyStateTransition('deadpan');
    typeMessage(pickLine('idle', null));
    scheduleRandomBlink();

    mascotBtn.addEventListener('click', () => {
      const ctx = global.BlunderlessCoachContext;
      if (ctx && ctx.moveSan) {
        requestDetailedExplanation(ctx);
      } else {
        applyStateTransition('deadpan');
        typeMessage(pickLine('idle', { ply: Math.floor(Math.random() * 10) }));
      }
    });

    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => {
        twAudio.muted = !twAudio.muted;
        voiceBtn.classList.toggle('muted', twAudio.muted);
        voiceBtn.textContent = twAudio.muted ? '[UNMUTE]' : '[MUTE]';
      });
    }

    if (explainBtn) {
      explainBtn.addEventListener('click', () => {
        const ctx = global.BlunderlessCoachContext;
        if (ctx) requestDetailedExplanation(ctx);
      });
    }

    global.addEventListener('blunderless:position-analyzed', (e) => {
      handlePositionAnalyzed(e.detail);
    });
  }

  document.addEventListener('DOMContentLoaded', initKnightCoach);
})(window);
