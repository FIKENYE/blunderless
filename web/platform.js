/* ============================================================
   Blunderless — platform.js (v3.0)
   - Pixel-art Floppy-Disk + Knight brand logo & favicon
   - 4-View Navigation Shell (HOME | ANALYZE | MY GAMES | INSIGHTS)
   - Google OAuth + Local Profile + Chess.com & Lichess Account Modal
   - HOME Landing Page + Live ELO Tracker & Interactive SVG Charts
   - MY GAMES Unified 50-200+ Library (Filters + Sort by Most Brilliants)
   - INSIGHTS Multi-Game Batch Analyser & Vital Scouting Report
   ============================================================ */

(function (global) {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const pState = {
    view: 'home',
    auth: null,
    dashboard: null,
    homeChartPlatform: 'all',
    homeChartTc: 'rapid',
    insTc: 'rapid',
    insPeriod: 30,
    insPlatform: 'all',
    activeJobId: null,
    jobPollTimer: null,
    startAbortCtrl: null,
    cancelRequested: false,
    activeReportId: null,
  };

  // ── Theme & Settings Helpers ────────────────────────────────────────
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem('blunderless_theme', isDark ? 'dark' : 'light'); } catch (_) {}

    const btn = $('setting-darkmode-toggle');
    if (btn) {
      btn.classList.toggle('active', isDark);
      btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
    }
    if ($('setting-darkmode-label')) {
      $('setting-darkmode-label').textContent = isDark ? 'DARK' : 'LIGHT';
    }
    if ($('setting-theme-desc')) {
      $('setting-theme-desc').textContent = isDark
        ? 'Dark Roast espresso palette active. Switch back anytime.'
        : 'Warm parchment palette active. Toggle on for Dark Roast low-light mode.';
    }
    // Re-render visible SVG charts so axis text & strokes match the active theme
    if (pState.dashboard && pState.view === 'home') renderHomeEloChart();
  }

  function syncSettingsToggles() {
    const soundBtn = $('btn-rail-sound');
    const coordsBtn = $('btn-rail-coords');
    const soundOn = soundBtn ? soundBtn.classList.contains('active') : true;
    const coordsOn = coordsBtn ? coordsBtn.classList.contains('active') : true;

    const sToggle = $('setting-sound-toggle');
    if (sToggle) {
      sToggle.classList.toggle('active', soundOn);
      sToggle.setAttribute('aria-checked', soundOn ? 'true' : 'false');
    }
    if ($('setting-sound-label')) $('setting-sound-label').textContent = soundOn ? 'ON' : 'OFF';

    const cToggle = $('setting-coords-toggle');
    if (cToggle) {
      cToggle.classList.toggle('active', coordsOn);
      cToggle.setAttribute('aria-checked', coordsOn ? 'true' : 'false');
    }
    if ($('setting-coords-label')) $('setting-coords-label').textContent = coordsOn ? 'ON' : 'OFF';
  }

  // ── 1. Brand Art & Landing Interactive Data ─────────────────────────
  function initBrandArt() {
    // Render large interactive Chester inside the Landing Hero Portrait Frame
    const heroArt = $('lp-chester-art');
    if (heroArt && global.BlunderlessChesterArt?.buildKnightSvg) {
      heroArt.innerHTML = global.BlunderlessChesterArt.buildKnightSvg(216, 'hero-knight');
    }
  }

  // Interactive Hero Chester quips & Sample Review showcase switcher
  const HERO_QUIPS = [
    { state: 'deadpan', mood: 'DEADPAN · CLICK CHESTER', evalTag: '-3.40', text: 'Chester: "I\'ve seen that blunder before."' },
    { state: 'smug', mood: 'NOT BAD · CLICK CHESTER', evalTag: '+1.85', text: 'Chester: "Link your account. Let\'s see that rating."' },
    { state: 'flabbergasted', mood: 'MY EYES · CLICK CHESTER', evalTag: '-8.20', text: 'Chester: "Wait—you hung your queen on move 9?!"' },
    { state: 'suspicious', mood: 'HMMM... · CLICK CHESTER', evalTag: '+0.40', text: 'Chester: "96% accuracy? Blink twice if Stockfish helped."' },
    { state: 'brilliant_shock', mood: 'WHAT?! · CLICK CHESTER', evalTag: '+4.60', text: 'Chester: "WAIT A SECOND—a real sound sacrifice?!"' },
  ];
  let _heroQuipIdx = 0;

  const SAMPLE_REVIEWS = [
    {
      stage: 'OPENING',
      title: 'Move 8: Inaccuracy',
      evalShift: '+0.20 → -0.85',
      engine: 'You pushed a flank pawn while two minor pieces were still on the back rank. Stockfish prefers developing Nf6 and preparing to castle.',
      chester: "Chester's note: Get both knights and bishops out and tuck your king away before starting side attacks.",
    },
    {
      stage: 'MIDDLEGAME',
      title: 'Move 23: Blunder',
      evalShift: '+0.35 → -3.40',
      engine: "You moved a defender away from your king's side. Stockfish's top line keeps it in place and holds the position level.",
      chester: "Chester's note: This is a pattern, not a one-off. Check what your last piece was guarding before you move it.",
    },
    {
      stage: 'ENDGAME',
      title: 'Move 38: Miss',
      evalShift: '+2.80 → +0.15',
      engine: 'Your king stayed passive on the back rank instead of marching toward the center. Stockfish plays Kf6 to seize the key squares.',
      chester: "Chester's note: Once the queens come off, your king becomes a fighting piece. Activate it immediately.",
    },
  ];

  // ── 2. API Helper ───────────────────────────────────────────────────
  async function api(path, method = 'GET', body = null, signal = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== null) opts.body = JSON.stringify(body);
    if (signal) opts.signal = signal;
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDateShort(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function fmtAgo(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // ── 3. 4-View Router & Landing Mode Chrome Toggle ───────────────────
  function syncLandingMode() {
    const landingVisible =
      pState.view === 'home' &&
      !($('home-landing-flow')?.classList.contains('hidden'));
    document.body.classList.toggle('landing-mode', landingVisible);
  }

  function switchAppView(viewName) {
    const valid = ['home', 'analyze', 'games', 'insights', 'settings'];
    if (!valid.includes(viewName)) viewName = 'home';
    const wasSameView = pState.view === viewName;
    pState.view = viewName;
    try { sessionStorage.setItem('blunderless_view', viewName); } catch (_) {}

    document.querySelectorAll('.nav-view-btn, .mobile-nav-btn').forEach((btn) => {
      const isActive = btn.dataset.view === viewName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    valid.forEach((v) => {
      const el = $(`view-${v}`);
      if (!el) return;
      el.classList.toggle('active', v === viewName);
      el.classList.toggle('hidden', v !== viewName);
    });

    // Tapping the active tab again scrolls cleanly to top (native mobile app convention)
    const activeViewEl = $(`view-${viewName}`);
    if (wasSameView && activeViewEl && activeViewEl.scrollTop > 0) {
      activeViewEl.scrollTo({ top: 0, behavior: 'smooth' });
    }

    syncLandingMode();

    if (viewName === 'analyze') {
      requestAnimationFrame(() => global.BlunderlessBoard?.resize());
      setTimeout(() => global.BlunderlessBoard?.resize(), 60);
    } else if (viewName === 'home') {
      loadHomeDashboard();
    } else if (viewName === 'games') {
      loadGamesLibrary();
    } else if (viewName === 'insights') {
      loadSavedReportsList();
    } else if (viewName === 'settings') {
      applyTheme(getTheme());
      syncSettingsToggles();
    }
  }

  // ── 4. Open Any Saved/Library Game Directly on the Board ────────────
  let _openGameAbortCtrl = null;

  async function openLibraryGame(gameId, targetPly = 0) {
    if (_openGameAbortCtrl) {
      try { _openGameAbortCtrl.abort(); } catch (_) {}
    }
    const ctrl = new AbortController();
    _openGameAbortCtrl = ctrl;

    switchAppView('analyze');
    const loadSeq = global.BlunderlessBoard?.beginExternalLoad?.('Loading game...') ?? null;

    try {
      const g = await api(`/api/games/${gameId}`, 'GET', null, ctrl.signal);
      const myHandle = g.user_color === 'white' ? g.white_user : g.black_user;
      const oppName = g.user_color === 'white' ? g.black_user : g.white_user;

      if (g.analysed && g.analysis) {
        await global.BlunderlessBoard?.openGame(g.pgn, g.analysis, targetPly, myHandle, loadSeq);
      } else {
        // Show clear progress while Stockfish analyses & caches this library game
        const seq2 = global.BlunderlessBoard?.beginExternalLoad?.(`Analysing vs ${oppName}...`) ?? loadSeq;
        const res = await api(`/api/games/${gameId}/analyse?depth=10`, 'POST', null, ctrl.signal);
        await global.BlunderlessBoard?.openGame(g.pgn, res.analysis, targetPly, myHandle, seq2);
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      global.BlunderlessBoard?.endExternalLoad?.(loadSeq);
      alert(`Could not open game: ${err.message}`);
    } finally {
      if (_openGameAbortCtrl === ctrl) _openGameAbortCtrl = null;
    }
  }

  // ── 5. Auth & Account Connections Modal ─────────────────────────────
  async function refreshAuth() {
    try {
      pState.auth = await api('/api/auth/me');
    } catch (_) {
      pState.auth = { authenticated: false, linked_accounts: [], google_configured: false };
    }
    renderAuthUI();
    return pState.auth;
  }

  function renderAuthUI() {
    const auth = pState.auth || {};
    const pillAvatar = $('account-pill-avatar');
    const pillName = $('account-pill-name');
    const accounts = auth.linked_accounts || [];

    if (auth.authenticated && auth.user) {
      const name = auth.user.display_name || 'Player';
      pillName.textContent = name.toUpperCase().slice(0, 14);
      if (auth.user.avatar_url) {
        pillAvatar.innerHTML = `<img src="${escHtml(auth.user.avatar_url)}" alt="" class="pill-avatar-img" />`;
      } else {
        pillAvatar.textContent = name[0].toUpperCase();
      }
      // Keep Board POV synced with linked Chess.com or Lichess handle
      if (accounts.length > 0) {
        global.BlunderlessBoard?.setSearchedUser(accounts[0].username);
      }
    } else {
      pillName.textContent = 'SIGN IN';
      pillAvatar.textContent = '?';
    }

    // Modal state
    $('modal-signed-out')?.classList.toggle('hidden', Boolean(auth.authenticated));
    $('modal-signed-in')?.classList.toggle('hidden', !auth.authenticated);
    if (auth.authenticated && auth.user) {
      $('modal-user-name').textContent = auth.user.display_name;
      $('modal-user-sub').textContent =
        auth.user.provider === 'google'
          ? `Google Account · ${auth.user.email || ''}`
          : 'Local Blunderless Profile';
    }

    // Only show Google OAuth controls when configured on the server
    const googleEnabled = Boolean(auth.google_configured);
    $('modal-google-wrap')?.classList.toggle('hidden', !googleEnabled);
    const primaryCtaLabel = googleEnabled ? 'CONTINUE WITH GOOGLE' : 'CONNECT YOUR ACCOUNT';
    if ($('lp-hero-cta')) $('lp-hero-cta').textContent = primaryCtaLabel;
    if ($('lp-footer-cta')) $('lp-footer-cta').textContent = primaryCtaLabel;

    const ccAcc = accounts.find((a) => a.platform === 'chesscom');
    const liAcc = accounts.find((a) => a.platform === 'lichess');

    $('modal-cc-linked')?.classList.toggle('hidden', !ccAcc);
    if (ccAcc) {
      $('modal-cc-label').textContent = `Connected: ${ccAcc.username}`;
      $('modal-cc-input').value = ccAcc.username;
    }

    $('modal-li-linked')?.classList.toggle('hidden', !liAcc);
    if (liAcc) {
      $('modal-li-label').textContent = `Connected: ${liAcc.username}`;
      $('modal-li-input').value = liAcc.username;
    }
  }

  function openAccountModal() {
    $('modal-status').textContent = '';
    $('account-modal')?.classList.remove('hidden');
  }

  function closeAccountModal() {
    $('account-modal')?.classList.add('hidden');
  }

  function handlePrimaryLandingCta() {
    if (pState.auth?.google_configured) {
      window.location.href = '/auth/google/login';
      return;
    }
    const connectEl = $('lp-connect');
    const userInput = $('qc-username');
    if (connectEl && !$('home-landing-flow')?.classList.contains('hidden')) {
      connectEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => userInput?.focus(), 260);
      return;
    }
    openAccountModal();
  }

  async function handleGoogleSignIn() {
    if (pState.auth?.google_configured) {
      window.location.href = '/auth/google/login';
      return;
    }
    openAccountModal();
  }

  async function handleLinkAccount(platform, username, statusEl, triggerBtn = null) {
    const clean = (username || '').trim();
    if (!clean) {
      if (statusEl) statusEl.textContent = 'Enter a Chess.com or Lichess username first.';
      return;
    }
    const origLabel = triggerBtn ? triggerBtn.textContent : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = 'SYNCING...';
    }
    if (statusEl) statusEl.textContent = `Connecting ${platform === 'chesscom' ? 'Chess.com' : 'Lichess'} (${clean}) & syncing games...`;
    try {
      const res = await api('/api/accounts/link', 'POST', {
        platform,
        username: clean,
        sync_limit: 80,
      });
      if (statusEl) {
        statusEl.textContent = `Connected ${res.account.username}! Synced ${res.synced_games} games.`;
      }
      await refreshAuth();
      await loadHomeDashboard();
      if (pState.view === 'games') loadGamesLibrary();
      if (pState.view === 'insights') loadSavedReportsList();
      closeAccountModal();
    } catch (err) {
      if (statusEl) statusEl.textContent = `Could not connect: ${err.message}`;
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = origLabel;
      }
    }
  }

  // ── 6. SVG Chart Renderers (Zero External Libraries!) ───────────────
  function renderLineAreaSvg(points, opts = {}) {
    if (!points || points.length === 0) {
      return '<div class="empty-inline">Not enough data points yet for this mode.</div>';
    }
    const W = 720;
    const H = opts.height || 180;
    const padL = 44;
    const padR = 16;
    const padT = 14;
    const padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const vals = points.map((p) => Number(p.y));
    const minY = opts.minY !== undefined ? opts.minY : Math.floor((Math.min(...vals) - 15) / 10) * 10;
    const maxY = opts.maxY !== undefined ? opts.maxY : Math.ceil((Math.max(...vals) + 15) / 10) * 10;
    const spanY = Math.max(1, maxY - minY);

    const coords = points.map((p, i) => {
      const x = padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
      const y = padT + (1 - (Number(p.y) - minY) / spanY) * plotH;
      return { x, y, label: p.label || '', yVal: p.y, ma: p.ma };
    });

    // Horizontal grid lines (4 ticks)
    const isDark = getTheme() === 'dark';
    const gridStroke = isDark ? 'rgba(241,230,216,0.16)' : 'rgba(43,26,18,0.14)';
    const labelColor = isDark ? '#BBA38F' : '#8C5A3C';
    const maStroke = isDark ? '#F1E6D8' : '#2B1A12';
    const dotOutline = isDark ? '#17110D' : '#FAF6F0';

    let gridSvg = '';
    for (let t = 0; t <= 3; t++) {
      const gy = padT + (t / 3) * plotH;
      const gVal = Math.round(maxY - (t / 3) * spanY);
      gridSvg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${gridStroke}" stroke-dasharray="3,3" />`;
      gridSvg += `<text x="${padL - 6}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${labelColor}">${gVal}${opts.suffix || ''}</text>`;
    }

    // X-axis labels (start, mid, end)
    const xIndices = points.length >= 3 ? [0, Math.floor(points.length / 2), points.length - 1] : [0, points.length - 1];
    let xLabelsSvg = '';
    const seenX = new Set();
    for (const idx of xIndices) {
      if (seenX.has(idx) || !coords[idx]) continue;
      seenX.add(idx);
      xLabelsSvg += `<text x="${coords[idx].x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${labelColor}">${escHtml(coords[idx].label)}</text>`;
    }

    const strokeCol = opts.color || '#C86D3B';
    const fillCol = opts.fill || 'rgba(200, 109, 59, 0.16)';
    const linePts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPts = `${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} ${linePts} ${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)}`;

    // Optional moving average dashed line
    let maSvg = '';
    if (opts.showMa) {
      const maPts = coords
        .filter((c) => c.ma !== undefined)
        .map((c) => {
          const my = padT + (1 - (Number(c.ma) - minY) / spanY) * plotH;
          return `${c.x.toFixed(1)},${my.toFixed(1)}`;
        })
        .join(' ');
      if (maPts) {
        maSvg = `<polyline points="${maPts}" fill="none" stroke="${maStroke}" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7" />`;
      }
    }

    // Interactive hover dots (keep <= 40 circles for crispness)
    const step = Math.max(1, Math.floor(coords.length / 36));
    let dotsSvg = '';
    for (let i = 0; i < coords.length; i += step) {
      const c = coords[i];
      dotsSvg += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.2" fill="${strokeCol}" stroke="${dotOutline}" stroke-width="1.2"><title>${escHtml(c.label)}: ${c.yVal}${opts.suffix || ''}</title></circle>`;
    }
    const last = coords[coords.length - 1];
    dotsSvg += `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4.8" fill="${strokeCol}" stroke="${maStroke}" stroke-width="1.5"><title>${escHtml(last.label)}: ${last.yVal}${opts.suffix || ''}</title></circle>`;

    return `
      <svg class="retro-svg-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        ${gridSvg}
        <polygon points="${areaPts}" fill="${fillCol}" />
        <polyline points="${linePts}" fill="none" stroke="${strokeCol}" stroke-width="2.4" stroke-linejoin="round" />
        ${maSvg}
        ${dotsSvg}
        ${xLabelsSvg}
      </svg>`;
  }

  function renderDonutSvg(segments, centerLabel = '') {
    const total = segments.reduce((s, x) => s + (x.value || 0), 0);
    if (!total) return '<div class="empty-inline">No data yet.</div>';

    const r = 46;
    const cx = 62;
    const cy = 62;
    const circ = 2 * Math.PI * r;
    let offset = 0;

    const slices = segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const len = (s.value / total) * circ;
        const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${escHtml(s.label)}: ${s.value} (${Math.round((s.value / total) * 100)}%)</title></circle>`;
        offset += len;
        return el;
      })
      .join('');

    const legend = segments
      .map(
        (s) =>
          `<div class="donut-leg-item"><span class="donut-dot" style="background:${s.color}"></span><span class="donut-leg-lbl">${escHtml(s.label)}</span><span class="donut-leg-val">${s.value}</span></div>`
      )
      .join('');

    const isDark = getTheme() === 'dark';
    const trackStroke = isDark ? 'rgba(241,230,216,0.16)' : 'rgba(43,26,18,0.12)';
    const textFill = isDark ? '#F1E6D8' : '#2B1A12';

    return `
      <div class="donut-inner">
        <svg viewBox="0 0 124 124" width="124" height="124" class="donut-svg">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${trackStroke}" stroke-width="18" />
          ${slices}
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${textFill}">${escHtml(centerLabel || String(total))}</text>
        </svg>
        <div class="donut-legend">${legend}</div>
      </div>`;
  }

  // ── 7. HOME View (Landing Page + Elo Tracker) ───────────────────────
  async function loadHomeDashboard() {
    try {
      const data = await api('/api/home/dashboard');
      pState.dashboard = data;
      renderHomeView(data);
    } catch (_) {}
  }

  function renderHomeView(data) {
    const hasLinked = Boolean(data && data.authenticated && (data.linked_accounts || []).length > 0);
    const dashEl = $('home-dashboard');
    const landingEl = $('home-landing-flow');

    if (dashEl) dashEl.classList.toggle('hidden', !hasLinked);
    if (landingEl) landingEl.classList.toggle('hidden', hasLinked);
    syncLandingMode();
    if (!hasLinked) return;

    const accounts = data.linked_accounts || [];
    const m = data.metrics || {};
    $('home-welcome-title').textContent = `${(data.user?.display_name || 'PLAYER').toUpperCase()} · ELO TRACKER & METRICS`;

    $('home-linked-badges').innerHTML = accounts
      .map((a) => `<span class="platform-chip chip-${a.platform}">${a.platform === 'chesscom' ? 'CHESS.COM' : 'LICHESS'} · ${escHtml(a.username)}</span>`)
      .join(' ');

    // Live ELO Cards per linked platform & time control
    const cardsEl = $('home-elo-cards');
    const cardHtml = [];
    for (const acc of accounts) {
      const st = acc.stats || {};
      const platName = acc.platform === 'chesscom' ? 'Chess.com' : 'Lichess';
      for (const tc of ['rapid', 'blitz', 'bullet']) {
        const entry = st[tc];
        if (!entry || !entry.rating) continue;
        cardHtml.push(`
          <div class="elo-stat-card">
            <div class="elo-card-top">
              <span class="elo-card-tc">${tc.toUpperCase()}</span>
              <span class="platform-mini-tag tag-${acc.platform}">${platName}</span>
            </div>
            <div class="elo-card-rating">${entry.rating}</div>
            <div class="elo-card-peak">Peak: ${entry.best || entry.rating}</div>
          </div>
        `);
      }
      if (st.puzzles) {
        cardHtml.push(`
          <div class="elo-stat-card">
            <div class="elo-card-top">
              <span class="elo-card-tc">PUZZLES</span>
              <span class="platform-mini-tag tag-${acc.platform}">${platName}</span>
            </div>
            <div class="elo-card-rating">${st.puzzles}</div>
            <div class="elo-card-peak">Tactics Rating</div>
          </div>
        `);
      }
    }
    cardsEl.innerHTML = cardHtml.length ? cardHtml.join('') : '<div class="empty-inline">Sync games to populate ELO cards.</div>';

    renderHomeEloChart();

    // Metrics Snapshot Strip
    const streakStr = m.streak_count
      ? `${m.streak_count} ${m.streak_type === 'win' ? 'Win' : m.streak_type === 'loss' ? 'Loss' : 'Draw'} streak`
      : '—';
    $('home-metrics-strip').innerHTML = [
      { lbl: 'Synced Games', val: m.total_games ?? 0 },
      { lbl: 'Analysed', val: m.analysed_games ?? 0 },
      { lbl: 'Win Rate', val: `${m.win_rate ?? 0}%`, cls: 'val-green' },
      { lbl: 'Current Form', val: streakStr },
      { lbl: 'Avg Accuracy', val: m.avg_accuracy != null ? `${m.avg_accuracy}%` : '—' },
      { lbl: 'Brilliants (!!)', val: m.total_brilliants ?? 0, cls: 'val-teal' },
      { lbl: 'Blunders (??)', val: m.total_blunders ?? 0, cls: 'val-red' },
    ]
      .map((k) => `<div class="kpi-tile"><div class="kpi-val ${k.cls || ''}">${escHtml(String(k.val))}</div><div class="kpi-lbl">${k.lbl}</div></div>`)
      .join('');

    // Recent Games quick list
    const recEl = $('home-recent-games');
    const recentGames = data.recent_games || [];
    if (!recentGames.length) {
      recEl.innerHTML = '<div class="empty-inline">No games synced yet. Click Sync Games above.</div>';
    } else {
      recEl.innerHTML = '';
      for (const g of recentGames) {
        const opp = g.user_color === 'white' ? g.black_user : g.white_user;
        const oppElo = g.user_color === 'white' ? g.black_elo : g.white_elo;
        const row = document.createElement('button');
        row.className = 'compact-game-row';
        row.innerHTML = `
          <span class="res-dot res-${g.user_result}">${g.user_result[0].toUpperCase()}</span>
          <span class="cg-opp">vs ${escHtml(opp)} ${oppElo ? `(${oppElo})` : ''}</span>
          <span class="cg-meta">${escHtml(g.time_class)} · ${g.analysed && g.user_accuracy != null ? `${g.user_accuracy}%` : fmtDateShort(g.end_time)}</span>
        `;
        row.addEventListener('click', () => openLibraryGame(g.id));
        recEl.appendChild(row);
      }
    }

    // Saved Reports quick list
    const repEl = $('home-saved-reports');
    const saved = data.saved_reports || [];
    if (!saved.length) {
      repEl.innerHTML = '<div class="empty-inline">No multi-game reports yet. Run one in Insights!</div>';
    } else {
      repEl.innerHTML = '';
      for (const r of saved) {
        const row = document.createElement('button');
        row.className = 'compact-game-row';
        row.innerHTML = `
          <span class="cg-opp">${escHtml(r.label)} (${r.game_count}g)</span>
          <span class="cg-meta">${r.avg_accuracy != null ? `${r.avg_accuracy}% acc` : ''} · ${r.win_rate ?? 0}% W</span>
        `;
        row.addEventListener('click', () => {
          switchAppView('insights');
          openSavedReport(r.id);
        });
        repEl.appendChild(row);
      }
    }
  }

  function renderHomeEloChart() {
    const accounts = pState.dashboard?.linked_accounts || [];
    const plat = pState.homeChartPlatform;
    const tc = pState.homeChartTc;

    let merged = [];
    for (const acc of accounts) {
      if (plat !== 'all' && acc.platform !== plat) continue;
      const pts = (acc.rating_history || {})[tc] || [];
      for (const p of pts) {
        merged.push({ ts: p.ts, y: p.rating, label: fmtDateShort(p.ts) });
      }
    }
    merged.sort((a, b) => a.ts - b.ts);

    const curEl = $('home-elo-current');
    const deltaEl = $('home-elo-delta');
    if (merged.length >= 1) {
      const cur = merged[merged.length - 1].y;
      const delta = cur - merged[0].y;
      curEl.textContent = String(cur);
      deltaEl.textContent = `${delta >= 0 ? '▲ +' : '▼ '}${delta}`;
      deltaEl.className = `elo-delta-pill ${delta >= 0 ? 'delta-up' : 'delta-down'}`;
    } else {
      curEl.textContent = '—';
      deltaEl.textContent = '';
    }

    $('home-elo-chart-wrap').innerHTML = renderLineAreaSvg(merged, { height: 195 });
  }

  // ── 8. MY GAMES Unified Library ─────────────────────────────────────
  async function loadGamesLibrary() {
    const emptyEl = $('lib-empty');
    const tableEl = $('lib-games-table');
    const tbody = $('lib-games-tbody');

    if (!pState.auth?.authenticated) {
      emptyEl.textContent = 'Sign in and connect Chess.com or Lichess to browse your full game library.';
      emptyEl.classList.remove('hidden');
      tableEl.classList.add('hidden');
      return;
    }

    const params = new URLSearchParams({
      platform: $('flt-platform').value,
      time_class: $('flt-tc').value,
      result: $('flt-result').value,
      color: $('flt-color').value,
      analysed: $('flt-analysed').value,
      sort_by: $('flt-sort').value,
      search: $('flt-search').value.trim(),
      limit: '120',
    });

    try {
      const data = await api(`/api/games?${params.toString()}`);
      $('games-lib-summary').textContent = `${data.total} matching games · ${data.analysed_count} analysed & cached in SQLite`;

      if (!data.games || data.games.length === 0) {
        emptyEl.textContent = 'No games match the current filters.';
        emptyEl.classList.remove('hidden');
        tableEl.classList.add('hidden');
        return;
      }

      emptyEl.classList.add('hidden');
      tableEl.classList.remove('hidden');
      tbody.innerHTML = '';

      for (const g of data.games) {
        const tr = document.createElement('tr');
        tr.className = 'lib-row';
        const myName = g.user_color === 'white' ? g.white_user : g.black_user;
        const myElo = g.user_color === 'white' ? g.white_elo : g.black_elo;
        const oppName = g.user_color === 'white' ? g.black_user : g.white_user;
        const oppElo = g.user_color === 'white' ? g.black_elo : g.white_elo;

        const accCell = g.analysed && g.user_accuracy != null
          ? `<span class="lib-acc-pill">${g.user_accuracy}%</span>`
          : '<span class="lib-unanalysed">Not analysed</span>';

        const hiParts = [];
        if (g.brilliants > 0) hiParts.push(`<span class="mini-clf clf-brilliant">${g.brilliants} !!</span>`);
        if (g.greats > 0) hiParts.push(`<span class="mini-clf clf-great">${g.greats} !</span>`);
        if (g.blunders > 0) hiParts.push(`<span class="mini-clf clf-blunder">${g.blunders} ??</span>`);
        if (g.misses > 0) hiParts.push(`<span class="mini-clf clf-miss">${g.misses} ✕</span>`);

        tr.innerHTML = `
          <td>
            <div class="lib-date">${fmtDateShort(g.end_time)}</div>
            <div class="lib-sub"><span class="platform-mini-tag tag-${g.platform}">${g.platform === 'chesscom' ? 'CC' : 'LI'}</span> ${escHtml(g.time_class)}</div>
          </td>
          <td>
            <div class="lib-match"><span class="color-sq sq-${g.user_color}"></span>${escHtml(myName)} (${myElo || '?'}) vs <strong>${escHtml(oppName)}</strong> (${oppElo || '?'})</div>
          </td>
          <td><span class="res-pill res-${g.user_result}">${g.user_result.toUpperCase()}</span></td>
          <td class="lib-opening">${escHtml(g.opening_name || g.opening_eco || '—')}</td>
          <td>${accCell}</td>
          <td class="lib-hi-cell">${hiParts.join(' ') || '—'}</td>
          <td><button class="btn btn-sm btn-secondary lib-open-btn">${g.analysed ? 'OPEN' : 'ANALYSE'}</button></td>
        `;

        tr.querySelector('.lib-open-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openLibraryGame(g.id);
        });
        tr.addEventListener('click', () => openLibraryGame(g.id));
        tbody.appendChild(tr);
      }
    } catch (err) {
      emptyEl.textContent = err.message;
      emptyEl.classList.remove('hidden');
      tableEl.classList.add('hidden');
    }
  }

  // ── 9. INSIGHTS Multi-Game Batch Analyser & Report Renderer ─────────
  async function loadSavedReportsList() {
    const listEl = $('ins-saved-list');
    if (!pState.auth?.authenticated) {
      listEl.innerHTML = '<div class="empty-inline">Sign in and link a Chess.com or Lichess account to generate multi-game reports.</div>';
      return;
    }

    try {
      const res = await api('/api/insights/reports');
      const reports = res.reports || [];
      if (!reports.length) {
        listEl.innerHTML = '<div class="empty-inline">No saved reports yet. Pick a time control &amp; period above and click Analyze!</div>';
        return;
      }

      listEl.innerHTML = '';
      for (const r of reports) {
        const card = document.createElement('div');
        card.className = 'saved-report-row' + (pState.activeReportId === r.id ? ' active-report' : '');
        card.innerHTML = `
          <div class="sr-left">
            <div class="sr-title">${escHtml(r.label)}</div>
            <div class="sr-sub">${r.game_count} games · ${fmtAgo(r.created_at)}</div>
          </div>
          <div class="sr-stats">
            <div class="sr-stat"><span class="sr-num val-teal">${r.brilliants || 0}</span><span class="sr-lbl">Brilliants</span></div>
            <div class="sr-stat"><span class="sr-num val-red">${r.blunders || 0}</span><span class="sr-lbl">Blunders</span></div>
            <div class="sr-stat"><span class="sr-num val-green">${r.win_rate ?? 0}%</span><span class="sr-lbl">Win rate</span></div>
            <div class="sr-stat"><span class="sr-num">${r.avg_accuracy != null ? r.avg_accuracy + '%' : '—'}</span><span class="sr-lbl">Avg acc</span></div>
            <button class="sr-del-btn" title="Delete report">✕</button>
          </div>
        `;
        card.addEventListener('click', () => openSavedReport(r.id));
        card.querySelector('.sr-del-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          await api(`/api/insights/reports/${r.id}`, 'DELETE');
          if (pState.activeReportId === r.id) {
            pState.activeReportId = null;
            $('ins-report-body').classList.add('hidden');
          }
          loadSavedReportsList();
        });
        listEl.appendChild(card);
      }

      // Auto-open most recent report if none is currently displayed
      if (!pState.activeReportId && reports.length > 0) {
        openSavedReport(reports[0].id);
      }
    } catch (_) {}
  }

  async function openSavedReport(reportId) {
    try {
      const res = await api(`/api/insights/reports/${reportId}`);
      pState.activeReportId = reportId;
      renderInsightsReport(res.report, res.label);
      document.querySelectorAll('.saved-report-row').forEach((el) => el.classList.remove('active-report'));
    } catch (err) {
      alert(`Could not load report: ${err.message}`);
    }
  }

  async function startBatchInsights(overrides = {}) {
    if (!pState.auth?.authenticated) {
      openAccountModal();
      return;
    }

    const tc = overrides.time_class || pState.insTc;
    const period = overrides.period_days !== undefined ? overrides.period_days : pState.insPeriod;
    const plat = overrides.platform || pState.insPlatform;
    const parsedMax = parseInt($('ins-max-games')?.value ?? '40', 10);
    // Preserve `0` ("All games") instead of falling back to 40
    const maxGames = overrides.max_games !== undefined
      ? overrides.max_games
      : (Number.isNaN(parsedMax) ? 40 : parsedMax);

    pState.cancelRequested = false;
    clearTimeout(pState.jobPollTimer);
    if (pState.startAbortCtrl) {
      try { pState.startAbortCtrl.abort(); } catch (_) {}
    }
    pState.startAbortCtrl = new AbortController();

    const progBox = $('ins-progress-box');
    progBox.classList.remove('hidden');
    $('ins-progress-label').textContent = maxGames === 0
      ? 'Syncing full game history & starting Stockfish...'
      : 'Syncing games & starting Stockfish batch worker...';
    $('ins-progress-stats').textContent = 'Starting...';
    $('ins-progress-fill').style.width = '4%';
    $('ins-analyze-btn').disabled = true;

    try {
      const job = await api('/api/insights/analyze', 'POST', {
        platform: plat,
        time_class: tc,
        period_days: period,
        max_games: maxGames,
        depth: 8,
        sync_first: true,
      }, pState.startAbortCtrl.signal);
      pState.startAbortCtrl = null;
      if (pState.cancelRequested) {
        api(`/api/insights/jobs/${job.id}/cancel`, 'POST').catch(() => {});
        return;
      }
      pState.activeJobId = job.id;
      pollBatchJob(job.id);
    } catch (err) {
      pState.startAbortCtrl = null;
      if (err.name === 'AbortError' || pState.cancelRequested) {
        return;
      }
      $('ins-progress-label').textContent = `Error: ${err.message}`;
      $('ins-analyze-btn').disabled = false;
    }
  }

  function pollBatchJob(jobId) {
    clearTimeout(pState.jobPollTimer);
    const tick = async () => {
      if (pState.cancelRequested || pState.activeJobId !== jobId) return;
      try {
        const job = await api(`/api/insights/jobs/${jobId}`);
        if (pState.cancelRequested || pState.activeJobId !== jobId) return;

        const total = Math.max(1, job.total_games || 1);
        const done = job.completed_games || 0;
        const pct = Math.min(100, Math.round((done / total) * 100));

        $('ins-progress-label').textContent = job.current_label || 'Analysing...';
        $('ins-progress-stats').textContent = `${done}/${job.total_games} (${job.cached_games} cached · ${job.brilliants_found} !!)`;
        $('ins-progress-fill').style.width = `${pct}%`;

        if (job.status === 'cancelled') {
          $('ins-analyze-btn').disabled = false;
          pState.activeJobId = null;
          $('ins-progress-box').classList.add('hidden');
          await loadSavedReportsList();
          return;
        }

        if (job.status === 'done' || job.status === 'failed') {
          $('ins-analyze-btn').disabled = false;
          pState.activeJobId = null;
          if (job.status === 'done' && job.report_id) {
            await loadSavedReportsList();
            await openSavedReport(job.report_id);
          }
          setTimeout(() => $('ins-progress-box').classList.add('hidden'), 1800);
          return;
        }
        pState.jobPollTimer = setTimeout(tick, 650);
      } catch (_) {
        $('ins-analyze-btn').disabled = false;
      }
    };
    tick();
  }

  function renderInsightsReport(rep, label = '') {
    const body = $('ins-report-body');
    if (!rep) {
      body.classList.add('hidden');
      return;
    }
    body.classList.remove('hidden');

    // 1. Chester Verdict
    $('ins-verdict-text').textContent = rep.chester_verdict || '';

    // 2. Hero ELO Chart
    $('ins-elo-title').textContent = (label || 'ELO PROGRESSION').toUpperCase();
    const elo = rep.elo || {};
    $('ins-elo-current').textContent = elo.current != null ? String(elo.current) : '—';
    const dEl = $('ins-elo-delta');
    if (elo.current != null) {
      dEl.textContent = `${elo.delta >= 0 ? '▲ +' : '▼ '}${elo.delta}`;
      dEl.className = `elo-delta-pill ${elo.delta >= 0 ? 'delta-up' : 'delta-down'}`;
    } else {
      dEl.textContent = '';
    }
    $('ins-elo-chart').innerHTML = renderLineAreaSvg(
      (elo.series || []).map((p) => ({ label: p.date, y: p.rating })),
      { height: 190 }
    );

    // 3. 10-Tile KPI Grid
    const k = rep.kpis || {};
    const kpiItems = [
      { val: k.avg_accuracy != null ? `${k.avg_accuracy}%` : '—', lbl: 'Avg accuracy' },
      { val: k.games ?? 0, lbl: 'Games' },
      { val: `${k.win_rate ?? 0}%`, lbl: 'Win rate', cls: 'val-green' },
      { val: k.avg_acpl != null ? `${k.avg_acpl} cp` : '—', lbl: 'Avg Centipawn Loss' },
      { val: k.brilliants ?? 0, lbl: 'Brilliants', cls: 'val-teal' },
      { val: k.blunders ?? 0, lbl: 'Blunders', cls: 'val-red' },
      { val: k.blunders_per_game ?? 0, lbl: 'Blunders / game', cls: 'val-red' },
      { val: k.best_game_accuracy != null ? `${k.best_game_accuracy}%` : '—', lbl: 'Best game' },
      { val: k.period_peak_elo ?? '—', lbl: 'Period Peak ELO', cls: 'val-purple' },
      { val: k.all_time_best_elo ?? '—', lbl: 'All-time Best ELO', cls: 'val-amber' },
    ];
    $('ins-kpi-grid').innerHTML = kpiItems
      .map((item) => `<div class="kpi-tile"><div class="kpi-val ${item.cls || ''}">${escHtml(String(item.val))}</div><div class="kpi-lbl">${item.lbl}</div></div>`)
      .join('');

    // 4. Highlights Strip (clickable to open game!)
    const hi = rep.highlights || {};
    const hiEl = $('ins-highlights-grid');
    hiEl.innerHTML = '';
    const hiCards = [
      { icon: '🔥', val: `${hi.longest_win_streak || 0}`, title: 'Longest win streak', sub: 'games in a row', gameId: null },
      {
        icon: '★',
        val: hi.best_game ? `${hi.best_game.accuracy}%` : '—',
        title: 'Best game accuracy',
        sub: hi.best_game ? `vs ${hi.best_game.opponent}` : 'Analyse games first',
        gameId: hi.best_game?.game_id,
      },
      {
        icon: '⚔',
        val: hi.biggest_upset ? `+${hi.biggest_upset.diff}` : '—',
        title: 'Biggest upset',
        sub: hi.biggest_upset ? `beat ${hi.biggest_upset.opponent} (${hi.biggest_upset.opp_elo})` : 'No upset win in period',
        gameId: hi.biggest_upset?.game_id,
      },
      {
        icon: '⚡',
        val: hi.fastest_mate ? `${hi.fastest_mate.moves} moves` : '—',
        title: 'Fastest checkmate',
        sub: hi.fastest_mate ? `vs ${hi.fastest_mate.opponent}` : 'No checkmate win yet',
        gameId: hi.fastest_mate?.game_id,
      },
    ];
    for (const c of hiCards) {
      const div = document.createElement(c.gameId ? 'button' : 'div');
      div.className = 'highlight-card' + (c.gameId ? ' clickable-card' : '');
      div.innerHTML = `
        <span class="hi-icon">${c.icon}</span>
        <div>
          <div class="hi-val">${escHtml(c.val)}</div>
          <div class="hi-title">${escHtml(c.title)}</div>
          <div class="hi-sub">${escHtml(c.sub)}</div>
        </div>`;
      if (c.gameId) div.addEventListener('click', () => openLibraryGame(c.gameId));
      hiEl.appendChild(div);
    }

    // 5. Charts Row: Accuracy Over Time + Results Donut + Move Quality Donut
    $('ins-acc-chart').innerHTML = renderLineAreaSvg(
      (rep.accuracy_over_time || []).map((d) => ({ label: d.date, y: d.accuracy, ma: d.moving_avg })),
      { height: 170, minY: 0, maxY: 100, suffix: '%', showMa: true, color: '#2E6F40', fill: 'rgba(46, 111, 64, 0.14)' }
    );

    const resData = rep.results || {};
    $('ins-results-donut').innerHTML = renderDonutSvg(
      [
        { label: 'Wins', value: resData.wins || 0, color: '#2E7D32' },
        { label: 'Draws', value: resData.draws || 0, color: '#A67B5B' },
        { label: 'Losses', value: resData.losses || 0, color: '#B71C1C' },
      ],
      `${k.win_rate ?? 0}%`
    );

    const mq = rep.move_quality || {};
    $('ins-quality-donut').innerHTML = renderDonutSvg(
      [
        { label: 'Brilliant', value: mq.brilliant || 0, color: '#1B9AAA' },
        { label: 'Great', value: mq.great || 0, color: '#4A7C9B' },
        { label: 'Best', value: mq.best || 0, color: '#2E7D32' },
        { label: 'Excellent', value: mq.excellent || 0, color: '#5B8C5A' },
        { label: 'Good', value: mq.good || 0, color: '#7FA86E' },
        { label: 'Book', value: mq.book || 0, color: '#A67B5B' },
        { label: 'Inaccuracy', value: mq.inaccuracy || 0, color: '#D9822B' },
        { label: 'Mistake', value: mq.mistake || 0, color: '#D9534F' },
        { label: 'Miss', value: mq.miss || 0, color: '#D46A5E' },
        { label: 'Blunder', value: mq.blunder || 0, color: '#B71C1C' },
      ],
      'MOVES'
    );

    // 6. Phase Accuracy Bars + Conversion & Tactics
    const ph = rep.phase_accuracy || {};
    $('ins-phase-bars').innerHTML = ['opening', 'middlegame', 'endgame']
      .map((name) => {
        const val = ph[name];
        const h = val != null ? Math.max(8, Math.min(100, val)) : 0;
        return `
          <div class="phase-col">
            <div class="phase-val-lbl">${val != null ? `${val}%` : '—'}</div>
            <div class="phase-bar-bg"><div class="phase-bar-fg" style="height:${h}%"></div></div>
            <div class="phase-name-lbl">${name.toUpperCase()}</div>
          </div>`;
      })
      .join('');

    const conv = rep.conversion || {};
    const tac = rep.tactics_punishment || {};
    $('ins-conv-tac').innerHTML = `
      <div class="mini-metric-box">
        <div class="mm-title">Conversion</div>
        <div class="mm-val">${conv.rate != null ? `${conv.rate}%` : '—'}</div>
        <div class="mm-sub">Games won from winning pos: ${conv.won || 0} of ${conv.total || 0}</div>
      </div>
      <div class="mini-metric-box">
        <div class="mm-title">Tactics</div>
        <div class="mm-val">${tac.rate != null ? `${tac.rate}%` : '—'}</div>
        <div class="mm-sub">Opponent blunders punished: ${tac.punished || 0} of ${tac.total || 0}</div>
      </div>`;

    // Blunder Direction + Mistakes Matrix
    const bd = rep.blunder_direction || {};
    $('ins-blunder-dir').innerHTML = `
      <div class="bd-bar">
        <div class="bd-seg bd-allowed" style="width:${bd.allowed_pct || 50}%">${bd.allowed_pct || 50}%</div>
        <div class="bd-seg bd-missed" style="width:${bd.missed_pct || 50}%">${bd.missed_pct || 50}%</div>
      </div>
      <div class="bd-legend">
        <span><strong class="val-red">Allowed · ${bd.allowed || 0}</strong> (You created a weakness)</span>
        <span><strong class="val-amber">Missed · ${bd.missed || 0}</strong> (Missed opponent's weakness)</span>
      </div>`;

    const mm = rep.mistakes_matrix || {};
    $('ins-mistakes-matrix').innerHTML = `
      <table class="matrix-table">
        <thead>
          <tr><th>Phase</th><th class="val-amber">Inaccuracy</th><th class="val-orange">Mistake</th><th class="val-red">Blunder</th></tr>
        </thead>
        <tbody>
          ${['opening', 'middlegame', 'endgame']
            .map((st) => {
              const row = mm[st] || {};
              return `<tr>
                <td class="mx-phase">${st.toUpperCase()}</td>
                <td class="mx-cell mx-inacc">${row.inaccuracy || 0}</td>
                <td class="mx-cell mx-mist">${row.mistake || 0}</td>
                <td class="mx-cell mx-blun">${row.blunder || 0}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;

    // 7. How Your Games End
    const endData = rep.game_endings || {};
    const termColors = {
      checkmate: '#7E57C2',
      resignation: '#3F7CAC',
      timeout: '#D9822B',
      abandoned: '#8C5A3C',
      stalemate: '#5B8C5A',
      repetition: '#C08552',
      insufficient: '#A67B5B',
      agreed: '#6B5B95',
      other: '#999999',
    };
    $('ins-endings-grid').innerHTML = ['wins', 'losses', 'draws']
      .map((bucket) => {
        const obj = endData[bucket] || {};
        const tot = Object.values(obj).reduce((a, b) => a + b, 0);
        const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
        const segs = entries
          .map(([kName, cnt]) => {
            const pct = tot ? (cnt / tot) * 100 : 0;
            return `<div class="end-seg" style="width:${pct.toFixed(1)}%;background:${termColors[kName] || '#8C5A3C'}" title="${kName}: ${cnt}"></div>`;
          })
          .join('');
        const labels = entries
          .slice(0, 4)
          .map(([kName, cnt]) => `<span><i class="end-dot" style="background:${termColors[kName] || '#8C5A3C'}"></i>${escHtml(kName)} ${tot ? Math.round((cnt / tot) * 100) : 0}%</span>`)
          .join('');
        return `
          <div class="ending-col">
            <div class="ending-top"><strong>${bucket.toUpperCase()}</strong><span>${tot} games</span></div>
            <div class="ending-track">${segs || '<div class="end-seg" style="width:100%;background:rgba(43,26,18,0.1)"></div>'}</div>
            <div class="ending-labels">${labels || '<span>—</span>'}</div>
          </div>`;
      })
      .join('');

    // 8. Openings Repertoire Split (As White vs As Black)
    const ops = rep.openings || { white: [], black: [] };
    const renderOpCol = (title, rows) => {
      if (!rows || !rows.length) {
        return `<div class="op-col"><div class="op-col-head">${title}</div><div class="empty-inline">No recognized openings yet.</div></div>`;
      }
      return `
        <div class="op-col">
          <div class="op-col-head">${title}</div>
          ${rows
            .map((r) => {
              const wPct = Math.round((r.wins / r.games) * 100);
              const dPct = Math.round((r.draws / r.games) * 100);
              const lPct = Math.max(0, 100 - wPct - dPct);
              return `
                <div class="op-row">
                  <div class="op-row-top">
                    <span class="op-name">${escHtml(r.name)}</span>
                    <span class="op-meta">${r.games} games · <strong class="${r.win_rate >= 50 ? 'val-green' : 'val-amber'}">${r.win_rate}%</strong></span>
                  </div>
                  <div class="op-bar-track">
                    <div class="op-seg-w" style="width:${wPct}%"></div>
                    <div class="op-seg-d" style="width:${dPct}%"></div>
                    <div class="op-seg-l" style="width:${lPct}%"></div>
                  </div>
                </div>`;
            })
            .join('')}
        </div>`;
    };
    $('ins-openings-grid').innerHTML = renderOpCol('○ AS WHITE', ops.white) + renderOpCol('● AS BLACK', ops.black);

    // 9. Best Moments Showcase (Clickable Brilliants / Great Moves)
    const moments = rep.best_moments || [];
    const mCard = $('ins-moments-card');
    const mGrid = $('ins-moments-grid');
    if (!moments.length) {
      mCard.classList.add('hidden');
    } else {
      mCard.classList.remove('hidden');
      mGrid.innerHTML = '';
      for (const m of moments) {
        const btn = document.createElement('button');
        btn.className = 'moment-chip';
        btn.innerHTML = `
          <span class="mini-clf clf-${m.classification}">${m.classification === 'brilliant' ? '!!' : '!'}</span>
          <span class="moment-san">Move ${m.move_number}: ${escHtml(m.san)} (${escHtml(m.eval_after)})</span>
          <span class="moment-opp">vs ${escHtml(m.opponent)}</span>`;
        btn.addEventListener('click', () => openLibraryGame(m.game_id, m.ply));
        mGrid.appendChild(btn);
      }
    }
  }

  // ── 10. Event Wiring & Bootstrap ────────────────────────────────────
  function bindPillGroup(containerId, onSelect) {
    const el = $(containerId);
    if (!el) return;
    el.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.val);
      });
    });
  }

  function initPlatform() {
    initBrandArt();

    // Topbar & Mobile Bottom Tab Navigation
    $('brand-home-btn')?.addEventListener('click', () => switchAppView('home'));
    document.querySelectorAll('.nav-view-btn, .mobile-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchAppView(btn.dataset.view));
    });

    // If user uses the quick Chess.com box in topbar, jump to ANALYZE automatically
    $('chesscom-btn')?.addEventListener('click', () => switchAppView('analyze'));
    $('chesscom-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') switchAppView('analyze');
    });

    // Landing Navbar smooth scrolling & navigation
    $('lp-brand-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      $('view-home')?.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.querySelectorAll('[data-lp-scroll]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = $(link.dataset.lpScroll);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    $('lp-open-board-btn')?.addEventListener('click', () => switchAppView('analyze'));
    $('lp-open-settings-btn')?.addEventListener('click', () => switchAppView('settings'));
    $('lp-sand-board-btn')?.addEventListener('click', () => switchAppView('analyze'));
    $('lp-signin-btn')?.addEventListener('click', openAccountModal);

    // Settings Tab Controls (Dark Mode + Board Preferences)
    applyTheme(getTheme());
    $('setting-darkmode-toggle')?.addEventListener('click', () => {
      applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
    $('setting-sound-toggle')?.addEventListener('click', () => {
      $('btn-rail-sound')?.click();
      setTimeout(syncSettingsToggles, 20);
    });
    $('setting-coords-toggle')?.addEventListener('click', () => {
      $('btn-rail-coords')?.click();
      setTimeout(syncSettingsToggles, 20);
    });
    $('setting-open-account-btn')?.addEventListener('click', openAccountModal);

    // Landing Hero & Footer CTAs
    $('lp-hero-cta')?.addEventListener('click', handlePrimaryLandingCta);
    $('lp-footer-cta')?.addEventListener('click', handlePrimaryLandingCta);
    $('lp-hero-sample')?.addEventListener('click', () => {
      switchAppView('analyze');
      global.BlunderlessBoard?.loadSample();
    });

    // Interactive Chester Portrait (cycles mood, quip & eval chip)
    $('lp-chester-btn')?.addEventListener('click', () => {
      _heroQuipIdx = (_heroQuipIdx + 1) % HERO_QUIPS.length;
      const q = HERO_QUIPS[_heroQuipIdx];
      const stage = $('lp-chester-stage');
      if (stage) stage.dataset.state = q.state;
      if ($('lp-chester-quip')) $('lp-chester-quip').textContent = q.text;
      if ($('lp-chester-mood')) $('lp-chester-mood').textContent = q.mood;
      if ($('lp-chester-eval')) $('lp-chester-eval').textContent = q.evalTag;
    });

    // Sample Review phase switcher inside the elevated card
    document.querySelectorAll('#lp-sample-tabs .lp-phase-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10) || 0;
        const item = SAMPLE_REVIEWS[idx];
        if (!item) return;
        document.querySelectorAll('#lp-sample-tabs .lp-phase-tab').forEach((b) => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if ($('lp-demo-stage')) $('lp-demo-stage').textContent = item.stage;
        if ($('lp-demo-title')) $('lp-demo-title').textContent = item.title;
        if ($('lp-demo-eval')) $('lp-demo-eval').textContent = item.evalShift;
        if ($('lp-demo-engine')) $('lp-demo-engine').textContent = item.engine;
        if ($('lp-demo-chester')) $('lp-demo-chester').textContent = item.chester;
      });
    });

    // Quick Connect Form
    $('lp-connect-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLinkAccount($('qc-platform').value, $('qc-username').value, $('qc-status'), $('qc-link-btn'));
    });

    // Home Dashboard controls
    $('home-sync-btn')?.addEventListener('click', async () => {
      const btn = $('home-sync-btn');
      btn.disabled = true;
      btn.textContent = '↻ SYNCING...';
      try {
        await api('/api/accounts/sync', 'POST', { platform: 'all', limit: 80 });
        await loadHomeDashboard();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '↻ SYNC GAMES & ELO';
      }
    });
    $('home-go-insights-btn')?.addEventListener('click', () => switchAppView('insights'));
    $('home-see-all-games')?.addEventListener('click', () => switchAppView('games'));
    $('home-see-all-reports')?.addEventListener('click', () => switchAppView('insights'));

    bindPillGroup('home-chart-platform-pills', (v) => {
      pState.homeChartPlatform = v;
      renderHomeEloChart();
    });
    bindPillGroup('home-chart-tc-pills', (v) => {
      pState.homeChartTc = v;
      renderHomeEloChart();
    });

    // Account Modal
    $('account-pill-btn')?.addEventListener('click', openAccountModal);
    $('modal-close-btn')?.addEventListener('click', closeAccountModal);
    $('account-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'account-modal') closeAccountModal();
    });
    $('modal-google-btn')?.addEventListener('click', handleGoogleSignIn);
    $('modal-local-btn')?.addEventListener('click', async () => {
      const name = $('modal-local-name').value.trim();
      if (!name) return;
      try {
        await api('/api/auth/local', 'POST', { display_name: name });
        $('modal-status').textContent = `Signed in as ${name}! Now connect Chess.com or Lichess below.`;
        await refreshAuth();
        await loadHomeDashboard();
      } catch (err) {
        $('modal-status').textContent = `Error: ${err.message}`;
      }
    });
    $('modal-logout-btn')?.addEventListener('click', async () => {
      await api('/api/auth/logout', 'POST');
      await refreshAuth();
      await loadHomeDashboard();
    });
    $('modal-cc-link-btn')?.addEventListener('click', () => {
      handleLinkAccount('chesscom', $('modal-cc-input').value, $('modal-status'), $('modal-cc-link-btn'));
    });
    $('modal-li-link-btn')?.addEventListener('click', () => {
      handleLinkAccount('lichess', $('modal-li-input').value, $('modal-status'), $('modal-li-link-btn'));
    });
    $('modal-cc-unlink')?.addEventListener('click', async () => {
      await api('/api/accounts/chesscom', 'DELETE');
      await refreshAuth();
      await loadHomeDashboard();
    });
    $('modal-li-unlink')?.addEventListener('click', async () => {
      await api('/api/accounts/lichess', 'DELETE');
      await refreshAuth();
      await loadHomeDashboard();
    });

    // MY GAMES Filters & Actions
    ['flt-platform', 'flt-tc', 'flt-result', 'flt-color', 'flt-analysed', 'flt-sort'].forEach((id) => {
      $(id)?.addEventListener('change', loadGamesLibrary);
    });
    let searchDeb = null;
    $('flt-search')?.addEventListener('input', () => {
      clearTimeout(searchDeb);
      searchDeb = setTimeout(loadGamesLibrary, 260);
    });
    $('lib-sync-btn')?.addEventListener('click', async () => {
      const btn = $('lib-sync-btn');
      btn.disabled = true;
      btn.textContent = '↻ SYNCING...';
      try {
        await api('/api/accounts/sync', 'POST', { platform: 'all', limit: 100 });
        await loadGamesLibrary();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '↻ SYNC 80 GAMES';
      }
    });
    $('lib-batch-btn')?.addEventListener('click', () => {
      switchAppView('insights');
      startBatchInsights({ time_class: 'all', period_days: 0, max_games: 20 });
    });

    // INSIGHTS Report Builder Pills
    bindPillGroup('ins-tc-pills', (v) => {
      pState.insTc = v;
      $('ins-analyze-btn').textContent = `ANALYZE ${v.toUpperCase()}`;
    });
    bindPillGroup('ins-period-pills', (v) => {
      pState.insPeriod = parseInt(v, 10) || 0;
      // Selecting "All time" automatically switches Max Games to "All games" (0)
      if (pState.insPeriod === 0 && $('ins-max-games')) {
        $('ins-max-games').value = '0';
      }
    });
    bindPillGroup('ins-platform-pills', (v) => {
      pState.insPlatform = v;
    });
    $('ins-analyze-btn')?.addEventListener('click', () => startBatchInsights());
    $('ins-cancel-btn')?.addEventListener('click', async () => {
      // Stop UI & polling immediately so cancellation feels instant
      pState.cancelRequested = true;
      clearTimeout(pState.jobPollTimer);
      if (pState.startAbortCtrl) {
        try { pState.startAbortCtrl.abort(); } catch (_) {}
        pState.startAbortCtrl = null;
      }
      const jobToCancel = pState.activeJobId;
      pState.activeJobId = null;

      $('ins-analyze-btn').disabled = false;
      $('ins-progress-label').textContent = 'Cancelled — no report saved.';
      $('ins-progress-stats').textContent = '';
      setTimeout(() => {
        if (!pState.activeJobId) $('ins-progress-box')?.classList.add('hidden');
      }, 650);

      if (jobToCancel) {
        try {
          await api(`/api/insights/jobs/${jobToCancel}/cancel`, 'POST');
        } catch (_) {}
        await loadSavedReportsList();
      }
    });

    $('modal-local-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('modal-local-btn')?.click();
    });
    $('modal-cc-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('modal-cc-link-btn')?.click();
    });
    $('modal-li-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('modal-li-link-btn')?.click();
    });

    // Initial boot: restore auth + view and surface any OAuth callback status
    const urlParams = new URLSearchParams(window.location.search);
    const authError = urlParams.get('auth_error');
    const authOk = urlParams.get('auth');
    if (authError || authOk) {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (_) {}
    }

    refreshAuth().then(() => {
      let startView = 'home';
      try {
        const saved = sessionStorage.getItem('blunderless_view');
        if (saved && ['home', 'analyze', 'games', 'insights', 'settings'].includes(saved)) startView = saved;
      } catch (_) {}
      switchAppView(startView);

      if (authError) {
        openAccountModal();
        $('modal-status').textContent = authError;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initPlatform);
  global.BlunderlessPlatform = { switchAppView, openLibraryGame, openAccountModal };
})(window);
