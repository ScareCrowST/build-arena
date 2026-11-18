/* =====================================================================
   BUILD ARENA — клиент: интерфейс, Supabase (аккаунты, матчмейкинг, Elo),
   сеть матча (Realtime Broadcast), ввод и отрисовка.
   ===================================================================== */
(() => {
  'use strict';
  const { C, World } = window.Sim;
  const cfg = window.GAME_CONFIG || {};
  const sb = (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !/YOUR/i.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY))
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const now = () => performance.now();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TEAM = ['#3da9fc', '#ff5d73'];
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };

  let user = null, profile = null;

  /* ============================== UI ============================== */
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  }
  let toastT = 0;
  function toast(msg, ms = 3400) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms);
  }

  /* ============================ Авторизация ============================ */
  let regMode = false;
  function setMode(reg) {
    regMode = reg;
    $('tab-login').classList.toggle('active', !reg);
    $('tab-register').classList.toggle('active', reg);
    $('row-name').classList.toggle('hidden', !reg);
    $('btn-auth').textContent = reg ? 'Создать аккаунт' : 'Войти';
  }
  function authError(e) {
    const m = (e && e.message) || String(e);
    if (/Invalid login/i.test(m)) return 'Неверный email или пароль';
    if (/already registered/i.test(m)) return 'Такой email уже зарегистрирован';
    if (/Database error saving new user/i.test(m)) return 'Ник занят или содержит недопустимые символы';
    if (/Email not confirmed/i.test(m)) return 'Подтверди email (письмо уже отправлено)';
    return m;
  }
  async function doAuth() {
    if (!sb) return toast('Онлайн не настроен: заполни config.js');
    const email = $('in-email').value.trim(), pass = $('in-pass').value, name = $('in-name').value.trim();
    if (!email || pass.length < 6) return toast('Введи email и пароль (минимум 6 символов)');
    const btn = $('btn-auth'); btn.disabled = true;
    try {
      if (regMode) {
        if (!/^[\wА-Яа-яЁё]{3,16}$/.test(name)) { toast('Ник: 3–16 символов — буквы, цифры, _'); return; }
        const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { username: name } } });
        if (error) throw error;
        if (!data.session) { toast('Аккаунт создан. Подтверди email и войди.', 6000); setMode(false); return; }
        user = data.user;
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        user = data.user;
      }
      await loadProfile();
      show('menu'); renderMenu();
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
    if (sb) await sb.auth.signOut();
    user = null; profile = null;
    if (sb) show('auth'); else { show('menu'); renderMenu(); }
  }

  function renderMenu() {
    $('offline-note').classList.toggle('hidden', !!sb);
    $('btn-find').disabled = !sb || !profile;
    $('btn-board').disabled = !sb;
    $('btn-logout').classList.toggle('hidden', !sb);
    if (profile) {
      $('me-name').textContent = profile.username;
      $('me-rating').textContent = profile.rating;
      const wr = profile.games ? Math.round(profile.wins / profile.games * 100) : 0;
      $('me-stats').textContent = `Игр: ${profile.games} · Побед: ${profile.wins} · Винрейт: ${wr}%`;
    } else {
      $('me-name').textContent = 'Гость';
      $('me-rating').textContent = '—';
      $('me-stats').textContent = sb ? 'Войди, чтобы играть рейтинговые матчи' : 'Тренировка без рейтинга';
    }
  }

  /* ============================ Таблица лидеров ============================ */
  async function openBoard() {
    show('board');
    const body = $('board-body');
    body.textContent = '';
    const { data, error } = await sb.from('profiles').select('username,rating,games,wins')
      .order('rating', { ascending: false }).limit(50);
    if (error) { toast('Не удалось загрузить таблицу'); return; }
    (data || []).forEach((p, i) => {
      const tr = document.createElement('tr');
      if (profile && p.username === profile.username) tr.className = 'me';
      [i + 1, p.username, p.rating, p.games, p.wins].forEach((v, k) => {
        const td = document.createElement('td');
        td.textContent = v;           // textContent: ник — пользовательский ввод, innerHTML нельзя
        if (k === 2) td.className = 'r';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  /* ============================ Матчмейкинг ============================ */
  let queueing = false;
  async function findMatch() {
    if (!sb || !profile) return;
    queueing = true; show('queue');
    const t0 = now();
    $('queue-timer').textContent = '0 с';
    const timer = setInterval(() => { $('queue-timer').textContent = Math.floor((now() - t0) / 1000) + ' с'; }, 500);
    try {
      while (queueing) {
        const { data, error } = await sb.rpc('find_match');
        if (error) throw error;
        if (data) { queueing = false; await startOnline(data); return; }
        await sleep(1500);
      }
    } catch (e) {
      toast('Ошибка поиска: ' + (e.message || e)); queueing = false; show('menu');
    } finally { clearInterval(timer); }
  }
  async function cancelQueue() {
    queueing = false;
    try { await sb.rpc('leave_queue'); } catch (e) { /* ignore */ }
    show('menu');
  }

  /* ============================== Сеть матча ============================== */
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

  /* ============================== Игровая сессия ============================== */
  const cv = $('cv'), ctx = cv.getContext('2d');
  const keys = {};
  const mouse = { x: C.W / 2, y: C.H / 2 };
  let mdown = false, rdown = false;
  let G = null, raf = 0, lastT = 0;

  function beginGame(o) {
    closeGame();
    G = Object.assign({
      fx: [], floats: [], feed: [], seen: new WeakSet(), wep: 0, out: [], pressed: {},
      t0: now(), lastSend: 0, lastSnap: 0, lastIn: 0, overHandled: false, overAt: 0, shake: 0, hiTimer: 0
    }, o);
    $('result').classList.add('hidden');
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
    const w = new World({ names: [profile ? profile.username : 'Ты', 'Бот'], bots: [false, true] });
    beginGame({ mode: 'practice', me: 0, world: w, ready: true });
  }

  async function startOnline(matchId) {
    const { data: m, error } = await sb.from('matches').select('*').eq('id', matchId).single();
    if (error || !m) throw new Error('матч не найден');
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
      toast('Нет связи с сервером матча'); closeGame(); show('menu'); return;
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
    toast('Соперник не подключился. Матч отменён, рейтинг не изменён.', 5000);
    closeGame(); show('menu'); renderMenu();
  }

  async function leaveGame() {
    const g = G; if (!g) return;
    if (!$('result').classList.contains('hidden')) return toMenu();
    if (g.mode !== 'practice' && g.ready && !g.world.over) {
      if (!confirm('Выйти из матча? Это будет засчитано как поражение.')) return;
      const opp = g.me === 0 ? g.match.p2 : g.match.p1;
      try { await sb.rpc('report_result', { p_match: g.match.id, p_winner: opp }); } catch (e) { /* ignore */ }
    } else if (g.mode !== 'practice' && !g.ready) {
      try { await sb.rpc('abort_match', { p_match: g.match.id }); } catch (e) { /* ignore */ }
    }
    toMenu();
  }
  async function toMenu() {
    closeGame(); show('menu'); renderMenu();
    if (sb && user) { await loadProfile(); renderMenu(); }
  }

  /* ---------------------------- главный цикл ---------------------------- */
  function loop() {
    if (!G) return;
    const t = now();
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    try { step(dt, t); draw(t); } catch (e) { console.error(e); }
    if (G) raf = requestAnimationFrame(loop);
  }

  function pushOut(a) {
    if (a.k === 'fire' || a.k === 'build') G.out = G.out.filter(x => x.k !== a.k);
    G.out.push(a);
  }

  function step(dt, t) {
    const w = G.world, p = w.players[G.me];

    if (G.mode === 'guest') { if (G.ready) w.clientUpdate(dt, G.me); }
    else if (G.ready) w.update(dt);

    const live = G.ready && !w.over && w.cdown <= 0 && !p.dead;
    let mx = 0, my = 0;
    if (live) {
      mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      my = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
      p.aim = Math.atan2(mouse.y - p.y, mouse.x - p.x);
      w.movePlayer(p, mx, my, dt);
      const send = a => { a.aim = p.aim; if (G.mode === 'guest') pushOut(a); else w.act(G.me, a); };
      if (mdown) send({ k: 'fire', w: G.wep });
      if (keys.KeyQ || rdown) send({ k: 'build', x: mouse.x, y: mouse.y });
      if (G.pressed.KeyE) send({ k: 'edit', x: mouse.x, y: mouse.y });
      if (G.pressed.KeyZ) send({ k: 'nova' });
      if (G.pressed.KeyR) send({ k: 'strike', x: mouse.x, y: mouse.y });
      if (G.pressed.Space) w.dash(p, mx, my);
    }
    G.pressed = {};

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

    /* эффекты из событий мира */
    for (const e of w.ev) { if (!G.seen.has(e)) { G.seen.add(e); handleEvent(e); } }
    updateFx(dt);

    if (w.over && !G.overHandled) { G.overHandled = true; G.overAt = t; onOver(); }
  }

  /* ------------------------------ эффекты ------------------------------ */
  function spark(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 60 + Math.random() * 220;
      G.fx.push({ k: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.3, max: 0.6, col, sz: 2 + Math.random() * 2 });
    }
  }
  function floatText(x, y, txt, col) { G.floats.push({ x, y, txt, col, life: 0.9 }); }
  function nameOf(i) { return i >= 0 ? G.world.players[i].name : 'Нейтралы'; }

  function handleEvent(e) {
    switch (e.type) {
      case 'hit':
        spark(e.x, e.y, e.t === G.me ? '#ff5d73' : '#ffffff', 4);
        if (e.d > 0) floatText(e.x, e.y, String(e.d), e.t === G.me ? '#ff8a98' : '#ffffff');
        if (e.t === G.me) G.shake = Math.min(9, G.shake + e.d * 0.25);
        break;
      case 'boom':
        G.fx.push({ k: 'ring', x: e.x, y: e.y, r: e.r, life: 0.5, max: 0.5, col: '#ffb04a' });
        spark(e.x, e.y, '#ffb04a', 14);
        G.shake = Math.min(14, G.shake + e.r / 22);
        break;
      case 'nova':
        G.fx.push({ k: 'ring', x: e.x, y: e.y, r: e.r, life: 0.4, max: 0.4, col: '#8be9ff' });
        break;
      case 'dash':
        G.fx.push({ k: 'ring', x: e.x, y: e.y, r: 28, life: 0.25, max: 0.25, col: '#ffffff' });
        break;
      case 'wb': spark(e.x, e.y, e.o === 0 || e.o === 1 ? TEAM[e.o] : '#aab', 10); break;
      case 'kill':
        G.feed.push({ txt: e.k >= 0 ? `${nameOf(e.k)}  ✕  ${nameOf(e.v)}` : `${nameOf(e.v)} погиб`, until: now() + 5000 });
        if (G.feed.length > 5) G.feed.shift();
        break;
      case 'lvl': {
        const p = G.world.players[e.p];
        floatText(p.x, p.y - 30, 'УРОВЕНЬ ' + e.l, '#ffcf5a');
        break;
      }
      default: break;
    }
  }
  function updateFx(dt) {
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      f.life -= dt;
      if (f.life <= 0) { G.fx.splice(i, 1); continue; }
      if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; }
    }
    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i];
      f.life -= dt; f.y -= 40 * dt;
      if (f.life <= 0) G.floats.splice(i, 1);
    }
    G.shake *= Math.pow(0.002, dt);
  }

  /* ------------------------------ конец матча ------------------------------ */
  function onOver() {
    const w = G.world, o = w.over, g = G;
    const win = o.w === g.me, draw = o.w === null || o.w === undefined;
    const title = $('res-title');
    title.textContent = draw ? 'НИЧЬЯ' : win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    title.className = draw ? 'draw' : win ? 'win' : 'lose';
    $('res-sub').textContent =
      o.why === 'core' ? (win ? 'Ядро врага уничтожено' : 'Твоё ядро уничтожено') :
      o.why === 'dc' ? 'Соперник отключился' : 'Время вышло — решили ядра, убийства и души';
    const rt = $('res-rating');
    rt.className = 'rating-change';
    $('btn-again').classList.toggle('hidden', g.mode !== 'practice');
    if (g.mode === 'practice') rt.textContent = 'Тренировка — рейтинг не меняется';
    else rt.textContent = 'Подсчёт рейтинга…';
    setTimeout(() => { if (G === g) $('result').classList.remove('hidden'); }, 1300);
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
        rt.textContent = `${profile.rating}  (${d >= 0 ? '+' : ''}${d})`;
        rt.className = 'rating-change ' + (d > 0 ? 'up' : d < 0 ? 'down' : '');
      } else if (status === 'disputed') rt.textContent = 'Результаты не совпали — рейтинг не изменён';
      else if (status === 'aborted') rt.textContent = 'Матч отменён — рейтинг не изменён';
      else rt.textContent = 'Результат ещё обрабатывается — загляни в меню позже';
    } catch (e) {
      rt.textContent = 'Не удалось записать результат: ' + (e.message || e);
    }
  }

  /* ============================== Ввод ============================== */
  window.addEventListener('keydown', e => {
    if (!G) return;
    if (e.code === 'Escape') { leaveGame(); return; }
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (!e.repeat) {
      G.pressed[e.code] = true;
      if (e.code === 'Digit1') G.wep = 0;
      if (e.code === 'Digit2') G.wep = 1;
    }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mdown = rdown = false; });
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width * C.W;
    mouse.y = (e.clientY - r.top) / r.height * C.H;
  });
  cv.addEventListener('mousedown', e => { if (e.button === 0) mdown = true; if (e.button === 2) rdown = true; });
  window.addEventListener('mouseup', e => { if (e.button === 0) mdown = false; if (e.button === 2) rdown = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  /* ============================== Отрисовка ============================== */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function bar(x, y, w, h, ratio, col, bg) {
    ratio = clamp(ratio, 0, 1);
    ctx.fillStyle = bg || 'rgba(0,0,0,.55)'; rr(x, y, w, h, h / 2); ctx.fill();
    if (ratio > 0) { ctx.fillStyle = col; rr(x, y, Math.max(h, w * ratio), h, h / 2); ctx.fill(); }
  }
  const hpCol = r => (r > 0.5 ? '#5df08a' : r > 0.25 ? '#ffd45a' : '#ff5d73');
  function text(s, x, y, size, col, align, weight) {
    ctx.font = `${weight || 600} ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = col || '#fff'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  }

  function draw(t) {
    const w = G.world, me = w.players[G.me];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d121c'; ctx.fillRect(0, 0, C.W, C.H);
    if (G.shake > 0.3) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);

    drawArena(w);
    drawWalls(w);
    drawCamps(w);
    drawCores(w);
    drawStrikes(w, t);
    drawProjectiles(w);
    drawPlayers(w);
    drawFx();
    drawBuildGhost(w, me);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawHud(w, me, t);
  }

  function drawArena(w) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= C.W; x += C.T) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, C.H); }
    for (let y = 0; y <= C.H; y += C.T) { ctx.moveTo(0, y + 0.5); ctx.lineTo(C.W, y + 0.5); }
    ctx.stroke();
    for (const c of w.cores) {
      const g = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, 210);
      g.addColorStop(0, rgba(TEAM[c.team], 0.22)); g.addColorStop(1, rgba(TEAM[c.team], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, 210, 0, 6.283); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.setLineDash([10, 12]);
    ctx.beginPath(); ctx.moveTo(C.W / 2, 0); ctx.lineTo(C.W / 2, C.H); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < w.rock.length; i++) {
      if (!w.rock[i]) continue;
      const x = (i % C.GW) * C.T, y = Math.floor(i / C.GW) * C.T;
      ctx.fillStyle = '#242c42'; ctx.fillRect(x, y, C.T, C.T);
      ctx.fillStyle = '#2f3954'; ctx.fillRect(x + 3, y + 3, C.T - 6, C.T - 6);
      ctx.fillStyle = '#394564'; ctx.fillRect(x + 3, y + 3, C.T - 6, 5);
    }
  }

  function drawWalls(w) {
    for (let i = 0; i < w.walls.length; i++) {
      const wl = w.walls[i];
      if (!wl) continue;
      const x = (i % C.GW) * C.T, y = Math.floor(i / C.GW) * C.T;
      const col = TEAM[wl.own] || '#889', ratio = clamp(wl.hp / C.WALL_HP, 0, 1);
      if (wl.st === 0) {
        ctx.fillStyle = rgba(col, 0.28); ctx.fillRect(x + 1, y + 1, C.T - 2, C.T - 2);
        ctx.fillStyle = rgba(col, 0.75); ctx.fillRect(x + 4, y + 4, C.T - 8, C.T - 8);
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x + 4, y + 4, C.T - 8, 4);
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2;
        if (ratio < 0.7) { ctx.beginPath(); ctx.moveTo(x + 10, y + 6); ctx.lineTo(x + 24, y + 26); ctx.lineTo(x + 18, y + 44); ctx.stroke(); }
        if (ratio < 0.35) { ctx.beginPath(); ctx.moveTo(x + 42, y + 8); ctx.lineTo(x + 30, y + 30); ctx.lineTo(x + 40, y + 46); ctx.stroke(); }
      } else if (wl.st === 1) {          // окно: пули пролетают
        ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 6; ctx.strokeRect(x + 4, y + 4, C.T - 8, C.T - 8);
        ctx.fillStyle = 'rgba(140,210,255,.14)'; ctx.fillRect(x + 7, y + 7, C.T - 14, C.T - 14);
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + C.T / 2, y + 7); ctx.lineTo(x + C.T / 2, y + C.T - 7); ctx.stroke();
      } else {                           // дверь: можно пройти
        ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        ctx.strokeRect(x + 4, y + 4, C.T - 8, C.T - 8); ctx.setLineDash([]);
        ctx.fillStyle = rgba(col, 0.12); ctx.fillRect(x + 4, y + 4, C.T - 8, C.T - 8);
      }
    }
  }

  function drawCamps(w) {
    for (const m of w.camps) {
      if (!m.alive) {
        ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      const col = m.boss ? '#ff9a3d' : '#a06bff';
      ctx.fillStyle = rgba(col, 0.2); ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 8, 0, 6.283); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + 0.5, px = m.x + Math.cos(a) * m.r, py = m.y + Math.sin(a) * m.r;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0a0f19'; ctx.stroke();
      bar(m.x - 24, m.y - m.r - 14, 48, 5, m.hp / m.max, col);
      text(String(m.souls), m.x, m.y + 5, 14, '#0a0f19', 'center', 800);
    }
  }

  function drawCores(w) {
    for (const c of w.cores) {
      const col = TEAM[c.team];
      ctx.strokeStyle = rgba(col, 0.12); ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
      ctx.beginPath(); ctx.arc(c.x, c.y, C.TOWER_RANGE, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = rgba(col, 0.25); ctx.beginPath(); ctx.arc(c.x, c.y, C.CORE_R + 10, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#10182a'; ctx.beginPath(); ctx.arc(c.x, c.y, C.CORE_R, 0, 6.283); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047, px = c.x + Math.cos(a) * 22, py = c.y + Math.sin(a) * 22;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      bar(c.x - 45, c.y - C.CORE_R - 22, 90, 8, c.hp / C.CORE_HP, hpCol(c.hp / C.CORE_HP));
    }
  }

  function drawStrikes(w, t) {
    for (const s of w.strikes) {
      const k = 1 - clamp(s.t / C.STRIKE.delay, 0, 1), pulse = 0.5 + 0.5 * Math.sin(t / 60);
      ctx.fillStyle = `rgba(255,80,60,${0.10 + 0.18 * k})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, C.STRIKE.r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = `rgba(255,120,90,${0.5 + 0.5 * pulse})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, C.STRIKE.r, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, C.STRIKE.r * k, 0, 6.283); ctx.stroke();
    }
  }

  function drawProjectiles(w) {
    ctx.lineCap = 'round';
    for (const b of w.pr) {
      const col = b.own === 0 || b.own === 1 ? TEAM[b.own] : '#c58cff';
      ctx.strokeStyle = col; ctx.lineWidth = b.kind === 'b' ? 4 : 5;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.008, b.y - b.vy * 0.008); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function drawPlayers(w) {
    for (const p of w.players) {
      const col = TEAM[p.id];
      if (p.dead) {
        ctx.globalAlpha = 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, C.PR, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1; text('✕', p.x, p.y + 6, 18, '#fff', 'center', 800);
        continue;
      }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aim);
      ctx.fillStyle = '#cfd8ee'; ctx.fillRect(8, -3.5, C.PR + 10, 7);
      ctx.restore();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, C.PR, 0, 6.283); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#0a0f19'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(p.x - 4, p.y - 4, 6, 0, 6.283); ctx.fill();
      if (p.id === G.me) {
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, C.PR + 5, 0, 6.283); ctx.stroke();
      }
      bar(p.x - 22, p.y - C.PR - 15, 44, 5, p.hp / p.mh, hpCol(p.hp / p.mh));
      text(`${p.name} · ${w.lvl(p)}`, p.x, p.y - C.PR - 21, 12, '#fff', 'center', 700);
    }
  }

  function drawFx() {
    for (const f of G.fx) {
      const k = f.life / f.max;
      if (f.k === 'ring') {
        ctx.strokeStyle = f.col; ctx.globalAlpha = k; ctx.lineWidth = 4 * k + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * 0.6), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = f.col; ctx.globalAlpha = clamp(k, 0, 1);
        ctx.fillRect(f.x - f.sz / 2, f.y - f.sz / 2, f.sz, f.sz); ctx.globalAlpha = 1;
      }
    }
    for (const f of G.floats) {
      ctx.globalAlpha = clamp(f.life / 0.5, 0, 1);
      text(f.txt, f.x, f.y, 15, f.col, 'center', 800);
      ctx.globalAlpha = 1;
    }
  }

  function drawBuildGhost(w, me) {
    if (me.dead || w.over || !G.ready) return;
    let x = mouse.x, y = mouse.y;
    const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy);
    if (d > C.BUILD_RANGE) { x = me.x + dx / d * C.BUILD_RANGE; y = me.y + dy / d * C.BUILD_RANGE; }
    const gx = Math.floor(x / C.T), gy = Math.floor(y / C.T);
    if (gx >= 0 && gy >= 0 && gx < C.GW && gy < C.GH) {
      const i = gy * C.GW + gx;
      const free = !w.rock[i] && !w.walls[i] && me.mats >= C.WALL_COST;
      ctx.strokeStyle = free ? 'rgba(120,255,170,.75)' : 'rgba(255,110,110,.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.strokeRect(gx * C.T + 2, gy * C.T + 2, C.T - 4, C.T - 4); ctx.setLineDash([]);
    }
    const ei = w.cellIdx(mouse.x, mouse.y);
    if (ei >= 0 && w.walls[ei] && w.walls[ei].own === me.id && Math.hypot(mouse.x - me.x, mouse.y - me.y) <= C.EDIT_RANGE) {
      ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 3;
      ctx.strokeRect((ei % C.GW) * C.T, Math.floor(ei / C.GW) * C.T, C.T, C.T);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 8, 0, 6.283); ctx.moveTo(mouse.x - 13, mouse.y); ctx.lineTo(mouse.x - 4, mouse.y);
    ctx.moveTo(mouse.x + 4, mouse.y); ctx.lineTo(mouse.x + 13, mouse.y); ctx.stroke();
  }

  /* ------------------------------ HUD ------------------------------ */
  function drawHud(w, me, t) {
    const remain = Math.max(0, C.MATCH_TIME - w.time);
    text(`${Math.floor(remain / 60)}:${String(Math.floor(remain % 60)).padStart(2, '0')}`, C.W / 2, 38, 30, '#fff', 'center', 800);

    for (const p of w.players) {
      const left = p.id === 0, x = left ? 30 : C.W - 30 - 430;
      const core = w.cores[p.id];
      const rating = w.ratings ? ` (${w.ratings[p.id]})` : '';
      text(`${p.name}${rating}`, left ? x : x + 430, 24, 15, TEAM[p.id], left ? 'left' : 'right', 800);
      text(`убийств ${p.kills}`, left ? x + 430 : x, 24, 12, '#8d9bb8', left ? 'right' : 'left', 600);
      bar(x, 32, 430, 14, core.hp / C.CORE_HP, TEAM[p.id]);
      text(`ядро ${Math.round(core.hp)}`, x + 215, 43, 11, '#fff', 'center', 700);
    }

    const nowMs = now();
    G.feed = G.feed.filter(f => f.until > nowMs);
    G.feed.forEach((f, i) => text(f.txt, C.W - 30, 76 + i * 20, 14, '#e8eefc', 'right', 600));

    /* нижняя панель */
    const x0 = (C.W - 780) / 2, y0 = C.H - 108;
    ctx.fillStyle = 'rgba(10,15,26,.85)'; rr(x0, y0, 780, 96, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.stroke();

    bar(x0 + 18, y0 + 14, 340, 18, me.hp / me.mh, hpCol(me.hp / me.mh));
    text(`${Math.ceil(me.hp)} / ${me.mh}`, x0 + 188, y0 + 28, 13, '#fff', 'center', 800);
    bar(x0 + 18, y0 + 42, 340, 11, me.mats / C.MAXMATS, '#d8a657');
    text(`материалы ${Math.floor(me.mats)}`, x0 + 188, y0 + 51, 10, '#fff', 'center', 700);
    const lv = w.lvl(me), prog = lv >= C.MAXLVL ? 1 : (me.souls % C.SPL) / C.SPL;
    bar(x0 + 18, y0 + 62, 340, 11, prog, '#b98bff');
    text(`уровень ${lv} · души ${me.souls}`, x0 + 188, y0 + 71, 10, '#fff', 'center', 700);

    text('1', x0 + 22, y0 + 90, 11, G.wep === 0 ? '#ffcf5a' : '#8d9bb8', 'left', 800);
    text('Винтовка', x0 + 34, y0 + 90, 11, G.wep === 0 ? '#fff' : '#8d9bb8', 'left', 600);
    text('2', x0 + 120, y0 + 90, 11, G.wep === 1 ? '#ffcf5a' : '#8d9bb8', 'left', 800);
    text('Дробовик', x0 + 132, y0 + 90, 11, G.wep === 1 ? '#fff' : '#8d9bb8', 'left', 600);

    const abil = [
      { key: 'Q', name: 'Стена', cd: 0, max: 1, dim: me.mats < C.WALL_COST, sub: C.WALL_COST + '' },
      { key: 'E', name: 'Правка', cd: me.cd.edit, max: 0.2, sub: '' },
      { key: 'Z', name: 'Волна', cd: me.cd.nova, max: C.NOVA.cd, sub: '' },
      { key: '␣', name: 'Рывок', cd: me.cd.dash, max: C.DASH.cd, sub: '' },
      { key: 'R', name: 'Орбита', cd: me.cd.strike, max: C.STRIKE.cd, dim: lv < C.STRIKE.lvl, sub: lv < C.STRIKE.lvl ? 'ур.' + C.STRIKE.lvl : '' }
    ];
    abil.forEach((a, i) => {
      const bx = x0 + 380 + i * 80, by = y0 + 14;
      ctx.fillStyle = a.dim ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.1)'; rr(bx, by, 70, 68, 10); ctx.fill();
      if (a.cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; const h = 68 * clamp(a.cd / a.max, 0, 1);
        rr(bx, by + 68 - h, 70, h, 10); ctx.fill();
        text(a.cd.toFixed(1), bx + 35, by + 42, 18, '#fff', 'center', 800);
      } else text(a.key, bx + 35, by + 38, 26, a.dim ? '#55607a' : '#fff', 'center', 800);
      text(a.name, bx + 35, by + 60, 11, a.dim ? '#55607a' : '#cfd8ee', 'center', 600);
      if (a.sub) text(a.sub, bx + 64, by + 14, 11, '#ffcf5a', 'right', 800);
    });

    /* оверлеи состояния */
    if (!G.ready) {
      text('Подключение к сопернику…', C.W / 2, C.H / 2, 30, '#fff', 'center', 800);
    } else if (w.cdown > 0) {
      text(String(Math.ceil(w.cdown)), C.W / 2, C.H / 2 - 10, 120, '#fff', 'center', 900);
      text('Приготовься!', C.W / 2, C.H / 2 + 50, 26, '#8d9bb8', 'center', 700);
    } else if (me.dead && !w.over) {
      text('Ты погиб', C.W / 2, C.H / 2 - 10, 42, '#ff5d73', 'center', 900);
      text(`Возрождение через ${Math.ceil(me.resp)}`, C.W / 2, C.H / 2 + 30, 22, '#fff', 'center', 700);
    }
    if (w.time < 14 && G.ready) {
      text('WASD — ход · ЛКМ — огонь · Q/ПКМ — стена · E — правка · Z — волна · ПРОБЕЛ — рывок · R — орбита (ур.3)',
        C.W / 2, C.H - 118, 13, 'rgba(255,255,255,.55)', 'center', 600);
    }
  }

  /* ============================== Старт ============================== */
  async function boot() {
    $('tab-login').onclick = () => setMode(false);
    $('tab-register').onclick = () => setMode(true);
    $('btn-auth').onclick = doAuth;
    $('in-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
    $('btn-skip').onclick = () => { show('menu'); renderMenu(); };
    $('btn-practice').onclick = startPractice;
    $('btn-find').onclick = findMatch;
    $('btn-cancel').onclick = cancelQueue;
    $('btn-board').onclick = openBoard;
    $('btn-board-back').onclick = () => show('menu');
    $('btn-logout').onclick = logout;
    $('btn-leave').onclick = leaveGame;
    $('btn-again').onclick = startPractice;
    $('btn-res-menu').onclick = toMenu;

    if (!sb) { show('menu'); renderMenu(); return; }
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) {
        user = data.session.user;
        await loadProfile();
        show('menu'); renderMenu();
      } else show('auth');
    } catch (e) { show('auth'); }
  }
  boot();
})();
