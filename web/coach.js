/* ============================================================
   Blunderless — coach.js
   Floating Geometric Bauhaus Pixel-Art Knight Mascot (v2)
   - 32x32 crispEdges <rect>-only SVG (zero curves/gradients/AA)
   - Palette: #22150E (espresso), #FAF6F0 (ivory), #A67B5B (tan),
              #C86D3B (terracotta)
   - 9 Distinct Animated Expressions:
       deadpan, smug, suspicious, annoyed, checkmate_hype,
       brilliant_shock, flabbergasted, manic_meltdown, depressed
   - Clamped horizontal pupil tracking (never drops into eyelid)
   - Typewriter reveal (20ms/char, 170ms punctuation pause) +
     4ms mechanical key-tick + expanded GothamChess-style bank
   ============================================================ */

(function (global) {
  'use strict';

  const PAL = {
    E: '#22150E', // Deep Roasted Espresso (outlines & deep shadows)
    I: '#FAF6F0', // Warm Parchment Ivory (main planar face & highlights)
    T: '#A67B5B', // Warm Tan (neck, mane & snout shading)
    C: '#C86D3B', // Terracotta (stepped pedestal base & collar)
    W: '#FFFFFF', // Bright pixel teeth / sclera glint
    B: '#A6C8DC', // Light-blue ivory pixel tear / sweat
    G: '#2E6F40', // Muted Forest Sage sparkle
  };

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
    '........EEEEEEEEEEEEEEE.........', // y=22
    '.......ECCIICCCCCCEEEEE.........', // y=23
    '........EEEEEEEEEEEEEEE.........', // y=24
    '.......ECCIICCCCCCCEEEEE........', // y=25
    '......ECCIIICCCCCCCEEEEEE.......', // y=26
    '......EEEEEEEEEEEEEEEEEEE.......', // y=27
    '.....ECCIIICCCCCCCCCEEEEEE......', // y=28
    '.....ECCIIICCCCCCCCCEEEEEE......', // y=29
    '.....EEEEEEEEEEEEEEEEEEEEE......', // y=30
  ], 0, 4);

  // ── Modular Expression Layers (9 Distinct Expressions) ─────
  const BROWS_SVG = [
    // deadpan: flat unimpressed heavy brow
    `<g class="expr-layer expr-deadpan">${gridToRects(['EEEEEEE'], 10, 9)}</g>`,
    // smug: cocky raised arch brow (matches ref top-right!)
    `<g class="expr-layer expr-smug">${gridToRects(['..EEEE.', 'EE....E'], 10, 8)}</g>`,
    // suspicious: flat low skeptical brow
    `<g class="expr-layer expr-suspicious">${gridToRects(['EEEEEE.', '.....EE'], 10, 9)}</g>`,
    // annoyed: sharp angry downward V-brow (matches ref bottom-middle!)
    `<g class="expr-layer expr-annoyed">${gridToRects(['E......', '.EEE...', '...EEEE'], 10, 8)}</g>`,
    // checkmate_hype: thrilled arched brows
    `<g class="expr-layer expr-checkmate_hype">${gridToRects(['.EEEEE.', 'E.....E'], 10, 7)}</g>`,
    // brilliant_shock: high startled brow
    `<g class="expr-layer expr-brilliant_shock">${gridToRects(['.EEEEE.', 'E.....E'], 10, 7)}</g>`,
    // flabbergasted: sharply furrowed V brow
    `<g class="expr-layer expr-flabbergasted">${gridToRects(['EE...EE', '..EEE..'], 10, 8)}</g>`,
    // manic_meltdown: wild unhinged brows
    `<g class="expr-layer expr-manic_meltdown">${gridToRects(['.EE.EE.', 'E..E..E'], 10, 7)}</g>`,
    // depressed: heavy drooping slanted brow
    `<g class="expr-layer expr-depressed">${gridToRects(['EE.....', '..EEEEE'], 10, 9)}</g>`,
  ].join('');

  const EYES_SVG = [
    // deadpan: half-lidded flat side-eye (white interior x=12..14, y=10)
    `<g class="expr-layer expr-deadpan">${gridToRects([
      'EWWWE',
      'EEEEE',
      '.TTT.',
    ], 11, 10)}</g>`,
    // smug: cool half-lidded confident eye
    `<g class="expr-layer expr-smug">${gridToRects([
      'EWWWE',
      'EEEEE',
    ], 11, 10)}</g>`,
    // suspicious: razor-thin squinting slit
    `<g class="expr-layer expr-suspicious">${gridToRects([
      'EEEEE',
      'EWWWE',
      'EEEEE',
    ], 11, 10)}</g>`,
    // annoyed: narrowed angry glare
    `<g class="expr-layer expr-annoyed">${gridToRects([
      'EWWWE',
      'EEEEE',
      '.TTT.',
    ], 11, 10)}</g>`,
    // checkmate_hype: huge shining hyped eye
    `<g class="expr-layer expr-checkmate_hype">${gridToRects([
      '.EEE.',
      'EWWWE',
      'EWWWE',
      '.EEE.',
    ], 11, 9)}</g>`,
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
    // Centered at x=13, y=10 so horizontal dx in {-1, 0, +1} stays strictly inside x=12..14!
    `<g class="expr-layer expr-deadpan">${gridToRects(['E'], 13, 10)}</g>`,
    `<g class="expr-layer expr-smug">${gridToRects(['E'], 12, 10)}</g>`,
    `<g class="expr-layer expr-suspicious">${gridToRects(['E'], 12, 11)}</g>`,
    `<g class="expr-layer expr-annoyed">${gridToRects(['E'], 12, 10)}</g>`,
    `<g class="expr-layer expr-checkmate_hype">${gridToRects(['EW', 'EE'], 12, 10)}</g>`,
    `<g class="expr-layer expr-brilliant_shock">${gridToRects(['E'], 13, 10)}</g>`,
    `<g class="expr-layer expr-flabbergasted">${gridToRects(['EE'], 12, 10)}</g>`,
    `<g class="expr-layer expr-manic_meltdown">${gridToRects(['E'], 13, 10)}</g>`,
  ].join('');

  const MOUTH_SVG = [
    // deadpan: flat unamused mouth
    `<g class="expr-layer expr-deadpan">${gridToRects(['EEEE'], 3, 16)}</g>`,
    // smug: sly cocky upturned smirk
    `<g class="expr-layer expr-smug">${gridToRects([
      '....EE',
      'EEEE..',
    ], 3, 15)}</g>`,
    // suspicious: tiny sceptical straight line
    `<g class="expr-layer expr-suspicious">${gridToRects(['EEE'], 4, 16)}</g>`,
    // annoyed: tight angry grimace
    `<g class="expr-layer expr-annoyed">${gridToRects([
      '.EEE.',
      'E...E',
    ], 3, 15)}</g>`,
    // checkmate_hype: huge triumphant grin
    `<g class="expr-layer expr-checkmate_hype">${gridToRects([
      'EEEEEE',
      'EWWWWE',
      '.EEEE.',
    ], 3, 15)}</g>`,
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
    // checkmate_hype: crisp pixel sparkles!
    `<g class="expr-layer expr-checkmate_hype">${gridToRects([
      '.C....',
      'CGC..C',
      '.C....',
    ], 18, 4)}</g>`,
    // annoyed: tiny comic vein/tick mark
    `<g class="expr-layer expr-annoyed">${gridToRects([
      'C.C',
      '.E.',
      'C.C',
    ], 17, 7)}</g>`,
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

  // ── Expanded Sarcastic GothamChess-Style Commentary Bank (4x Lines!) ──
  const MOOD_HEADERS = {
    deadpan: 'KNIGHT · UNIMPRESSED',
    smug: 'KNIGHT · NOT BAD, KID',
    suspicious: 'KNIGHT · HMMM...',
    annoyed: 'KNIGHT · REALLY?!',
    checkmate_hype: 'KNIGHT · GOODNIGHT!!',
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
      '{moveSan}—watched one 8-minute YouTube opening trap video, didn\'t you?',
      'Opening book approves {moveSan}. Now let\'s see what happens the second theory ends.',
      'Textbook {moveSan}. Congratulations on remembering move {moveNum}.',
      '{moveSan} is theory. Don\'t worry, the chaos starts in about 90 seconds.',
      'Standard stuff with {moveSan}. My grandma plays this in her sleep.',
      'Ah, {moveSan}. A connoisseur of clicking the green arrows from a course.',
      'Book move {moveSan}. Let\'s enjoy the last peaceful moment of this game.',
    ],
    routine: [
      'Cool. You played {moveSan}. Want a trophy?',
      'I\'ve seen paint dry with more tactical ambition than {moveSan}.',
      '{moveSan}. Technically legal. Moving on.',
      'Solid? Sure. Exciting? I almost fell off my pedestal.',
      'You moved a piece to a square ({moveSan}). Revolutionary.',
      '{moveSan} keeps the position alive. Barely keeps me awake, though.',
      'A respectable, completely forgettable {moveSan}.',
      'Okay, {moveSan} works. Still not hanging anything yet, which is progress.',
      'Fine, {moveSan}. Not spicy, not tragic. Just pure lukewarm espresso.',
      'Alright, {moveSan}. Keep doing sensible things and I\'ll run out of roasts.',
      '{moveSan}—the chess equivalent of ordering plain toast.',
      'Decent move ({moveSan}). The eval bar barely even blinked.',
    ],
    smug: [
      'Okay, okay—{moveSan} actually had some sauce on it. Respect.',
      'Look at you finding {moveSan}. Maybe that rating is real after all.',
      'Clean find with {moveSan}! Did someone finally drink their coffee today?',
      '{moveSan}?! Smooth. Even Stockfish nodded slightly.',
      'Now THAT is chess. {moveSan} puts serious pressure on the board.',
      'Alright, I\'ll admit it—{moveSan} was crisp. Don\'t let it go to your head.',
      '{moveSan} is the exact kind of move that makes opponents stare at the ceiling.',
      'Surgical {moveSan}. You actually calculated past one move—proud of you.',
      'Spicy {moveSan}! Keep cooking like this and I might start taking notes.',
      'Great find ({moveSan})! The eval bar approves, and honestly, so do I.',
    ],
    suspicious: [
      '{moveSan}? Wait... did you actually see the follow-up or was that a mouse slip?',
      'Hmm. {moveSan} is suspiciously accurate. Blink twice if Stockfish is under the desk.',
      'Okay, {moveSan} is really strong. Pure skill or pure vibes?',
      'Interesting choice—{moveSan} works, though I\'m watching you closely.',
      '{moveSan} is top-tier precision. Are we sure this is the same account?',
      'Very sharp with {moveSan}. Let\'s see if you actually know *why* it works.',
      'Squinting real hard at {moveSan}... yeah alright, it\'s actually good.',
      'Whoa, {moveSan} is engine-level clean. Don\'t ruin it on the very next turn.',
    ],
    annoyed: [
      'Ugh. {moveSan}? You literally had {bestMoveSan} sitting right there.',
      'Why {moveSan}?! {bestMoveSan} was begging to be played!',
      'Not a full disaster, just deeply irritating. {bestMoveSan} was so much cleaner.',
      '{moveSan} gives away free momentum. Please look at {bestMoveSan} next time.',
      'My eyebrows are permanently fused together after {moveSan}. Try {bestMoveSan}.',
      'You had a nice position and then chose {moveSan}. Classic.',
      'Sigh. {moveSan} lets them right back into the game—{bestMoveSan} kept the squeeze.',
      'Do you enjoy making your own life harder? Because {moveSan} does exactly that.',
      'Tiny slip with {moveSan}, big headache later. {bestMoveSan} was effortless.',
      'Look, {moveSan} isn\'t fatal, it\'s just the chess version of stepping on a Lego.',
      '{moveSan}?! Come on, we both know {bestMoveSan} was better.',
    ],
    checkmate_hype: [
      'BOOM!! {moveSan}—CHECKMATE!! Pack the pieces, turn off the lights, GOODNIGHT!!',
      '{moveSan}!! THAT\'S CHECKMATE!! Put that game straight in the museum!!',
      'LIGHTS OUT WITH {moveSan}!! Absolute dagger to the king!!',
      'CHECKMATE ({moveSan})!! Nothing left to calculate—take a bow!!',
      'AND THAT\'S ALL SHE WROTE!! {moveSan} ends the show in style!!',
    ],
    brilliant_shock: [
      'WAIT A SECOND—DID YOU ACTUALLY CALCULATE {moveSan}?! Who are you and what did you do with the real player?!',
      'HOLD EVERYTHING!! {moveSan}?! A sound sacrifice?! Check the closet for Stockfish!',
      'MY JAW JUST HIT THE PEDESTAL!! {moveSan} IS BRILLIANT!!',
      'STOP THE CLOCKS!! {moveSan}?! Did Magnus Carlsen just grab your mouse?!',
      'NO WAY YOU JUST FOUND {moveSan}!! That deserves two exclamation marks and a parade!!',
      'WHAT DID I JUST WITNESS?! {moveSan}!! Sound sacrifice!! Frame this position immediately!!',
      'EXCUSE ME?! {moveSan}?! I take back every sarcastic thing I\'ve ever said about you!!',
      'A REAL BRILLIANT MOVE ({moveSan})?! I need a minute to process this!!',
    ],
    flabbergasted: [
      'AND HE SACRIFICES... HIS ENTIRE ELO!! {bestMoveSan} was screaming at you!',
      'The eval bar just did a backflip. I cannot watch this. ({bestMoveSan} was right there!)',
      'Bro played {moveSan} when {bestMoveSan} was literally glowing on the board.',
      'WHOA THERE!! {moveSan} just threw the whole advantage out the window! {bestMoveSan}!',
      'Wait—you looked at the entire board and picked {moveSan}?! {bestMoveSan} is crying!',
      'That sound you just heard was the eval bar falling down a flight of stairs after {moveSan}.',
      'Danger levels! {moveSan} hands over the game on a silver platter. {bestMoveSan} held everything!',
      'I blinked for ONE second and {moveSan} blew up the position. Play {bestMoveSan}!',
      'Did your cat walk across the mouse for {moveSan}?! Please tell me it was the cat!',
      'Oh no, oh no, oh no—{moveSan}!! {bestMoveSan} was right in front of your face!',
      'Not the {moveSan} special!! You worked all game for this advantage and donated it!',
      'Hello? Police? I\'d like to report a crime on move {moveNum}: {moveSan} instead of {bestMoveSan}.',
    ],
    manic_meltdown: [
      'HAHAHA NOBODY WANTS TO WIN THIS GAME!! You blunder, they blunder back—PURE CINEMA!!',
      'THREE IN A ROW?! THIS ISN\'T CHESS, THIS IS A COMEDY SPECIAL!! {bestMoveSan} IS CRYING IN THE CORNER!!',
      'EVAL BAR PING-PONG!! LEFT! RIGHT! LEFT! RIGHT! NEITHER OF YOU WANTS THE POINT!!',
      'HAHAHAHA {moveSan}?! ARE YOU TWO PLAYING ANTI-CHESS?! WHOEVER LOSES FIRST WINS?!',
      'THIS GAME BELONGS ON GUESS THE ELO!! {moveSan} AFTER THAT?! ABSOLUTE CHAOS!!',
      'MY PIXELS ARE VIBRATING!! THREE BLUNDERS BACK TO BACK!! STOCKFISH JUST FILED FOR RETIREMENT!!',
      'KEEP GOING!! DON\'T STOP NOW!! {bestMoveSan} IS FOR COWARDS, PLAY MORE CHAOS!!',
      'I HAVE LOST ALL SANITY!! {moveSan}!! BOTH PLAYERS REFUSING TO ACCEPT FREE PIECES!!',
    ],
    depressed: [
      'I\'m done. Wake me up when someone finds a legal move that doesn\'t hang a piece...',
      'Four+ blunders. The colour has literally drained from my soul. Play {bestMoveSan} or don\'t. Whatever.',
      'I used to dream of grandmaster games. Now I just stare at {moveSan} in greyscale.',
      'My therapist told me not to watch games like this anymore. Yet here I am, staring at {moveSan}.',
      'Four blunders deep. Even my terracotta pedestal lost the will to shine.',
      'Sure. {moveSan}. Why not. Nothing matters anymore anyway.',
      'I\'m just a 32x32 pixel horse watching two people play hot potato with a winning position...',
      'Please... just click {bestMoveSan} once... for me... I\'m begging you...',
      'Every time {moveSan} appears on the board, another pixel fades to grey.',
      'No thoughts. Only pain. And {bestMoveSan} sitting unplayed on the board.',
    ],
    idle: [
      'Load a game. Show me how fast you can ruin a perfectly good position.',
      'Sitting here waiting for a blunder. Take your time.',
      'Paste a PGN or click Sample Game. I promise to judge every single move.',
      'Fresh board. Zero blunders so far—let\'s see how long that streak lasts.',
      'Go ahead, fetch your Chess.com games. I\'ve got my sarcasm warmed up.',
      'Ready when you are. Try not to hang your Queen before move 10.',
    ],
  };

  // Non-repeating random-ish picker per bucket so lines never repeat back-to-back
  const _lastPickedIndex = {};
  function pickLine(bucket, ctx) {
    const list = COMMENTARY_BANK[bucket] || COMMENTARY_BANK.routine;
    let idx = Math.floor(Math.random() * list.length);
    if (list.length > 1 && _lastPickedIndex[bucket] === idx) {
      idx = (idx + 1) % list.length;
    }
    _lastPickedIndex[bucket] = idx;

    const moveNum = ctx?.ply ? Math.ceil(ctx.ply / 2) : 1;
    return list[idx]
      .replace(/\{moveSan\}/g, ctx?.moveSan || 'that move')
      .replace(/\{bestMoveSan\}/g, ctx?.bestMoveSan || 'the best move')
      .replace(/\{moveNum\}/g, String(moveNum));
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

  // ── 9-State Expression Escalation Machine & Micro-Animations ──
  let _currentState = 'deadpan';
  let _typeTimer = null;
  let _blinkTimer = null;
  let _lastContextKey = '';

  function determineKnightState(ctx) {
    if (!ctx || !ctx.ply) return 'deadpan';

    const clf = (ctx.classification || '').toLowerCase();
    const san = ctx.moveSan || '';
    const total = ctx.totalBlunders || 0;
    const streak = ctx.blunderStreak || 0;
    const recent = ctx.recentBlunders || 0;

    // 4+ blunders -> complete greyed-out despair (refuses to hype anything!)
    if (total >= 4) return 'depressed';
    // Checkmate hype!
    if (san.includes('#')) return 'checkmate_hype';
    // Brilliant (!!) -> genuine jaw-drop shock
    if (clf === 'brilliant') return 'brilliant_shock';
    // 3 consecutive or mutual chaos -> Lloyd Frontera manic meltdown
    if (streak >= 3 || recent >= 3) return 'manic_meltdown';
    // 1st-2nd blunder / miss / big eval flip -> flabbergasted
    if (clf === 'blunder' || clf === 'miss' || ctx.evalFlip) return 'flabbergasted';
    // Mistake or inaccuracy -> annoyed glare
    if (clf === 'mistake' || clf === 'inaccuracy') return 'annoyed';
    // Great move -> smug respect
    if (clf === 'great') return 'smug';
    // Excellent / Book -> suspicious squint (alternating with deadpan for variety)
    if (clf === 'excellent' || clf === 'book') {
      return (ctx.ply % 2 === 0) ? 'suspicious' : 'deadpan';
    }
    // Best move in a non-trivial position -> occasional smug nod
    if (clf === 'best' && ctx.ply >= 8 && ctx.ply % 3 === 0) return 'smug';

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

    mascotBtn.classList.remove(
      'knight-anim-pop',
      'knight-anim-shake',
      'knight-anim-slump',
      'knight-anim-snap',
      'knight-anim-nod',
      'knight-anim-glare',
      'knight-eyeroll'
    );
    void mascotBtn.offsetWidth;

    if (newState === 'brilliant_shock' || newState === 'checkmate_hype') {
      mascotBtn.classList.add('knight-anim-pop');
      setTimeout(() => mascotBtn.classList.remove('knight-anim-pop'), 300);
    } else if (newState === 'flabbergasted' || newState === 'manic_meltdown') {
      mascotBtn.classList.add('knight-anim-shake');
      setTimeout(() => mascotBtn.classList.remove('knight-anim-shake'), 420);
    } else if (newState === 'depressed') {
      mascotBtn.classList.add('knight-anim-slump');
    } else if (newState === 'smug') {
      mascotBtn.classList.add('knight-anim-nod');
      setTimeout(() => mascotBtn.classList.remove('knight-anim-nod'), 360);
    } else if (newState === 'annoyed') {
      mascotBtn.classList.add('knight-anim-glare');
      setTimeout(() => mascotBtn.classList.remove('knight-anim-glare'), 300);
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

    // Clamp strictly horizontally (-1, 0, +1) on 1px-tall eyes (deadpan/smug/suspicious/annoyed)
    // so the pupil NEVER drops down into the bottom eyelid!
    const dx = destGrid.col <= 2 ? -1 : destGrid.col >= 5 ? 1 : 0;
    const isTallEye =
      _currentState === 'brilliant_shock' ||
      _currentState === 'flabbergasted' ||
      _currentState === 'manic_meltdown';
    const dy = isTallEye ? (destGrid.row <= 2 ? -1 : 0) : 0;
    pupils.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function scheduleRandomBlink() {
    clearTimeout(_blinkTimer);
    const delay = 3000 + Math.random() * 2000;
    _blinkTimer = setTimeout(() => {
      const stage = document.getElementById('knight-coach-stage');
      if (stage && (_currentState === 'deadpan' || _currentState === 'smug' || _currentState === 'suspicious')) {
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
    if (knightState === 'checkmate_hype') return pickLine('checkmate_hype', ctx);
    if (knightState === 'manic_meltdown') return pickLine('manic_meltdown', ctx);
    if (knightState === 'brilliant_shock') return pickLine('brilliant_shock', ctx);
    if (knightState === 'flabbergasted') return pickLine('flabbergasted', ctx);
    if (knightState === 'annoyed') return pickLine('annoyed', ctx);
    if (knightState === 'smug') return pickLine('smug', ctx);
    if (knightState === 'suspicious') return pickLine('suspicious', ctx);

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
        typeMessage(pickLine('idle', null));
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
