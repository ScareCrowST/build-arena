/* =====================================================================
   BUILD ARENA — клиент: экраны, Supabase (аккаунты, матчмейкинг, Elo),
   сеть матча (Realtime Broadcast), ввод и игровой цикл.
   ===================================================================== */
(() => {
  'use strict';
  const { C, World, MODS } = window.Sim;
  const L = (k, v) => window.I18N.t(k, v);
  const cfg = window.GAME_CONFIG || {};
  const sb = (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/YOUR/i.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY))
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const now = () => performance.now();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sfx = (n, v) => { if (window.SFX) window.SFX.play(n, v); };

  let user = null, profile = null;

  /* ============================== экраны ============================== */
  let curScreen = null, subFrom = 'menu';
  function show(id) {
    const same = curScreen === id;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    document.body.classList.toggle('in-game', id === 'game');
    if (curScreen === 'menu' && id !== 'menu') stopTips();
    curScreen = id;
    if (id === 'game') window.MenuBG.stop(); else window.MenuBG.start();
    if (!same) window.Wipe.go();
    if (id === 'menu') onMenuShown();
  }
  let toastT = 0;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms || 3600);
  }

  let modalResolve = null;
  function ask(titleKey, textKey, yesKey, noKey) {
    return new Promise(res => {
      if (modalResolve) modalResolve(false);
      modalResolve = res;
      $('modal-title').textContent = L(titleKey); $('modal-text').textContent = L(textKey);
      $('modal-yes').textContent = L(yesKey); $('modal-no').textContent = L(noKey);
      $('modal').classList.remove('hidden');
      sfx('open');
    });
  }
  function closeModal(v) {
    $('modal').classList.add('hidden');
    const r = modalResolve; modalResolve = null;
    if (r) r(v);
  }
  const modalOpen = () => !$('modal').classList.contains('hidden');

  function animateNumber(el, from, to, ms, fmt) {
    const t0 = now();
    (function tick() {
      const k = clamp((now() - t0) / ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(tick);
    })();
  }

  /* ============================ авторизация ============================ */
  let regMode = false;
  function setMode(reg) {
    regMode = reg;
    $('tab-login').classList.toggle('active', !reg);
    $('tab-register').classList.toggle('active', reg);
    $('row-name').classList.toggle('hidden', !reg);
    $('btn-auth').textContent = L(reg ? 'auth_btn_register' : 'auth_btn_login');
  }
  function authError(e) {
    const m = (e && e.message) || String(e);
    if (/Invalid login/i.test(m)) return L('err_invalid');
    if (/already registered/i.test(m)) return L('err_exists');
    if (/Database error saving new user/i.test(m)) return L('err_nickbad');
    if (/Email not confirmed/i.test(m)) return L('err_confirm');
    return m;
  }
  async function doAuth() {
    if (!sb) return toast(L('err_config'));
    const email = $('in-email').value.trim(), pass = $('in-pass').value, name = $('in-name').value.trim();
    if (!email || pass.length < 6) return toast(L('err_fill'));
    const btn = $('btn-auth'); btn.disabled = true;
    try {
      if (regMode) {
        if (!/^[\wА-Яа-яЁё]{3,16}$/.test(name)) { toast(L('err_nick')); return; }
        const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { username: name } } });
        if (error) throw error;
        if (!data.session) { toast(L('msg_created'), 6000); setMode(false); return; }
        user = data.user;
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        user = data.user;
      }
      await loadProfile();
      show('menu');
    } catch (e) { toast(authError(e)); } finally { btn.disabled = false; }
  }
  async function loadProfile() {
    if (!sb || !user) return;
    for (let i = 0; i < 3; i++) {
      const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) { profile = data; return; }
      await sleep(500);
    }
  }
  async function logout() {
    if (!user) { show('auth'); return; }
    if (sb) await sb.auth.signOut();
    user = null; profile = null; shownRating = null;
    show(sb ? 'auth' : 'menu');
  }

  /* ============================== меню ============================== */
  const RANKS = [
    { min: 0, key: 'rank_bronze', col: '#d39a69' }, { min: 900, key: 'rank_silver', col: '#c9d4e6' },
    { min: 1100, key: 'rank_gold', col: '#ffd34d' }, { min: 1300, key: 'rank_plat', col: '#5ef0d4' },
    { min: 1500, key: 'rank_diamond', col: '#6fb7ff' }, { min: 1700, key: 'rank_master', col: '#d68cff' }
  ];
  function rankOf(r) {
    let i = 0;
    for (let k = 0; k < RANKS.length; k++) if (r >= RANKS[k].min) i = k;
    return { i, cur: RANKS[i], next: RANKS[i + 1] || null };
  }

  let shownRating = null;
  function renderMenu() {
    $('offline-note').classList.toggle('hidden', !!sb);
    $('btn-find').disabled = !sb || !profile;
    $('btn-board').disabled = !sb;
    $('btn-logout').classList.toggle('hidden', !sb);
    $('logout-txt').textContent = L(user ? 'menu_logout' : 'menu_login');
    const av = $('me-avatar');
    if (profile) {
      const rk = rankOf(profile.rating);
      $('me-name').textContent = profile.username;
      $('me-initial').textContent = profile.username.charAt(0).toUpperCase();
      $('me-sub').textContent = '';
      av.style.setProperty('--rc', rk.cur.col);
      if (shownRating === null) { $('me-rating').textContent = profile.rating; }
      else if (shownRating !== profile.rating) animateNumber($('me-rating'), shownRating, profile.rating, 900, v => String(v));
      else $('me-rating').textContent = profile.rating;
      shownRating = profile.rating;
      const rEl = $('me-rank'); rEl.textContent = L(rk.cur.key); rEl.style.color = rk.cur.col;
      const fill = $('me-rank-fill');
      if (rk.next) {
        $('me-next').textContent = L('rank_to_next', { r: L(rk.next.key), n: rk.next.min - profile.rating });
        fill.style.width = clamp((profile.rating - rk.cur.min) / (rk.next.min - rk.cur.min), 0.04, 1) * 100 + '%';
      } else { $('me-next').textContent = L('rank_max'); fill.style.width = '100%'; }
      $('st-games').textContent = profile.games; $('st-wins').textContent = profile.wins;
      $('st-wr').textContent = (profile.games ? Math.round(profile.wins / profile.games * 100) : 0) + '%';
    } else {
      $('me-name').textContent = L('guest');
      $('me-initial').textContent = '?';
      $('me-sub').textContent = L(sb ? 'guest_sub_online' : 'guest_sub_offline');
      av.style.setProperty('--rc', '#8da0c4');
      $('me-rating').textContent = '—';
      $('me-rank').textContent = ''; $('me-next').textContent = '';
      $('me-rank-fill').style.width = '0%';
      $('st-games').textContent = '0'; $('st-wins').textContent = '0'; $('st-wr').textContent = '0%';
    }
  }

  let topData = null;
  function renderTop() {
    const ol = $('top-list'); ol.textContent = '';
    if (!topData || !topData.length) {
      const li = document.createElement('li'); li.className = 'muted'; li.textContent = L('top_empty'); ol.appendChild(li); return;
    }
    topData.forEach((p, i) => {
      const li = document.createElement('li'); li.style.setProperty('--i', i);
      const a = document.createElement('span'); a.className = 'pos'; a.textContent = i + 1;
      const b = document.createElement('span'); b.className = 'nm'; b.textContent = p.username;
      const c = document.createElement('span'); c.className = 'rt'; c.textContent = p.rating;
      li.appendChild(a); li.appendChild(b); li.appendChild(c); ol.appendChild(li);
    });
  }
  async function loadTop() {
    if (!sb) { topData = []; renderTop(); return; }
    try {
      const { data } = await sb.from('profiles').select('username,rating').order('rating', { ascending: false }).limit(5);
      topData = data || [];
    } catch (e) { topData = []; }
    renderTop();
  }

  let tipIdx = 0, tipTimer = 0;
  function showTip(animate) {
    const p = $('tip-text');
    const set = () => { p.textContent = L('tip' + (tipIdx % 6 + 1)); p.classList.remove('out'); };
    if (animate) { p.classList.add('out'); setTimeout(set, 380); } else set();
  }
  function startTips() {
    stopTips();
    tipIdx = Math.floor(Math.random() * 6); showTip(false);
    tipTimer = setInterval(() => { tipIdx++; showTip(true); }, 7000);
  }
  function stopTips() { clearInterval(tipTimer); tipTimer = 0; }

  function onMenuShown() { renderMenu(); loadTop(); startTips(); }

  /* ============================ таблица лидеров ============================ */
  async function openBoard() {
    show('board');
    const body = $('board-body');
    body.textContent = '';
    const { data, error } = await sb.from('profiles').select('username,rating,games,wins')
      .order('rating', { ascending: false }).limit(50);
    if (error) { toast(L('board_err')); return; }
    (data || []).forEach((p, i) => {
      const tr = document.createElement('tr');
      tr.style.setProperty('--i', i);
      if (profile && p.username === profile.username) tr.className = 'me';
      [i + 1, p.username, p.rating, p.games, p.wins].forEach((v, k) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (k === 2) td.className = 'r';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  /* ============================== помощь ============================== */
  function buildHelp() {
    const box = $('help-body');
    if (!box) return;
    box.textContent = '';
    const mk = (cls, i) => { const d = document.createElement('div'); d.className = 'help-item' + (cls ? ' ' + cls : ''); d.style.setProperty('--i', i); return d; };
    const add = (d, h, p) => {
      const hh = document.createElement('h4'); hh.textContent = h; d.appendChild(hh);
      if (p) { const pp = document.createElement('p'); pp.textContent = p; d.appendChild(pp); }
    };
    [['help_goal', 'help_goal_t'], ['help_build', 'help_build_t'], ['help_mats', 'help_mats_t'], ['help_levels', 'help_levels_t']].forEach((it, i) => {
      const d = mk('', i); add(d, L(it[0]), L(it[1])); box.appendChild(d);
    });
    const md = mk('wide', 4); add(md, L('help_mods'), L('help_mods_t'));
    const grid = document.createElement('div'); grid.className = 'mod-grid';
    MODS.forEach((m, id) => {
      const card = document.createElement('div'); card.className = 'mod-card';
      const cvs = document.createElement('canvas'); cvs.width = 88; cvs.height = 88;
      window.Render.drawModIcon(cvs.getContext('2d'), id, 44, 44, 26, window.Render.MODCOL[m], 1);
      const tx = document.createElement('div');
      const b = document.createElement('b'); b.textContent = L('mod_' + m);
      const s = document.createElement('span'); s.textContent = L('mod_' + m + '_d');
      tx.appendChild(b); tx.appendChild(s); card.appendChild(cvs); card.appendChild(tx); grid.appendChild(card);
    });
    md.appendChild(grid); box.appendChild(md);
    const kd = mk('wide', 5); add(kd, L('help_controls'));
    const line = document.createElement('div'); line.className = 'keys-line';
    window.Settings.ACTIONS.forEach(a => {
      const sp = document.createElement('span');
      const k = document.createElement('kbd'); k.textContent = window.Settings.label(window.Settings.binds[a]);
      sp.appendChild(k); sp.appendChild(document.createTextNode(L('act_' + a)));
      line.appendChild(sp);
    });
    kd.appendChild(line); box.appendChild(kd);
  }

  function openSub(id) { subFrom = curScreen === 'game' ? 'menu' : curScreen; if (id === 'help') buildHelp(); show(id); }
  function closeSub() { window.Settings.cancelCapture(); show(subFrom && subFrom !== 'settings' && subFrom !== 'help' ? subFrom : 'menu'); }

  /* ============================== матчмейкинг ============================== */
  let queueing = false;
  async function findMatch() {
    if (!sb || !profile) return;
    queueing = true; show('queue');
    const t0 = now();
    $('queue-timer').textContent = L('queue_sec', { n: 0 });
    const timer = setInterval(() => { $('queue-timer').textContent = L('queue_sec', { n: Math.floor((now() - t0) / 1000) }); }, 500);
    try {
      while (queueing) {
        const { data, error } = await sb.rpc('find_match');
        if (error) throw error;
        if (data) { queueing = false; await startOnline(data); return; }
        await sleep(1500);
      }
    } catch (e) {
      toast(L('err_search', { e: e.message || e })); queueing = false; show('menu');
    } finally { clearInterval(timer); }
  }
  async function cancelQueue() {
    queueing = false;
    try { await sb.rpc('leave_queue'); } catch (e) { /* ignore */ }
    show('menu');
  }

  /* ============================== сеть матча ============================== */
  class Net {
    constructor(matchId) {
      this.ch = sb.channel('match:' + matchId, { config: { broadcast: { self: false, ack: false } } });
    }
    on(ev, fn) { this.ch.on('broadcast', { event: ev }, ({ payload }) => fn(payload)); }
    connect() {
      return new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error('timeout')), 10000);
        this.ch.subscribe(st => {
          if (st === 'SUBSCRIBED') { clearTimeout(to); res(); }
          else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(to); rej(new Error(st)); }
        });
      });
    }
    send(ev, payload) { this.ch.send({ type: 'broadcast', event: ev, payload }); }
    close() { try { sb.removeChannel(this.ch); } catch (e) { /* ignore */ } }
  }

  /* ============================== игровая сессия ============================== */
  const cv = $('cv');
  const held = {}; let pressed = {};
  const mouse = { x: C.W / 2, y: C.H / 2 };
  let mdown = false, rdown = false;
  let G = null, raf = 0, lastT = 0;

  function beginGame(o) {
    closeGame();
    G = Object.assign({
      out: [], wep: 0, mouse, held, rdown: false,
      t0: now(), lastSend: 0, lastSnap: 0, lastIn: 0, overHandled: false, overAt: 0, hiTimer: 0
    }, o);
    $('result').classList.add('hidden');
    for (const k in held) held[k] = false;
    mdown = rdown = false;
    show('game');
    lastT = now();
    raf = requestAnimationFrame(loop);
  }
  function closeGame() {
    cancelAnimationFrame(raf);
    if (G) { clearInterval(G.hiTimer); if (G.net) G.net.close(); }
    G = null;
  }

  function startPractice() {
    const w = new World({ names: [profile ? profile.username : L('guest'), 'Bot'], bots: [false, true] });
    beginGame({ mode: 'practice', me: 0, world: w, ready: true });
  }

  async function startOnline(matchId) {
    const { data: m, error } = await sb.from('matches').select('*').eq('id', matchId).single();
    if (error || !m) throw new Error(L('err_match'));
    const { data: ps } = await sb.from('profiles').select('id,username,rating').in('id', [m.p1, m.p2]);
    const by = {}; (ps || []).forEach(p => { by[p.id] = p; });
    const me = user.id === m.p1 ? 0 : 1;
    const world = new World({ names: [(by[m.p1] || {}).username || 'P1', (by[m.p2] || {}).username || 'P2'] });
    world.ratings = [m.p1_rating, m.p2_rating];
    if (me === 0) world.players[1].remote = true; else world.guest = true;

    const net = new Net(matchId);
    beginGame({ mode: me === 0 ? 'host' : 'guest', me, world, net, match: m, ready: false });
    const g = G;

    net.on('hi', () => {
      if (g.mode !== 'host') return;
      g.lastIn = now();
      if (!g.ready) { g.ready = true; sb.rpc('start_match', { p_match: matchId }); }
    });
    net.on('in', msg => { if (g.mode === 'host') handleInput(g, msg); });
    net.on('snap', s => {
      if (g.mode !== 'guest') return;
      if (!g.ready) g.ready = true;
      g.lastSnap = now();
      g.world.applySnapshot(s, g.me);
    });
    try { await net.connect(); } catch (e) {
      toast(L('err_channel')); closeGame(); show('menu'); return;
    }
    if (g.mode === 'guest') g.hiTimer = setInterval(() => { if (!g.ready) net.send('hi', {}); }, 400);
  }

  function handleInput(g, msg) {
    if (!msg || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    const w = g.world, p = w.players[1];
    g.lastIn = now();
    if (!p.dead && !(p.ign > 0)) { p.tx = clamp(msg.x, C.PR, C.W - C.PR); p.ty = clamp(msg.y, C.PR, C.H - C.PR); }
    if (Number.isFinite(msg.a)) p.aim = msg.a;
    if (Array.isArray(msg.ac)) for (const a of msg.ac.slice(0, 8)) w.act(1, a);
  }

  async function abortOnline() {
    const g = G; if (!g) return;
    try { await sb.rpc('abort_match', { p_match: g.match.id }); } catch (e) { /* ignore */ }
    toast(L('opp_no_show'), 5000);
    closeGame(); show('menu');
  }

  async function leaveGame() {
    const g = G; if (!g) return;
    if (!$('result').classList.contains('hidden')) return toMenu();
    if (g.mode !== 'practice' && g.ready && !g.world.over) {
      const yes = await ask('confirm_title', 'confirm_text', 'confirm_yes', 'confirm_no');
      if (!yes || G !== g || g.world.over) return;
      const opp = g.me === 0 ? g.match.p2 : g.match.p1;
      try { await sb.rpc('report_result', { p_match: g.match.id, p_winner: opp }); } catch (e) { /* ignore */ }
    } else if (g.mode !== 'practice' && !g.ready) {
      try { await sb.rpc('abort_match', { p_match: g.match.id }); } catch (e) { /* ignore */ }
    }
    toMenu();
  }
  async function toMenu() {
    if (modalOpen()) closeModal(false);
    closeGame(); show('menu');
    if (sb && user) { await loadProfile(); renderMenu(); }
  }

  /* ---------------------------- главный цикл ---------------------------- */
  function loop() {
    if (!G) return;
    const t = now();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    try { step(dt, t); if (G) window.Render.frame(G, dt); } catch (e) { console.error(e); }
    if (G) raf = requestAnimationFrame(loop);
  }

  function pushOut(a) {
    if (a.k === 'fire' || a.k === 'build') G.out = G.out.filter(x => x.k !== a.k);
    G.out.push(a);
  }

  function step(dt, t) {
    const w = G.world, p = w.players[G.me];
    G.rdown = rdown;

    if (G.mode === 'guest') { if (G.ready) w.clientUpdate(dt, G.me); }
    else if (G.ready) w.update(dt);

    if (pressed.wep1) G.wep = 0;
    if (pressed.wep2) G.wep = 1;

    const live = G.ready && !w.over && w.cdown <= 0 && !p.dead;
    let mx = 0, my = 0;
    if (live) {
      mx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      my = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      p.aim = Math.atan2(mouse.y - p.y, mouse.x - p.x);
      w.movePlayer(p, mx, my, dt);
      const send = a => { a.aim = p.aim; if (G.mode === 'guest') pushOut(a); else w.act(G.me, a); };
      if (mdown) send({ k: 'fire', w: G.wep });
      if (held.build || rdown) send({ k: 'build', x: mouse.x, y: mouse.y });
      if (pressed.edit) send({ k: 'edit', x: mouse.x, y: mouse.y });
      if (pressed.nova) send({ k: 'nova' });
      if (pressed.strike) send({ k: 'strike', x: mouse.x, y: mouse.y });
      if (pressed.mod1) send({ k: 'mod', i: 0, x: mouse.x, y: mouse.y });
      if (pressed.mod2) send({ k: 'mod', i: 1, x: mouse.x, y: mouse.y });
      if (pressed.dash) w.dash(p, mx, my);
    }
    for (const k in pressed) delete pressed[k];

    /* сеть */
    if (G.mode === 'host' && G.ready && t - G.lastSend > 66 && (!w.over || t - G.overAt < 3500)) {
      G.lastSend = t; G.net.send('snap', w.snapshot());
    }
    if (G.mode === 'guest' && G.ready && t - G.lastSend > 50) {
      G.lastSend = t;
      G.net.send('in', { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, a: Math.round(p.aim * 100) / 100, ac: G.out.splice(0) });
    }
    if (G.mode !== 'practice') {
      if (!G.ready && t - G.t0 > 25000) { abortOnline(); return; }
      if (G.ready && !w.over) {
        if (G.mode === 'host' && t - G.lastIn > 8000) w.setOver(0, 'dc');
        if (G.mode === 'guest' && t - G.lastSnap > 8000) w.over = { w: G.me, why: 'dc' };
      }
    }
    if (w.over && !G.overHandled) { G.overHandled = true; G.overAt = t; onOver(); }
  }

  /* ------------------------------ конец матча ------------------------------ */
  function onOver() {
    const w = G.world, o = w.over, g = G;
    const win = o.w === g.me, draw = o.w === null || o.w === undefined;
    const title = $('res-title');
    title.textContent = L(draw ? 'res_draw' : win ? 'res_win' : 'res_lose');
    title.className = draw ? 'draw' : win ? 'win' : 'lose';
    $('res-sub').textContent =
      o.why === 'core' ? L(win ? 'res_core_win' : 'res_core_lose') :
      o.why === 'dc' ? L('res_dc') : L('res_time');
    const me = w.players[g.me];
    $('res-stats').textContent = L('res_stats', { k: me.kills, d: me.deaths, l: w.lvl(me) });
    const rt = $('res-rating');
    rt.className = 'rating-change';
    $('btn-again').classList.toggle('hidden', g.mode !== 'practice');
    rt.textContent = L(g.mode === 'practice' ? 'res_practice' : 'res_counting');
    setTimeout(() => { if (G === g) { $('result').classList.remove('hidden'); sfx(draw ? 'click' : win ? 'win' : 'lose'); } }, 1500);
    if (g.mode !== 'practice') reportOnline(g);
  }

  async function reportOnline(g) {
    const w = g.world, o = w.over;
    const winner = (o.w === null || o.w === undefined) ? null : (o.w === 0 ? g.match.p1 : g.match.p2);
    const rt = $('res-rating');
    try {
      let status = 'active';
      const { data, error } = await sb.rpc('report_result', { p_match: g.match.id, p_winner: winner });
      if (error) throw error;
      status = data;
      for (let i = 0; i < 14 && status === 'active'; i++) {
        await sleep(2500);
        const r = await sb.rpc('settle_match', { p_match: g.match.id });
        if (r.error) throw r.error;
        status = r.data;
      }
      const old = profile ? profile.rating : null;
      await loadProfile();
      if (status === 'finished' && old !== null && profile) {
        const d = profile.rating - old;
        rt.className = 'rating-change ' + (d > 0 ? 'up' : d < 0 ? 'down' : '');
        animateNumber(rt, old, profile.rating, 1000, v => v + '  (' + (profile.rating - old >= 0 ? '+' : '') + (profile.rating - old) + ')');
      } else if (status === 'disputed') rt.textContent = L('res_disputed');
      else if (status === 'aborted') rt.textContent = L('res_aborted');
      else rt.textContent = L('res_pending');
    } catch (e) {
      rt.textContent = L('res_error', { e: e.message || e });
    }
  }

  /* ============================== ввод ============================== */
  window.addEventListener('keydown', e => {
    if (!G || window.Settings.capturing) return;
    if (e.code === 'Escape') { e.preventDefault(); if (modalOpen()) closeModal(false); else leaveGame(); return; }
    const act = window.Settings.reverse()[e.code];
    if (!act) return;
    e.preventDefault();
    if (!e.repeat) pressed[act] = true;
    held[act] = true;
  });
  window.addEventListener('keydown', e => {
    if (G || window.Settings.capturing || e.code !== 'Escape') return;
    if (modalOpen()) { closeModal(false); return; }
    if (curScreen === 'settings' || curScreen === 'help' || curScreen === 'board') closeSub();
    else if (curScreen === 'queue') cancelQueue();
  });
  window.addEventListener('keyup', e => {
    const act = window.Settings.reverse()[e.code];
    if (act) held[act] = false;
  });
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; mdown = rdown = false; });
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    mouse.x = clamp((e.clientX - r.left) / r.width * C.W, 0, C.W);
    mouse.y = clamp((e.clientY - r.top) / r.height * C.H, 0, C.H);
  });
  cv.addEventListener('mousedown', e => { if (e.button === 0) mdown = true; if (e.button === 2) rdown = true; });
  window.addEventListener('mouseup', e => { if (e.button === 0) mdown = false; if (e.button === 2) rdown = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  /* ============================== старт ============================== */
  async function boot() {
    window.I18N.apply();
    window.Settings.init();
    window.UIFX.init();
    window.MenuBG.init();
    window.Render.init(cv);
    setMode(false);

    $('tab-login').onclick = () => setMode(false);
    $('tab-register').onclick = () => setMode(true);
    $('btn-auth').onclick = doAuth;
    $('in-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
    $('btn-skip').onclick = () => show('menu');
    $('btn-practice').onclick = startPractice;
    $('btn-find').onclick = findMatch;
    $('btn-cancel').onclick = cancelQueue;
    $('btn-board').onclick = openBoard;
    $('btn-board-back').onclick = () => show('menu');
    $('btn-help').onclick = () => openSub('help');
    $('btn-help-back').onclick = closeSub;
    $('btn-settings').onclick = () => openSub('settings');
    $('btn-gear').onclick = () => { if (curScreen === 'settings') closeSub(); else openSub('settings'); };
    $('btn-set-back').onclick = closeSub;
    $('btn-logout').onclick = logout;
    $('btn-leave').onclick = leaveGame;
    $('btn-again').onclick = startPractice;
    $('btn-res-menu').onclick = toMenu;
    $('modal-yes').onclick = () => closeModal(true);
    $('modal-no').onclick = () => closeModal(false);

    window.addEventListener('langchange', () => {
      setMode(regMode); renderMenu(); renderTop(); showTip(false); buildHelp();
    });

    const introP = window.Intro.run();
    let start = 'menu';
    if (sb) {
      try {
        const { data } = await sb.auth.getSession();
        if (data && data.session) { user = data.session.user; await loadProfile(); }
        else start = 'auth';
      } catch (e) { start = 'auth'; }
    }
    await introP;
    document.body.classList.remove('booting');
    show(start);
  }
  boot();
})();
