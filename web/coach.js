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
    // opp_resigned: cocky triumphant victory arch brow
    `<g class="expr-layer expr-opp_resigned">${gridToRects(['..EEEE.', 'EE....E'], 10, 7)}</g>`,
    // user_resigned: sheepish upturned surrender brow
    `<g class="expr-layer expr-user_resigned">${gridToRects(['....EEE', 'EEEE...'], 10, 8)}</g>`,
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
    // opp_resigned: confident victorious eye
    `<g class="expr-layer expr-opp_resigned">${gridToRects([
      'EWWWE',
      'EEEEE',
    ], 11, 10)}</g>`,
    // user_resigned: sheepish wide apologetic eye
    `<g class="expr-layer expr-user_resigned">${gridToRects([
      '.EEE.',
      'EWWWE',
      'EWWWE',
      '.EEE.',
    ], 11, 9)}</g>`,
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
    `<g class="expr-layer expr-opp_resigned">${gridToRects(['E'], 12, 10)}</g>`,
    `<g class="expr-layer expr-user_resigned">${gridToRects(['E'], 14, 10)}</g>`,
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
    // opp_resigned: huge triumphant grin mocking the white flag!
    `<g class="expr-layer expr-opp_resigned">${gridToRects([
      'EEEEEE',
      'EWWWWE',
      '.EEEE.',
    ], 3, 15)}</g>`,
    // user_resigned: sheepish tiny surrender frown
    `<g class="expr-layer expr-user_resigned">${gridToRects([
      '.EEE.',
      'E...E',
    ], 3, 16)}</g>`,
  ].join('');

  // Crisp 32x32 pixel-art waving little white flag (mounted cleanly in open right space x=23..31)
  const WHITE_FLAG_PIXELS = gridToRects([
    '.EEEEEE..',
    'EWWWWWWE.',
    'EWWWWIIE.',
    'EWWWWWWE.',
    'EWWIIWWE.',
    '.EEEEEE..',
    '.ET......',
    '.ET......',
    '.ET......',
    '.ET......',
    '.ET......',
    '.ET......',
    '.ET......',
    '.ET......',
  ], 23, 5);

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
    // opp_resigned: waving pixel white flag + victory sparkle!
    `<g class="expr-layer expr-opp_resigned white-flag-wave">${WHITE_FLAG_PIXELS}${gridToRects([
      '.C.',
      'CGC',
      '.C.',
    ], 19, 2)}</g>`,
    // user_resigned: sheepish waving pixel white flag + tiny sweat drop
    `<g class="expr-layer expr-user_resigned white-flag-wave">${WHITE_FLAG_PIXELS}${gridToRects([
      '.E.',
      'EBE',
      '.E.',
    ], 18, 9)}</g>`,
  ].join('');

  function buildKnightSvg(size = 192, idPrefix = 'knight') {
    return `
      <svg class="knight-pixel-svg" viewBox="0 0 32 32" width="${size}" height="${size}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g id="${idPrefix}-head">${HEAD_NECK_BASE}</g>
        <g id="${idPrefix}-ears">
          <g class="ears-normal">${EARS_NORMAL}</g>
          <g class="ears-depressed">${EARS_DEPRESSED}</g>
        </g>
        <g id="${idPrefix}-brows">${BROWS_SVG}</g>
        <g id="${idPrefix}-eyes">${EYES_SVG}</g>
        <g id="${idPrefix}-pupils">${PUPILS_SVG}</g>
        <g id="${idPrefix}-mouth">${MOUTH_SVG}</g>
        <g id="${idPrefix}-sweat-tear">${SWEAT_TEAR_SVG}</g>
      </svg>`;
  }

  // ── Expanded Sarcastic GothamChess-Style Commentary Bank (4x Lines!) ──
  const MOOD_HEADERS = {
    deadpan: 'CHESTER · DEADPAN',
    smug: 'CHESTER · NOT BAD',
    suspicious: 'CHESTER · HMMM...',
    annoyed: 'CHESTER · REALLY?!',
    checkmate_hype: 'CHESTER · MATE!!',
    brilliant_shock: 'CHESTER · WHAT?!',
    flabbergasted: 'CHESTER · MY EYES',
    manic_meltdown: 'CHESTER · LOSING IT',
    depressed: 'CHESTER · GIVEN UP',
    opp_resigned: 'CHESTER · THEY RESIGNED!',
    user_resigned: 'CHESTER · WHITE FLAG',
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
    // Instructive tone (early game / calm learning mode for 600 Elo)
    instructive_opening: [
      'Nice start with {moveSan}. Controlling the center and developing pieces early is the golden rule.',
      'Good theory ({moveSan})! Next priority: get your knights and bishops out, then castle early.',
      '{moveSan} follows opening principles—fight for the center squares before launching side attacks.',
      'Clean opening move ({moveSan}). Remember: avoid moving the same piece twice unless there\'s a clear threat.',
      'Solid book move ({moveSan}). Keep your king safety in mind as the center opens up.',
    ],
    instructive_routine: [
      'Steady move ({moveSan}). Look for ways to activate your least-active piece next.',
      'Good discipline with {moveSan}—keeping your pieces defended prevents nasty tactics.',
      '{moveSan} keeps the position balanced. Always check for opponent checks and captures before moving.',
      'Practical play ({moveSan}). Try to connect your rooks and target weak pawns.',
      'Nice, calm {moveSan}. When nothing is hanging, improve your worst piece.',
    ],
    instructive_mistake: [
      'Careful with {moveSan}—{bestMoveSan} kept your position safer. Click [EXPLAIN] to see the best reply!',
      '{moveSan} slips a bit here. Look closely at {bestMoveSan} to see how it fights for control.',
      'Small hiccup on {moveSan}. Press [EXPLAIN] and I\'ll play out {bestMoveSan} on the board for you.',
    ],
    // Analytical tone (when the player's opening & middlegame are genuinely strong!)
    analytical_routine: [
      'Clean positional play with {moveSan}. Structure stays intact and your pieces stay coordinated.',
      'Very composed ({moveSan}). You\'re maintaining the initiative without creating weaknesses.',
      'Accurate choice ({moveSan})—keeps the pressure steady while denying counterplay.',
      'Strong middlegame technique with {moveSan}. High-level discipline so far.',
      'Smart prophylaxis with {moveSan}. You\'re playing well above your rating bracket right now.',
    ],
    analytical_strong: [
      'Sharp calculation ({moveSan})! That directly improves piece activity and tightens your grip.',
      'Clinical move ({moveSan}). You spotted the key structural/tactical idea right away.',
      'Impressive accuracy with {moveSan}—this is how you convert an opening advantage.',
      'Textbook execution ({moveSan}). Keep playing this clean and I\'ll have nothing to roast.',
    ],
    comeback_brilliant: [
      'WAIT A SECOND—BACK FROM THE DEAD WITH {moveSan}?! I TAKE EVERYTHING BACK!! MY COLOUR JUST RETURNED!!',
      'HOLD EVERYTHING!! FOUR BLUNDERS EARLIER AND NOW YOU DROP A BRILLIANT {moveSan}?! PURE REDEMPTION ARC!!',
    ],
    comeback_recover: [
      'Wait... three clean moves in a row ({moveSan})? Okay, fine—I\'m coming out of greyscale. Don\'t blow it.',
      'Alright, colour restored. {moveSan} shows signs of life—keep this streak going!',
    ],
    // ── Opponent-Move Commentary (names {opponentName} directly!) ──
    opp_opening: [
      '{opponentName} replies with {moveSan}—still inside opening theory.',
      'Standard book move ({moveSan}) from {opponentName}. Keep developing cleanly!',
      '{opponentName} goes {moveSan}. Stick to the center and get your king castled.',
      '{opponentName} knows their opening lines ({moveSan}). Stay solid.',
    ],
    opp_routine: [
      '{opponentName} plays {moveSan}. Your turn—check their threats before moving!',
      '{opponentName} goes {moveSan}. Nothing scary yet; improve your least active piece.',
      '{opponentName} answers with {moveSan}. Eval barely budged—your move.',
      'Solid reply ({moveSan}) from {opponentName}. Look for active squares!',
      '{opponentName} chose {moveSan}. Keep your pieces coordinated and stay sharp.',
    ],
    opp_strong: [
      'Careful—{opponentName} found a sharp move with {moveSan}. Respect the threat!',
      'Clean move from {opponentName} ({moveSan}). Don\'t underestimate them here.',
      '{opponentName} is cooking with {moveSan}. Stay calm and find a solid defense!',
      'Ooh, {opponentName} spotted {moveSan}. Time to double-check all your loose pieces.',
    ],
    opp_brilliant: [
      'UH OH!! {opponentName} JUST DROPPED A BRILLIANT {moveSan}!! Stay calm and calculate!',
      'WAIT A SECOND—DID {opponentName} REALLY FIND {moveSan}?! That sacrifice is legit!!',
      'Whoa—{opponentName} pulled out a brilliant {moveSan}!! Time to put on your defender hat!',
    ],
    opp_mistake: [
      '{opponentName} slipped slightly with {moveSan}—they missed {bestMoveSan}. Look for ways to punish it!',
      'Hmm, {opponentName} played {moveSan} instead of {bestMoveSan}. There\'s an opening for you here!',
      '{opponentName} gave away some momentum with {moveSan}. Time to turn the screws!',
      'Small inaccuracy from {opponentName} ({moveSan}). Click [EXPLAIN] to see what they missed!',
    ],
    opp_miss: [
      'PHEW! {opponentName} let you off the hook with {moveSan}—they missed {bestMoveSan}!!',
      'Lucky break! {opponentName} could have crushed with {bestMoveSan}, but played {moveSan} instead!',
      '{opponentName} missed a big shot ({bestMoveSan}) and chose {moveSan}. Take that second life!',
    ],
    opp_blunder: [
      'WHOA!! {opponentName} JUST BLUNDERED WITH {moveSan}!! Punish them right now!!',
      'AND {opponentName} SACRIFICES... THEIR ENTIRE POSITION with {moveSan}!! ({bestMoveSan} held everything!)',
      'HOLD ON—{opponentName} played {moveSan}?! Free advantage on the board—don\'t miss the refutation!',
      'WAIT A SECOND! {opponentName} just threw the eval bar off a cliff with {moveSan}!!',
      '{opponentName} looked at the whole board and chose {moveSan}. Thank them politely and punish it!',
      'ALARM BELLS! {opponentName} slipped huge with {moveSan} instead of {bestMoveSan}—make them pay!',
    ],
    opp_checkmate_hype: [
      'OUCH!! {opponentName} delivered checkmate with {moveSan}... shake it off and check the turning point!',
      'Lights out—{opponentName} found mate with {moveSan}. Hit the eval graph to see where it swung.',
    ],
    opp_manic_meltdown: [
      'HAHAHA {opponentName} BLUNDERED RIGHT BACK WITH {moveSan}!! NOBODY WANTS TO WIN THIS GAME!!',
      'EVAL BAR PING-PONG!! {opponentName} drops {moveSan}—THREE BLUNDERS IN A ROW!! PURE CINEMA!!',
      'OH MY PIXELS!! {opponentName} refuses to accept a free win with {moveSan}!! GUESS THE ELO MATERIAL!!',
    ],
    opp_depressed: [
      '{opponentName} played {moveSan}... four+ blunders in this game. My pixels are turning to dust...',
      'Even {opponentName} is joining the chaos with {moveSan}. Wake me when someone plays {bestMoveSan}...',
      'Watching {opponentName} play {moveSan} in greyscale... neither side wants the full point...',
    ],
    // ── Resignation Commentary (White Flag!) ──
    opp_resigned: [
      'WHITE FLAG!! {opponentName} saw {moveSan}, closed the tab, and resigned!! Take the W!!',
      'AND {opponentName} WAVES THE WHITE FLAG!! After {moveSan} they had seen enough—GGs!!',
      '{opponentName} resigned right here! Nothing hits sweeter than making your opponent throw in the towel.',
      'PACK IT UP!! {opponentName} couldn\'t stomach another move after {moveSan}. Clean victory!',
      'Boom—{opponentName} hit resign! Raising this little white flag in honor of their departed ELO.',
      '{opponentName} threw up the white flag! No checkmate needed when the pressure does the talking.',
      'Resignation accepted! {opponentName} looked at the board after {moveSan} and chose peace.',
      'GGs! {opponentName} resigned—check the Review tab to see the exact move that broke their spirit!',
    ],
    user_resigned: [
      'Up goes the white flag... tough game against {opponentName}. Shake it off and check the turning point!',
      'Resigned here—smart to save your energy for the next one. Hit the Eval Graph to see where it slipped.',
      'Waving the little white flag with you on this one. Every loss is free coaching—check the Review tab!',
      'Okay, {opponentName} got this round. Tip the king, grab a fresh espresso, and review the key blunder.',
      'White flag raised! No shame in resigning a lost position—let\'s find the one move that swung it.',
      'Tough break against {opponentName}. Even grandmasters resign—what matters is spotting why it happened!',
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
    const oppName = ctx?.opponentName || 'Your opponent';
    const userName = ctx?.userName || 'You';
    const moverName = ctx?.moverName || (ctx?.isUserMove === false ? oppName : userName);

    return list[idx]
      .replace(/\{moveSan\}/g, ctx?.moveSan || 'that move')
      .replace(/\{bestMoveSan\}/g, ctx?.bestMoveSan || 'the best move')
      .replace(/\{moveNum\}/g, String(moveNum))
      .replace(/\{opponentName\}/g, oppName)
      .replace(/\{userName\}/g, userName)
      .replace(/\{moverName\}/g, moverName);
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
    const cleanStreak = ctx.cleanStreak || 0;

    // Heroic / game-ending overrides ALWAYS break out of greyscale despair!
    if (san.includes('#')) return 'checkmate_hype';
    if (ctx.opponentResigned) return 'opp_resigned';
    if (ctx.userResigned) return 'user_resigned';
    if (clf === 'brilliant') return 'brilliant_shock';
    if (clf === 'great') return 'smug';

    // 3 consecutive or mutual chaos -> Lloyd Frontera manic meltdown
    if (streak >= 3 || recent >= 3) return 'manic_meltdown';

    // 4+ cumulative blunders -> depressed ONLY while not recovered (3 clean moves snap Chester back!)
    if (total >= 4 && cleanStreak < 3 && (recent >= 1 || clf === 'blunder' || clf === 'miss' || clf === 'mistake')) {
      return 'depressed';
    }

    // 1st-2nd blunder / miss / big eval flip -> flabbergasted
    if (clf === 'blunder' || clf === 'miss' || ctx.evalFlip) return 'flabbergasted';
    // Mistake or inaccuracy -> annoyed glare
    if (clf === 'mistake' || clf === 'inaccuracy') return 'annoyed';
    // Excellent / Book -> suspicious squint (or analytical deadpan)
    if (clf === 'excellent' || clf === 'book') {
      return (ctx.tone === 'sarcastic' && ctx.ply % 2 === 0) ? 'suspicious' : 'deadpan';
    }
    // Best move in a clean/strong game -> smug nod
    if (clf === 'best' && (ctx.tone === 'analytical' || (ctx.ply >= 8 && ctx.ply % 3 === 0))) {
      return 'smug';
    }

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

    if (newState === 'brilliant_shock' || newState === 'checkmate_hype' || newState === 'opp_resigned') {
      mascotBtn.classList.add('knight-anim-pop');
      setTimeout(() => mascotBtn.classList.remove('knight-anim-pop'), 300);
    } else if (newState === 'flabbergasted' || newState === 'manic_meltdown') {
      mascotBtn.classList.add('knight-anim-shake');
      setTimeout(() => mascotBtn.classList.remove('knight-anim-shake'), 420);
    } else if (newState === 'depressed' || newState === 'user_resigned') {
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

  function pickCommentaryForState(knightState, ctx, prevState = 'deadpan') {
    if (!ctx || !ctx.moveSan) return pickLine('idle', ctx);
    const tone = ctx.tone || 'instructive';
    const clf = (ctx.classification || '').toLowerCase();
    const isUser = ctx.isUserMove !== false;

    // Resignation takes priority regardless of whose move was played last
    if (knightState === 'opp_resigned') return pickLine('opp_resigned', ctx);
    if (knightState === 'user_resigned') return pickLine('user_resigned', ctx);

    // Opponent move: explicitly reference {opponentName} so Chester knows who moved!
    if (!isUser) {
      if (knightState === 'depressed') return pickLine('opp_depressed', ctx);
      if (knightState === 'checkmate_hype') return pickLine('opp_checkmate_hype', ctx);
      if (knightState === 'manic_meltdown') return pickLine('opp_manic_meltdown', ctx);
      if (knightState === 'brilliant_shock') return pickLine('opp_brilliant', ctx);
      if (knightState === 'flabbergasted') {
        return clf === 'miss' ? pickLine('opp_miss', ctx) : pickLine('opp_blunder', ctx);
      }
      if (knightState === 'annoyed') return pickLine('opp_mistake', ctx);
      if (knightState === 'smug' || knightState === 'suspicious') return pickLine('opp_strong', ctx);
      if (clf === 'book') return pickLine('opp_opening', ctx);
      return pickLine('opp_routine', ctx);
    }

    // Dedicated redemption lines when snapping OUT of greyscale despair!
    if (prevState === 'depressed' && knightState === 'brilliant_shock') {
      return pickLine('comeback_brilliant', ctx);
    }
    if (prevState === 'depressed' && knightState !== 'depressed' && knightState !== 'flabbergasted' && knightState !== 'manic_meltdown') {
      return pickLine('comeback_recover', ctx);
    }

    if (knightState === 'depressed') return pickLine('depressed', ctx);
    if (knightState === 'checkmate_hype') return pickLine('checkmate_hype', ctx);
    if (knightState === 'manic_meltdown') return pickLine('manic_meltdown', ctx);
    if (knightState === 'brilliant_shock') return pickLine('brilliant_shock', ctx);
    if (knightState === 'flabbergasted') return pickLine('flabbergasted', ctx);

    if (knightState === 'annoyed') {
      return tone === 'instructive' ? pickLine('instructive_mistake', ctx) : pickLine('annoyed', ctx);
    }
    if (knightState === 'smug') {
      return tone === 'analytical' ? pickLine('analytical_strong', ctx) : pickLine('smug', ctx);
    }
    if (knightState === 'suspicious') return pickLine('suspicious', ctx);

    if (clf === 'book') {
      return tone === 'sarcastic' ? pickLine('opening', ctx) : pickLine('instructive_opening', ctx);
    }
    if (tone === 'analytical') return pickLine('analytical_routine', ctx);
    if (tone === 'instructive') return pickLine('instructive_routine', ctx);
    return pickLine('routine', ctx);
  }

  let _lastExplainData = null;
  let _factsDrawerOpen = false;

  function renderFactsDrawer(data, ctx = null) {
    const drawer = document.getElementById('knight-facts-drawer');
    if (!drawer) return;
    if (!data || !data.facts) {
      const evStr = ctx?.evalAfter
        ? (ctx.evalAfter.type === 'mate' ? `M${ctx.evalAfter.value}` : `${(ctx.evalAfter.value / 100).toFixed(2)}`)
        : '—';
      drawer.innerHTML = `
        <div class="facts-head">VERIFIED ENGINE DATA · CLICK [EXPLAIN] FOR FULL LAYER 2 DIFF</div>
        <div class="facts-row"><strong>Move:</strong> ${ctx?.moveSan || '—'} · <strong>Best:</strong> ${ctx?.bestMoveSan || '—'} · <strong>Eval:</strong> ${evStr}</div>
      `;
      return;
    }

    const f = data.facts;
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const items = [];
    if (f.why_played_hurts?.length) {
      items.push(`<div class="facts-row facts-bad"><strong>Why ${esc(f.played_move || 'move')} hurts:</strong> ${esc(f.why_played_hurts.join('; '))}</div>`);
    }
    if (f.why_best_better?.length) {
      items.push(`<div class="facts-row facts-good"><strong>Why ${esc(f.best_move || 'best')} wins:</strong> ${esc(f.why_best_better.join('; '))}</div>`);
    }
    if (f.played_strengths?.length) {
      items.push(`<div class="facts-row facts-good"><strong>Verified strengths:</strong> ${esc(f.played_strengths.join('; '))}</div>`);
    }
    const lineArr = f.demo_mode === 'played' && f.played_line?.length ? f.played_line : (f.best_line || []);
    const srcLabel = data.source === 'llm' ? 'Stockfish + Layer 2 + Gemini' : 'Stockfish + Layer 2 (Deterministic)';

    drawer.innerHTML = `
      <div class="facts-head">GROUNDED FACTS · ${esc(srcLabel)}</div>
      <div class="facts-row"><strong>Eval:</strong> ${esc(f.eval_after)} (Δ ${esc(f.eval_change_pawns)}) · <strong>Best:</strong> ${esc(f.best_move || '—')}</div>
      ${lineArr.length ? `<div class="facts-row"><strong>Line:</strong> ${esc(lineArr.join(' '))}</div>` : ''}
      ${items.join('')}
    `;
  }

  function toggleFactsDrawer(forceOpen = null) {
    const drawer = document.getElementById('knight-facts-drawer');
    const btn = document.getElementById('btn-coach-facts');
    if (!drawer) return;
    _factsDrawerOpen = forceOpen !== null ? Boolean(forceOpen) : !_factsDrawerOpen;
    drawer.classList.toggle('hidden', !_factsDrawerOpen);
    if (btn) btn.classList.toggle('active', _factsDrawerOpen);
    if (_factsDrawerOpen) {
      renderFactsDrawer(_lastExplainData, global.BlunderlessCoachContext || null);
    }
  }

  async function requestDetailedExplanation(ctx) {
    if (!ctx || !ctx.fen) return;

    let fenBefore = ctx.fen;
    if (ctx.ply > 0 && typeof global.buildGameAtPly === 'function') {
      fenBefore = global.buildGameAtPly(ctx.ply - 1).fen();
    }

    typeMessage('Checking Stockfish...');

    const preferredTone = (() => {
      try {
        const saved = localStorage.getItem('blunderless_tone');
        if (saved && saved !== 'auto') return saved;
      } catch (_) {}
      return ctx.tone || 'instructive';
    })();

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
          tone: preferredTone,
          mover_name: ctx.moverName || null,
          is_user_move: ctx.isUserMove !== false,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _lastExplainData = data;
      if (_factsDrawerOpen) renderFactsDrawer(data, ctx);
      if (data.mood) applyStateTransition(data.mood);
      typeMessage(data.text || pickCommentaryForState(_currentState, ctx));

      // Play out either the user's Brilliant/Great/Best follow-up ("played")
      // or the missed engine Best Move ("best") on the board!
      const demoMode = data.demo_mode || 'best';
      const lineUci = Array.isArray(data.best_line_uci) && data.best_line_uci.length > 0
        ? data.best_line_uci
        : (demoMode === 'played' && ctx.playedMoveUci ? [ctx.playedMoveUci] : (ctx.bestMoveUci ? [ctx.bestMoveUci] : []));
      if (lineUci.length > 0 && global.BlunderlessCoach?.playExplainDemo) {
        global.BlunderlessCoach.playExplainDemo(lineUci, demoMode);
      }
    } catch (_) {
      typeMessage(pickCommentaryForState(_currentState, ctx));
    }
  }

  function handlePositionAnalyzed(ctx) {
    if (!ctx) return;
    const key = `${ctx.fen}|${ctx.ply}|${ctx.playedMoveUci || ''}|${ctx.isUserMove}|${ctx.gameEndType || ''}`;
    const prevState = _currentState;
    const newState = determineKnightState(ctx);

    applyStateTransition(newState);
    updatePupilTracking(ctx.destGrid);

    if (key !== _lastContextKey) {
      _lastContextKey = key;
      _lastExplainData = null;
      if (_factsDrawerOpen) renderFactsDrawer(null, ctx);
      typeMessage(pickCommentaryForState(newState, ctx, prevState));
    }
  }

  function initKnightCoach() {
    const mascotBtn = document.getElementById('knight-mascot-btn');
    const voiceBtn = document.getElementById('btn-coach-voice');
    const explainBtn = document.getElementById('btn-coach-explain');
    const factsBtn = document.getElementById('btn-coach-facts');
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

    if (factsBtn) {
      factsBtn.addEventListener('click', () => {
        toggleFactsDrawer();
      });
    }

    global.addEventListener('blunderless:position-analyzed', (e) => {
      handlePositionAnalyzed(e.detail);
    });
  }

  document.addEventListener('DOMContentLoaded', initKnightCoach);
  global.BlunderlessChesterArt = {
    buildKnightSvg,
    say: (msg, mood = null) => {
      if (mood) applyStateTransition(mood);
      typeMessage(msg);
    },
  };
})(window);
