/* ============================================================
   Blunderless — pieces.js
   One original "editorial" piece set, shared by both colours.

   Inspired by flat poster-style chess art:
   - bold espresso contour lines
   - right-half tonal shading (light from the left)
   - terracotta accent bands on collars
   - stepped base: foot + flat plate
   ...kept at classic squat board proportions (not tall/elongated).

   Why one geometry for both sides?
   White and Black use the exact same shapes, only the palette
   changes, so both armies always read as one carved set.

   Why data-URI <img> per piece (not inline SVG)?
   Each image is isolated, so the clipPath id used for shading
   can never clash between pieces on the page.
   ============================================================ */

(function (global) {
  'use strict';

  // rim    = thick outer "sticker" outline (chess.com style), drawn underneath
  // body   = main fill
  // shade  = right-half tone (gives the flat poster lighting)
  // panel  = contrasting panel (knight mane)
  // accent = terracotta collar bands
  const PALETTE = {
    w: {
      rim: '#D9C9B6', body: '#FAF6F0', shade: '#E8D8C2', panel: '#22150E',
      outline: '#22150E', detail: '#22150E', accent: '#C86D3B', hi: '#FFFFFF',
    },
    b: {
      rim: '#F3EADF', body: '#2E1F17', shade: '#4A3428', panel: '#E6D8C8',
      outline: '#140C08', detail: '#E6D8C8', accent: '#C86D3B', hi: '#CDBBA8',
    },
  };

  // Shared stepped base: a rounded foot sitting on a flat plate.
  const BASE =
    '<path d="M12.5 37.4h20c0-2-1.3-3.4-3-3.4h-14c-1.7 0-3 1.4-3 3.4z"/>' +
    '<path d="M10.5 40.2h24v-2.8h-24z"/>';

  // Each piece (viewBox 0 0 45 45):
  //   body   - silhouette shapes (also used as the shading clip)
  //   accent - terracotta bands, drawn on top of the body
  //   panel  - optional contrasting shape (knight mane)
  //   lines  - detail strokes
  //   hi     - optional highlight strokes
  const SHAPES = {
    // Pawn: ball head, banded collar, flared skirt.
    P: {
      body: BASE +
        '<path d="M19.3 21.4c-.2 5-1.7 9-4.3 12.6h15c-2.6-3.6-4.1-7.6-4.3-12.6z"/>' +
        '<circle cx="22.5" cy="13.4" r="4.6"/>',
      accent: '<path d="M17.5 18.6h10a1.4 1.4 0 0 1 0 2.8h-10a1.4 1.4 0 0 1 0-2.8z"/>',
      lines: '',
      hi: '<path d="M20.2 11.6a3 3 0 0 1 2.4-1.6"/>',
    },

    // Rook: crenellated top, shoulder ledge, tapered tower, banded collar.
    R: {
      body: BASE +
        '<path d="M15.5 17.4h14l-.8 13.6H16.3z"/>' +
        '<path d="M13.5 15h18v2.4h-18z"/>' +
        '<path d="M13.5 15V9h3.6v2.4h3.2V9h4.4v2.4h3.2V9h3.6v6z"/>',
      accent: '<path d="M14 31h17v3H14z"/>',
      lines: '',
    },

    // Knight: flowing horse head facing right with a contrasting mane panel.
    N: {
      body: BASE +
        '<path d="M14 34C12 26 13 16 20 10.5L22 7l2.5 3c4.5 1 8.5 5.5 10.5 10 .8 1.8 0 3.5-2 3.5-2.5.1-4.5-.5-6.5-1-1.5 3 .5 7 3.5 11.5z"/>',
      panel: '<path d="M20 10.5C13 15.5 12.2 26 14 34h3.6c-2.2-7-1.6-15.6 2.4-21z"/>',
      accent: '<path d="M14 31.4h16.5V34H14z"/>',
      lines:
        '<circle cx="27.6" cy="14.6" r="1.05" fill="currentColor" stroke="none"/>' +
        '<path d="M33.2 21.1l1 .5M26.5 22.5c1.6-.3 3-1.2 4-2.4"/>',
    },

    // Bishop: teardrop mitre with slit and ball finial.
    B: {
      body: BASE +
        '<path d="M19.5 26.2c-.3 3.4-1.8 5.6-4 7.8h14c-2.2-2.2-3.7-4.4-4-7.8z"/>' +
        '<path d="M22.5 10.2c-3.2 2.6-5 5.6-5 8.6 0 2.4 1.2 4 2.6 4.8h4.8c1.4-.8 2.6-2.4 2.6-4.8 0-3-1.8-6-5-8.6z"/>' +
        '<circle cx="22.5" cy="8.6" r="1.6"/>',
      accent: '<path d="M17.5 23.6h10a1.3 1.3 0 0 1 0 2.6h-10a1.3 1.3 0 0 1 0-2.6z"/>',
      lines: '<path d="M25 13.2l-3 4.2"/>',
    },

    // Queen: pointed crown with ball tips, banded neck, flared skirt.
    Q: {
      body: BASE +
        '<path d="M17.5 23.6c0 4.4-1.4 7.6-3.5 10.4h17c-2.1-2.8-3.5-6-3.5-10.4z"/>' +
        '<path d="M15.5 21 14 12.5l4 3.5 4.5-5.5 4.5 5.5 4-3.5-1.5 8.5z"/>' +
        '<circle cx="22.5" cy="8.9" r="1.6"/>' +
        '<circle cx="14" cy="11.4" r="1.2"/>' +
        '<circle cx="31" cy="11.4" r="1.2"/>',
      accent: '<path d="M15 21h15a1.3 1.3 0 0 1 0 2.6H15a1.3 1.3 0 0 1 0-2.6z"/>',
      lines: '<path d="M16.2 18.4h12.6"/>',
    },

    // King: cross on a flared crown, banded neck, flared skirt.
    K: {
      body: BASE +
        '<path d="M17.8 22.1c0 4.8-1.5 8.6-3.8 11.9h17c-2.3-3.3-3.8-7.1-3.8-11.9z"/>' +
        '<path d="M17 19.5 16 13.2c0-1.2 1-2.2 2.2-2.2h8.6c1.2 0 2.2 1 2.2 2.2L28 19.5z"/>' +
        '<path d="M21.4 5h2.2v2h2v2.2h-2V11h-2.2V9.2h-2V7h2z"/>',
      accent: '<path d="M15.5 19.5h14a1.3 1.3 0 0 1 0 2.6h-14a1.3 1.3 0 0 1 0-2.6z"/>',
      lines: '<path d="M17.2 15.5h10.6"/>',
    },
  };

  /** Build the SVG markup for one piece code such as "wN" or "bQ". */
  function buildSvg(code) {
    const pal = PALETTE[code[0]];
    const s = SHAPES[code[1]];
    if (!pal || !s) return '';

    const panel = s.panel || '';
    const hi = s.hi || '';

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" shape-rendering="geometricPrecision">' +
      // Clip shape for the half-tone shading = the piece silhouette.
      `<defs><clipPath id="sil">${s.body}</clipPath></defs>` +
      // 1. Thick outer rim underneath everything.
      `<g fill="${pal.rim}" stroke="${pal.rim}" stroke-width="4.5" stroke-linejoin="round">${s.body}${s.accent}</g>` +
      // 2. Flat body fill.
      `<g fill="${pal.body}">${s.body}</g>` +
      // 3. Right-half shading, clipped to the silhouette.
      `<rect x="22.5" y="0" width="23" height="45" fill="${pal.shade}" clip-path="url(#sil)"/>` +
      // 4. Contrasting panel (knight mane).
      `<g fill="${pal.panel}">${panel}</g>` +
      // 5. Bold contour lines over the body.
      `<g fill="none" stroke="${pal.outline}" stroke-width="1.4" stroke-linejoin="round">${s.body}${panel}</g>` +
      // 6. Terracotta accent bands.
      `<g fill="${pal.accent}" stroke="${pal.outline}" stroke-width="1.3" stroke-linejoin="round">${s.accent}</g>` +
      // 7. Detail lines (`color` lets dots like the knight's eye reuse it).
      `<g fill="none" stroke="${pal.detail}" color="${pal.detail}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${s.lines}</g>` +
      // 8. Small highlights.
      `<g fill="none" stroke="${pal.hi}" stroke-width="1.1" stroke-linecap="round">${hi}</g>` +
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
