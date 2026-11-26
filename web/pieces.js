/* ============================================================
   Blunderless — pieces.js
   One original piece set, shared by both colours.

   Why one geometry for both sides?
   - White and Black use the exact same shapes, only the palette
     changes, so the two armies always look like one carved set.
   - Each piece is rendered as its own data-URI <img>, so SVG ids
     never clash (that was the bug with inlined Cardinal pieces).

   Palette:
     White: ivory body #FAF6F0, espresso outline/detail #22150E
     Black: espresso body #22150E, warm cream detail lines #E6D8C8
   ============================================================ */

(function (global) {
  'use strict';

  const PALETTE = {
    w: { body: '#FAF6F0', outline: '#22150E', detail: '#22150E' },
    b: { body: '#22150E', outline: '#22150E', detail: '#E6D8C8' },
  };

  // Shared plinth (base) used by every piece, so the set feels consistent.
  const PLINTH = '<path d="M11 39.5h23V37c0-1.4-1.1-2.5-2.5-2.5h-18C12.1 34.5 11 35.6 11 37z"/>';

  // Each piece: `body` = filled shapes, `lines` = detail strokes drawn on top.
  // viewBox is 0 0 45 45 for every piece.
  const SHAPES = {
    // Pawn: round head, collar, flared body.
    P: {
      body: PLINTH +
        '<path d="M19 22.5c0 5-2 8.5-5 12h17c-3-3.5-5-7-5-12z"/>' +
        '<path d="M17 19.5h11a1.5 1.5 0 0 1 0 3H17a1.5 1.5 0 0 1 0-3z"/>' +
        '<circle cx="22.5" cy="13.5" r="5"/>',
      lines: '<path d="M15 34.5h15"/>',
    },

    // Rook: tapered tower with three crenellations.
    R: {
      body: PLINTH +
        '<path d="M13 34.5h19l-1.5-3h-16z"/>' +
        '<path d="M15 31.5h15l-1-14H16z"/>' +
        '<path d="M13 17.5h19v-3H13z"/>' +
        '<path d="M13 14.5V9h4v2.5h3V9h5v2.5h3V9h4v5.5z"/>',
      lines: '<path d="M16 17.5h13M15.5 31.5h14M13.5 34.5h18"/>',
    },

    // Knight: clean geometric horse head facing left.
    N: {
      body: PLINTH +
        '<path d="M15 34.5c0-6 3.5-9 6.5-11.5-2.5.5-5 1.5-7 3.5-1.5 1.5-3.5 1-4-.5-.5-1.5 0-3 1-4.5L18 13l-1-4 3.5 2 1.5-3 2 3.5c6 1 10.5 5.5 10.5 13 0 4-1 7.5-2.5 10.5z"/>',
      lines:
        '<path d="M25 12.5c3.8 1.6 6.5 5 7 9.5"/>' +
        '<circle cx="17.6" cy="16.2" r="1" fill="currentColor" stroke="none"/>' +
        '<circle cx="12.6" cy="23.6" r=".7" fill="currentColor" stroke="none"/>' +
        '<path d="M13 34.5h19"/>',
    },

    // Bishop: mitre with diagonal slit and ball finial.
    B: {
      body: PLINTH +
        '<path d="M15 34.5h15l-1.5-3h-12z"/>' +
        '<path d="M16.5 31.5c-1-4 0-8 2-11.5 1.3-2.3 2.6-4.5 4-6.5 1.4 2 2.7 4.2 4 6.5 2 3.5 3 7.5 2 11.5z"/>' +
        '<path d="M17.2 25h10.6v2.6H17.2z"/>' +
        '<circle cx="22.5" cy="10.8" r="2.2"/>',
      lines: '<path d="M25.6 16.8l-3.8 5M17 31.5h11M14 34.5h17"/>',
    },

    // Queen: five-point crown with ball tips.
    Q: {
      body: PLINTH +
        '<path d="M13.5 34.5h18l-1.5-3h-15z"/>' +
        '<path d="M15 31.5 11 16l3.5 7 2-10 3 8 3-10 3 10 3-8 2 10 3.5-7-4 15.5z"/>' +
        '<circle cx="11" cy="15" r="1.9"/>' +
        '<circle cx="16.5" cy="12" r="1.9"/>' +
        '<circle cx="22.5" cy="10" r="1.9"/>' +
        '<circle cx="28.5" cy="12" r="1.9"/>' +
        '<circle cx="34" cy="15" r="1.9"/>',
      lines: '<path d="M15.6 27.5h13.8M15 31.5h15M13 34.5h19"/>',
    },

    // King: two rounded lobes under a cross.
    K: {
      body: PLINTH +
        '<path d="M13.5 34.5h18l-1.5-3h-15z"/>' +
        '<path d="M20.5 16h4l.5 5h-5z"/>' +
        '<path d="M15 31.5c-2.5-3.5-5-7-5-10.5 0-3 2.4-5 5.3-5 3 0 5.6 2 7.2 5 1.6-3 4.2-5 7.2-5 2.9 0 5.3 2 5.3 5 0 3.5-2.5 7-5 10.5z"/>' +
        '<path d="M21 6h3v2.5h2.5v3H24V16h-3v-4.5h-2.5v-3H21z"/>',
      lines: '<path d="M22.5 21v6M15 27.5h15M15 31.5h15M13 34.5h19"/>',
    },
  };

  /** Build the SVG markup for one piece code such as "wN" or "bQ". */
  function buildSvg(code) {
    const pal = PALETTE[code[0]];
    const shape = SHAPES[code[1]];
    if (!pal || !shape) return '';

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" shape-rendering="geometricPrecision">' +
      `<g fill="${pal.body}" stroke="${pal.outline}" stroke-width="1.5" stroke-linejoin="round">${shape.body}</g>` +
      // `color` lets the small dots (eye, nostril) reuse the detail colour.
      `<g fill="none" stroke="${pal.detail}" color="${pal.detail}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${shape.lines}</g>` +
      '</svg>'
    );
  }

  // Pre-build all 12 pieces once at startup.
  const svgCache = {};
  const uriCache = {};
  for (const color of ['w', 'b']) {
    for (const type of ['P', 'N', 'B', 'R', 'Q', 'K']) {
      const code = color + type;
      svgCache[code] = buildSvg(code);
      uriCache[code] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgCache[code]);
    }
  }

  global.BlunderlessPieces = {
    getSvg: (code) => svgCache[code] || '',
    getDataUri: (code) => uriCache[code] || '',
  };
})(typeof window !== 'undefined' ? window : globalThis);
