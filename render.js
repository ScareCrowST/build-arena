/* =====================================================================
   BUILD ARENA — отрисовка: арена, стены (анимация стройки, здоровье при наведении),
   эффекты, частицы, HUD. Игровое состояние только читается.
   ===================================================================== */
(function () {
  'use strict';

  const Sim = window.Sim, C = Sim.C, MODS = Sim.MODS;
  const TAU = Math.PI * 2;
  const TEAM = ['#38b6ff', '#ff4d6a'];
  const MODCOL = { shield: '#7cf2ff', repair: '#6dff9e', mine: '#ffb347', haste: '#ffe14d', turret: '#ff8ad8', blink: '#b78cff' };
  const FONT = '"Exo 2","Segoe UI",system-ui,sans-serif';
  const L = (k, v) => window.I18N.t(k, v);
  const ST = () => window.Settings.data;
  const sfx = (n, v) => { if (window.SFX) window.SFX.play(n, v); };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = x => 1 - Math.pow(1 - x, 3);
  const easeBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  };
  const quality = () => (ST().quality === 'low' ? 0.4 : 1);

  let cv = null, ctx = null, V = null, bgc = null;
  const sprites = {};

  function spr(col) {
    if (sprites[col]) return sprites[col];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.45)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    sprites[col] = c;
    return c;
  }
  function glow(x, y, r, col, a) {
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.drawImage(spr(col), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------ базовые примитивы ------------------------------ */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function hexPath(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (rot || 0) + i * Math.PI / 3;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  function hpCol(r) { return r > 0.5 ? '#5df08a' : r > 0.25 ? '#ffd45a' : '#ff5d73'; }
  function bar(x, y, w, h, ratio, col, ghost) {
    ratio = clamp(ratio, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(x, y, w, h, h / 2); ctx.fill();
    if (ghost !== undefined && ghost > ratio) {
      ctx.fillStyle = 'rgba(255,230,160,.85)'; rr(x, y, Math.max(h, w * clamp(ghost, 0, 1)), h, h / 2); ctx.fill();
    }
    if (ratio > 0) { ctx.fillStyle = col; rr(x, y, Math.max(h, w * ratio), h, h / 2); ctx.fill(); }
  }
  function text(s, x, y, size, col, align, weight, alpha) {
    ctx.font = (weight || 600) + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = col || '#fff'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.fillText(s, x, y);
    if (alpha !== undefined) ctx.globalAlpha = 1;
  }
  function shadowText(s, x, y, size, col, align, weight, alpha) {
    ctx.font = (weight || 600) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(s, x + 2, y + 2);
    ctx.fillStyle = col || '#fff'; ctx.fillText(s, x, y);
    if (alpha !== undefined) ctx.globalAlpha = 1;
  }
  const lab = a => window.Settings.label(window.Settings.binds[a]);

  /* ------------------------------ иконки модулей ------------------------------ */
  function drawModIcon(c, id, x, y, s, col, alpha) {
    const kind = MODS[id];
    c.save();
    c.translate(x, y);
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2, s * 0.14); c.lineJoin = 'round'; c.lineCap = 'round';
    switch (kind) {
      case 'shield':
        c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.85, -s * 0.55); c.lineTo(s * 0.85, s * 0.1);
        c.quadraticCurveTo(s * 0.85, s * 0.7, 0, s); c.quadraticCurveTo(-s * 0.85, s * 0.7, -s * 0.85, s * 0.1);
        c.lineTo(-s * 0.85, -s * 0.55); c.closePath(); c.globalAlpha *= 0.25; c.fill(); c.globalAlpha = alpha === undefined ? 1 : alpha; c.stroke();
        break;
      case 'repair':
        c.fillRect(-s * 0.25, -s * 0.8, s * 0.5, s * 1.6); c.fillRect(-s * 0.8, -s * 0.25, s * 1.6, s * 0.5);
        break;
      case 'mine':
        c.beginPath(); c.arc(0, 0, s * 0.5, 0, TAU); c.stroke();
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.62); c.lineTo(Math.cos(a) * s * 0.95, Math.sin(a) * s * 0.95); c.stroke(); }
        c.beginPath(); c.arc(0, 0, s * 0.16, 0, TAU); c.fill();
        break;
      case 'haste':
        c.beginPath(); c.moveTo(s * 0.2, -s); c.lineTo(-s * 0.6, s * 0.15); c.lineTo(-s * 0.05, s * 0.15);
        c.lineTo(-s * 0.25, s); c.lineTo(s * 0.6, -s * 0.2); c.lineTo(s * 0.05, -s * 0.2); c.closePath(); c.fill();
        break;
      case 'turret':
        c.fillRect(-s * 0.7, s * 0.25, s * 1.4, s * 0.5);
        c.beginPath(); c.arc(0, 0, s * 0.45, 0, TAU); c.fill();
        c.fillRect(0, -s * 0.14, s * 0.95, s * 0.28);
        break;
      case 'blink':
        c.beginPath(); c.arc(0, 0, s * 0.8, 0, TAU); c.stroke();
        c.beginPath(); c.moveTo(-s * 0.45, -s * 0.4); c.lineTo(s * 0.2, 0); c.lineTo(-s * 0.45, s * 0.4); c.stroke();
        c.beginPath(); c.moveTo(s * 0.1, -s * 0.4); c.lineTo(s * 0.75, 0); c.lineTo(s * 0.1, s * 0.4); c.stroke();
        break;
      default: break;
    }
    c.restore();
  }

  /* ------------------------------ состояние визуала ------------------------------ */
  function reset(G) {
    V = {
      G, time: 0, fx: [], floats: [], feed: [], banners: [], seen: new WeakSet(),
      anim: {}, wprev: [], wflash: {}, shake: 0, zoom: 0, hurt: 0, hitmark: 0, spread: 0, flashA: 0,
      ghost: [100, 100], cghost: [C.CORE_HP, C.CORE_HP], cprev: [C.CORE_HP, C.CORE_HP], cflash: [0, 0],
      campPrev: [], campFlash: [], pflash: [0, 0],
      pcd: [0, 0], recoil: [0, 0], last: [null, null], afterT: [0, 0], dustT: [0, 0], rsn: [0, 0],
      cdPrev: {}, ready: {}, motes: [], lastCount: -1, goT: -1, goDone: false,
      fps: 60, fpsAcc: 0, fpsN: 0, jumpCool: 0
    };
    for (let i = 0; i < 46; i++) V.motes.push({ x: Math.random() * C.W, y: Math.random() * C.H, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 10, r: 1 + Math.random() * 2, ph: Math.random() * TAU });
    bgc = null;
  }

  function addFx(f) {
    if (V.fx.length > 900) V.fx.shift();
    V.fx.push(f);
  }
  function burst(x, y, col, n, speed, size, life) {
    n = Math.ceil(n * quality());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.25 + Math.random() * 0.75);
      const l = (life || 0.45) * (0.6 + Math.random() * 0.7);
      addFx({ k: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, col, sz: (size || 2.4) * (0.6 + Math.random() * 0.8), drag: 0.9, g: 0 });
    }
  }
  function debris(x, y, col, n) {
    n = Math.ceil(n * quality());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 80 + Math.random() * 260, l = 0.5 + Math.random() * 0.5;
      addFx({ k: 'sq', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: l, max: l, col, sz: 3 + Math.random() * 6, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12, g: 500 });
    }
  }
  function addRing(x, y, r, col, life, w) { addFx({ k: 'ring', x, y, r, life, max: life, col, w: w || 4 }); }
  function streak(x0, y0, x1, y1, col, w, life) { addFx({ k: 'streak', x0, y0, x1, y1, life, max: life, col, w }); }
  function flashFx(x, y, r, col, life) { addFx({ k: 'flash', x, y, r, life, max: life, col }); }
  function floatText(x, y, txt, col, size) { V.floats.push({ x, y, txt, col, life: 0.95, max: 0.95, size: size || 15, vx: (Math.random() - 0.5) * 30 }); }
  function banner(txt, col) {
    V.banners.push({ txt, col, life: 2.3, max: 2.3 });
    if (V.banners.length > 3) V.banners.shift();
  }
  function nameOf(G, i) { return i >= 0 ? G.world.players[i].name : L('neutrals'); }

  /* ------------------------------ события мира -> эффекты ------------------------------ */
  function onEvent(e, G) {
    const w = G.world, me = G.me, mp = w.players[me];
    const near = clamp(1 - Math.hypot(e.x - mp.x, e.y - mp.y) / 1100, 0.25, 1);
    switch (e.type) {
      case 'hit':
        if (e.sh) { burst(e.x, e.y, '#7cf2ff', 6, 170); sfx('hit', 0.5); break; }
        burst(e.x, e.y, e.t === me ? '#ff6b80' : '#ffffff', 4, 210);
        if (e.d > 0 && ST().dmg) floatText(e.x, e.y, String(e.d), e.t === me ? '#ff8a98' : (e.t === -2 ? '#ffd27a' : '#ffffff'), e.d >= 30 ? 21 : 15);
        if (e.t === 0 || e.t === 1) V.pflash[e.t] = 0.12;
        if (e.t === me) { V.shake = Math.min(10, V.shake + 2 + e.d * 0.2); V.hurt = Math.min(1, V.hurt + 0.25 + e.d * 0.012); sfx('hurt'); }
        else { if (e.t === 1 - me) V.hitmark = 1; sfx('hit', 0.6 * near); }
        break;
      case 'sbreak':
        burst(e.x, e.y, '#7cf2ff', 26, 380, 3); addRing(e.x, e.y, 40, '#7cf2ff', 0.4); sfx('boom', 0.35 * near);
        break;
      case 'boom':
        addRing(e.x, e.y, e.r, '#ffb04a', 0.55, 5); addRing(e.x, e.y, e.r * 0.55, '#ffffff', 0.35, 3);
        flashFx(e.x, e.y, e.r * 1.6, '#ffb04a', 0.35);
        burst(e.x, e.y, '#ffb04a', Math.round(e.r / 4), 300, 3); burst(e.x, e.y, '#ffffff', Math.round(e.r / 8), 260, 2);
        V.shake = Math.min(16, V.shake + e.r / 16 * near);
        if (e.r >= 150) V.flashA = 0.55;
        sfx('boom', near);
        break;
      case 'nova':
        addRing(e.x, e.y, e.r, '#8be9ff', 0.45, 6); addRing(e.x, e.y, e.r * 0.6, '#ffffff', 0.3, 3);
        flashFx(e.x, e.y, e.r, '#8be9ff', 0.3); V.shake = Math.min(12, V.shake + 4);
        sfx('nova', e.p === me ? 1 : near);
        break;
      case 'dash':
        if (e.p === me) V.jumpCool = 0.12;
        streak(e.x, e.y, e.x1, e.y1, '#ffffff', 16, 0.3); addRing(e.x, e.y, 26, '#ffffff', 0.25, 3);
        burst(e.x1, e.y1, '#9fd8ff', 8, 160);
        sfx('dash', e.p === me ? 1 : 0.45 * near);
        break;
      case 'blink':
        if (e.p === me) V.jumpCool = 0.2;
        streak(e.x0, e.y0, e.x1, e.y1, '#b78cff', 12, 0.4);
        addRing(e.x0, e.y0, 34, '#b78cff', 0.4, 4); addRing(e.x1, e.y1, 34, '#b78cff', 0.45, 4);
        flashFx(e.x0, e.y0, 60, '#b78cff', 0.3); flashFx(e.x1, e.y1, 60, '#b78cff', 0.35);
        burst(e.x0, e.y0, '#d4bcff', 14, 220); burst(e.x1, e.y1, '#d4bcff', 14, 220);
        sfx('blink', e.p === me ? 1 : 0.5);
        break;
      case 'wb':
        debris(e.x, e.y, TEAM[e.o] || '#8899bb', 12); burst(e.x, e.y, '#ffffff', 6, 200);
        sfx('break', 0.7 * near);
        break;
      case 'wbuild':
        V.anim[e.i] = { t0: V.time, k: 'b' };
        burst(e.x, e.y, TEAM[e.o] || '#fff', 8, 150, 2, 0.35); addRing(e.x, e.y, 24, TEAM[e.o] || '#fff', 0.3, 2);
        sfx('build', e.o === me ? 1 : 0.4 * near);
        break;
      case 'wedit':
        V.anim[e.i] = { t0: V.time, k: 'e' };
        burst(e.x, e.y, '#ffcf5a', 6, 140, 2, 0.3);
        sfx('edit', e.o === me ? 1 : 0.4 * near);
        break;
      case 'kill':
        V.feed.push({ txt: e.k >= 0 ? nameOf(G, e.k) + '  ✕  ' + nameOf(G, e.v) : L('died', { n: nameOf(G, e.v) }), until: V.time + 5.5, k: e.k });
        if (V.feed.length > 5) V.feed.shift();
        if (e.k === me) { banner(L('kill_banner'), '#ff6b80'); V.zoom = Math.min(0.06, V.zoom + 0.035); }
        if (e.v === me) V.hurt = 1;
        sfx('kill', e.k === me || e.v === me ? 1 : 0.5);
        break;
      case 'lvl': {
        const p = w.players[e.p];
        floatText(p.x, p.y - 34, L('lvl_up', { n: e.l }), '#ffcf5a', 20);
        addRing(p.x, p.y, 70, '#ffcf5a', 0.6, 5); burst(p.x, p.y, '#ffcf5a', 22, 260, 3);
        if (e.p === me) { banner(L('lvl_up', { n: e.l }), '#ffcf5a'); sfx('level'); } else sfx('level', 0.35);
        break;
      }
      case 'pick':
        if (e.k === 'scrap') {
          floatText(e.x, e.y - 10, '+' + C.SCRAP_VAL, '#ffc56b', 17);
          burst(e.x, e.y, '#ffc56b', 12, 200); addRing(e.x, e.y, 26, '#ffc56b', 0.3, 2);
          sfx('pickup', e.p === me ? 1 : 0.3 * near);
        } else {
          const col = MODCOL[MODS[e.m]];
          addRing(e.x, e.y, 60, col, 0.5, 4); burst(e.x, e.y, col, 24, 280, 3); flashFx(e.x, e.y, 70, col, 0.4);
          if (e.p === me) banner(L('got_mod', { m: L('mod_' + MODS[e.m]) }), col);
          sfx('capture', e.p === me ? 1 : 0.4 * near);
        }
        break;
      case 'loot':
        if (e.p === me) floatText(e.x, e.y - 20, L('got_mats', { n: e.mats }), '#ffc56b', 16);
        break;
      case 'spawn':
        addRing(e.x, e.y, e.k === 'cap' ? 50 : 24, e.k === 'cap' ? MODCOL[MODS[e.m]] : '#ffc56b', 0.5, 3);
        break;
      case 'mod': {
        const col = MODCOL[MODS[e.m]];
        if (MODS[e.m] === 'blink') break;
        addRing(e.x, e.y, 46, col, 0.45, 4); flashFx(e.x, e.y, 70, col, 0.3); burst(e.x, e.y, col, 14, 240);
        if (MODS[e.m] === 'haste') streak(e.x - 40, e.y, e.x + 40, e.y, col, 8, 0.3);
        sfx('mod', e.p === me ? 1 : 0.5 * near);
        break;
      }
      case 'heal':
        addRing(e.x, e.y, e.r, '#6dff9e', 0.7, 5); flashFx(e.x, e.y, e.r, '#6dff9e', 0.45);
        for (let i = 0, n = Math.ceil(16 * quality()); i < n; i++) {
          const a = Math.random() * TAU, d = Math.random() * e.r * 0.8;
          addFx({ k: 'p', x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, vx: 0, vy: -50 - Math.random() * 60, life: 0.8, max: 0.8, col: '#6dff9e', sz: 3, drag: 0.98, g: 0 });
        }
        break;
      default: break;
    }
  }

  /* ------------------------------ обновление визуального состояния ------------------------------ */
  function updateState(G, dt) {
    const w = G.world, me = G.me;
    V.time += dt;

    for (const e of w.ev) { if (!V.seen.has(e)) { V.seen.add(e); onEvent(e, G); } }

    V.shake *= Math.pow(0.002, dt); V.zoom *= Math.pow(0.02, dt);
    V.hurt = Math.max(0, V.hurt - dt * 1.6); V.hitmark = Math.max(0, V.hitmark - dt * 4);
    V.spread = Math.max(0, V.spread - dt * 3); V.flashA = Math.max(0, V.flashA - dt * 1.6);

    for (let i = V.fx.length - 1; i >= 0; i--) {
      const f = V.fx[i];
      f.life -= dt;
      if (f.life <= 0) { V.fx.splice(i, 1); continue; }
      if (f.k === 'p' || f.k === 'sq') {
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.drag) { const d = Math.pow(f.drag, dt * 60); f.vx *= d; f.vy *= d; }
        if (f.g) f.vy += f.g * dt;
        if (f.k === 'sq') f.rot += f.vr * dt;
      }
    }
    for (let i = V.floats.length - 1; i >= 0; i--) {
      const f = V.floats[i];
      f.life -= dt; f.y -= 44 * dt; f.x += f.vx * dt;
      if (f.life <= 0) V.floats.splice(i, 1);
    }
    for (let i = V.banners.length - 1; i >= 0; i--) { V.banners[i].life -= dt; if (V.banners[i].life <= 0) V.banners.splice(i, 1); }
    V.feed = V.feed.filter(f => f.until > V.time);
    for (const k in V.ready) V.ready[k] = Math.max(0, V.ready[k] - dt);
    for (const k in V.wflash) { V.wflash[k] -= dt; if (V.wflash[k] <= 0) delete V.wflash[k]; }
    V.pflash[0] = Math.max(0, V.pflash[0] - dt); V.pflash[1] = Math.max(0, V.pflash[1] - dt);
    for (const m of V.motes) {
      m.x += (m.vx + Math.sin(V.time * 0.5 + m.ph) * 6) * dt; m.y += m.vy * dt;
      if (m.y < -10) { m.y = C.H + 10; m.x = Math.random() * C.W; }
      if (m.x < -10) m.x = C.W + 10; else if (m.x > C.W + 10) m.x = -10;
    }

    /* игроки: выстрелы, пыль, рывки, фантомы */
    w.players.forEach((p, i) => {
      V.recoil[i] = Math.max(0, V.recoil[i] - dt * 9);
      const cdf = p.cd.fire;
      if (cdf > V.pcd[i] + 0.03 && !p.dead) {
        V.recoil[i] = 1;
        const mx = p.x + Math.cos(p.aim) * (C.PR + 16), my = p.y + Math.sin(p.aim) * (C.PR + 16);
        const sg = cdf > 0.5;
        flashFx(mx, my, sg ? 46 : 30, '#ffe9a0', 0.09);
        burst(mx, my, '#ffd27a', sg ? 8 : 3, 260, 2, 0.2);
        sfx(sg ? 'shotgun' : 'shoot', i === me ? 1 : 0.4);
        if (i === me) V.spread = Math.min(1, V.spread + (sg ? 0.7 : 0.3));
      }
      V.pcd[i] = cdf;

      if (V.rsn[i] !== p.rsn) { V.rsn[i] = p.rsn; V.last[i] = null; addRing(p.x, p.y, 60, TEAM[i], 0.6, 4); burst(p.x, p.y, TEAM[i], 18, 280, 3); }
      if (p.dead) { V.last[i] = null; return; }
      const lp = V.last[i];
      if (lp) {
        const dx = p.x - lp.x, dy = p.y - lp.y, d = Math.hypot(dx, dy);
        if (d > 42 && d < 500 && !(p.id === me && V.jumpCool > 0)) {
          streak(lp.x, lp.y, p.x, p.y, TEAM[i], 12, 0.25);
        }
        const speed = d / Math.max(dt, 0.001);
        if (speed > 60 && speed < 700) {
          V.dustT[i] += dt;
          if (V.dustT[i] > 0.06) {
            V.dustT[i] = 0;
            if (Math.random() < quality() + 0.2) addFx({ k: 'p', x: p.x - dx / d * 8 + (Math.random() - 0.5) * 6, y: p.y - dy / d * 8 + 8 + (Math.random() - 0.5) * 4, vx: -dx / d * 20, vy: -dy / d * 20, life: 0.35, max: 0.35, col: '#8fb0e8', sz: 3, drag: 0.9, g: 0, soft: true });
          }
        }
      }
      V.last[i] = { x: p.x, y: p.y };
      if (p.haste > 0) {
        V.afterT[i] += dt;
        if (V.afterT[i] > 0.05) { V.afterT[i] = 0; addFx({ k: 'ghost', x: p.x, y: p.y, aim: p.aim, life: 0.28, max: 0.28, col: '#ffe14d' }); }
      }
    });
    V.ghost[0] = Math.max(w.players[0].hp, lerp(V.ghost[0], w.players[0].hp, Math.min(1, dt * 1.6)));
    V.ghost[1] = Math.max(w.players[1].hp, lerp(V.ghost[1], w.players[1].hp, Math.min(1, dt * 1.6)));

    /* ядра */
    w.cores.forEach((c, i) => {
      if (c.hp < V.cprev[i] - 0.5) V.cflash[i] = 0.16;
      V.cprev[i] = c.hp; V.cflash[i] = Math.max(0, V.cflash[i] - dt);
      V.cghost[i] = Math.max(c.hp, lerp(V.cghost[i], c.hp, Math.min(1, dt * 1.2)));
      if (c.hp > 0 && c.hp < C.CORE_HP * 0.4 && Math.random() < dt * 14 * quality()) {
        addFx({ k: 'p', x: c.x + (Math.random() - 0.5) * 40, y: c.y - 20, vx: (Math.random() - 0.5) * 20, vy: -50 - Math.random() * 40, life: 1, max: 1, col: Math.random() < 0.4 ? '#ffb04a' : '#6b7690', sz: 5, drag: 0.98, g: 0, soft: true });
      }
    });
    w.camps.forEach((m, i) => {
      if (V.campPrev[i] !== undefined && m.hp < V.campPrev[i] - 0.5) V.campFlash[i] = 0.14;
      V.campPrev[i] = m.hp; V.campFlash[i] = Math.max(0, (V.campFlash[i] || 0) - dt);
    });

    /* готовность способностей */
    const mp = w.players[me];
    for (const k of ['nova', 'dash', 'strike']) {
      const cur = mp.cd[k];
      if ((V.cdPrev[k] || 0) > 0 && cur <= 0) V.ready[k] = 0.45;
      V.cdPrev[k] = cur;
    }

    /* отсчёт и «В БОЙ» */
    if (w.cdown > 0) {
      const n = Math.ceil(w.cdown);
      if (n !== V.lastCount) { V.lastCount = n; sfx('count'); }
    } else if (!V.goDone && G.ready) {
      V.goDone = true; V.goT = V.time; sfx('go');
    }

    V.fpsAcc += dt; V.fpsN++;
    if (V.fpsAcc >= 0.5) { V.fps = V.fpsN / V.fpsAcc; V.fpsAcc = 0; V.fpsN = 0; }
    if (V.jumpCool > 0) V.jumpCool -= dt;
  }

  /* ------------------------------ статичный фон ------------------------------ */
  function buildBG(w) {
    const c = document.createElement('canvas'); c.width = C.W; c.height = C.H;
    const g = c.getContext('2d');
    const fg = g.createLinearGradient(0, 0, C.W, C.H);
    fg.addColorStop(0, '#0d1629'); fg.addColorStop(0.5, '#0a111f'); fg.addColorStop(1, '#0d1528');
    g.fillStyle = fg; g.fillRect(0, 0, C.W, C.H);
    for (let t = 0; t < 2; t++) {
      const x0 = t === 0 ? 0 : C.W, x1 = C.W / 2;
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, rgba(TEAM[t], 0.1)); gr.addColorStop(1, rgba(TEAM[t], 0));
      g.fillStyle = gr; g.fillRect(t === 0 ? 0 : C.W / 2, 0, C.W / 2, C.H);
    }
    for (let gy = 0; gy < C.GH; gy++) for (let gx = 0; gx < C.GW; gx++) {
      if ((gx + gy) % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.014)'; g.fillRect(gx * C.T, gy * C.T, C.T, C.T); }
    }
    g.strokeStyle = 'rgba(120,170,255,0.07)'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x <= C.W; x += C.T) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, C.H); }
    for (let y = 0; y <= C.H; y += C.T) { g.moveTo(0, y + 0.5); g.lineTo(C.W, y + 0.5); }
    g.stroke();
    g.strokeStyle = 'rgba(120,170,255,0.10)'; g.setLineDash([12, 14]);
    g.beginPath(); g.moveTo(C.W / 2, 0); g.lineTo(C.W / 2, C.H); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.arc(C.W / 2, C.H / 2, 120, 0, TAU); g.stroke();
    for (let i = 0; i < w.rock.length; i++) {
      if (!w.rock[i]) continue;
      const x = (i % C.GW) * C.T, y = Math.floor(i / C.GW) * C.T;
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 4, y + 7, C.T, C.T);
      g.fillStyle = '#1b2440'; g.fillRect(x, y, C.T, C.T);
      const tg = g.createLinearGradient(x, y, x, y + C.T);
      tg.addColorStop(0, '#3b4a76'); tg.addColorStop(1, '#27325a');
      g.fillStyle = tg; g.fillRect(x + 3, y + 3, C.T - 6, C.T - 8);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 3, y + 3, C.T - 6, 3);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 14, y + 12); g.lineTo(x + 24, y + 26); g.lineTo(x + 20, y + 38); g.stroke();
    }
    g.strokeStyle = 'rgba(120,170,255,0.3)'; g.lineWidth = 4; g.strokeRect(2, 2, C.W - 4, C.H - 4);
    return c;
  }

  /* ------------------------------ мир ------------------------------ */
  function drawFloor(w) {
    if (!bgc) bgc = buildBG(w);
    ctx.drawImage(bgc, 0, 0);
    const t = V.time;
    ctx.globalCompositeOperation = 'lighter';
    for (const c of w.cores) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + c.team);
      glow(c.x, c.y, 250 + pulse * 20, TEAM[c.team], 0.34);
    }
    for (const m of V.motes) glow(m.x, m.y, 5 + m.r * 2, '#7cb8ff', 0.18 + 0.12 * Math.sin(t + m.ph));
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPickups(w) {
    const t = V.time;
    w.scraps.forEach((s, i) => {
      if (!s.alive) {
        ctx.strokeStyle = 'rgba(255,200,110,.12)'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        return;
      }
      const bob = Math.sin(t * 3 + i) * 2.5;
      ctx.globalCompositeOperation = 'lighter'; glow(s.x, s.y + bob, 30, '#ffb347', 0.5 + 0.2 * Math.sin(t * 4 + i)); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(s.x, s.y + bob); ctx.rotate(t * 0.9 + i);
      hexPath(0, 0, 11, 0); ctx.fillStyle = '#ffc56b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#8a5416'; ctx.stroke();
      ctx.fillStyle = '#3a2208'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      ctx.restore();
    });
    w.caps.forEach((c, i) => {
      const col = MODCOL[MODS[c.kind]];
      if (!c.alive) {
        const frac = 1 - clamp(c.resp / C.CAP_RESP, 0, 1);
        ctx.strokeStyle = 'rgba(160,190,255,.14)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(c.x, c.y, 24, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,190,255,.45)';
        ctx.beginPath(); ctx.arc(c.x, c.y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
        if (c.resp <= 10) text(String(Math.max(0, Math.ceil(c.resp))), c.x, c.y + 6, 16, 'rgba(200,220,255,.7)', 'center', 800);
        return;
      }
      const bob = Math.sin(t * 2.4 + i) * 3, pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
      ctx.globalCompositeOperation = 'lighter'; glow(c.x, c.y + bob, 62 + pulse * 10, col, 0.6); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(c.x, c.y + bob);
      ctx.rotate(t * 0.7);
      ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 2.5; ctx.setLineDash([8, 7]);
      hexPath(0, 0, 30, 0); ctx.stroke(); ctx.setLineDash([]);
      ctx.rotate(-t * 0.7);
      hexPath(0, 0, 24, Math.PI / 6); ctx.fillStyle = 'rgba(8,14,28,.92)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      drawModIcon(ctx, c.kind, 0, 0, 12, col, 1);
      ctx.restore();
    });
  }

  function drawWalls(w, me) {
    const t = V.time, mp = w.players[me];
    const hoverI = w.cellIdx(V.G.mouse.x, V.G.mouse.y);
    for (let i = 0; i < w.walls.length; i++) {
      const wl = w.walls[i];
      if (!wl) { V.wprev[i] = undefined; continue; }
      const x = (i % C.GW) * C.T, y = Math.floor(i / C.GW) * C.T, cx = x + C.T / 2, cy = y + C.T / 2;
      const col = TEAM[wl.own] || '#8899bb', ratio = clamp(wl.hp / C.WALL_HP, 0, 1);
      if (V.wprev[i] !== undefined && wl.hp < V.wprev[i] - 0.5) {
        V.wflash[i] = 1.5;
        burst(x + Math.random() * C.T, y + Math.random() * C.T, '#ffffff', 3, 180, 2, 0.3);
        burst(cx, cy, col, 3, 150, 2, 0.35);
      }
      V.wprev[i] = wl.hp;

      let sc = 1, alpha = 1, flash = 0, reveal = 1, build = false;
      const an = V.anim[i];
      if (an) {
        const dur = an.k === 'b' ? 0.34 : 0.22, a = (V.time - an.t0) / dur;
        if (a >= 1) delete V.anim[i];
        else if (an.k === 'b') { build = true; reveal = easeOut(a); sc = 0.6 + 0.4 * easeBack(a); alpha = clamp(a * 2.5, 0, 1); flash = (1 - a) * 0.75; }
        else { sc = 1 + 0.2 * Math.sin(a * Math.PI); flash = (1 - a) * 0.5; }
      }
      const hf = V.wflash[i] ? clamp((V.wflash[i] - 1.35) / 0.15, 0, 1) : 0;

      ctx.save();
      ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      ctx.globalAlpha = alpha;
      if (build) { ctx.beginPath(); ctx.rect(x - 2, y + C.T * (1 - reveal) - 2, C.T + 4, C.T * reveal + 4); ctx.clip(); }

      if (wl.st === 0) {
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x + 3, y + 5, C.T - 2, C.T - 2);
        ctx.fillStyle = rgba(col, 0.32); ctx.fillRect(x + 1, y + 1, C.T - 2, C.T - 2);
        const g = ctx.createLinearGradient(x, y, x, y + C.T);
        g.addColorStop(0, rgba(col, 0.95)); g.addColorStop(1, rgba(col, 0.55));
        ctx.fillStyle = g; ctx.fillRect(x + 4, y + 4, C.T - 8, C.T - 8);
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x + 4, y + 4, C.T - 8, 4);
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 4.5, y + 4.5, C.T - 9, C.T - 9);
        ctx.beginPath(); ctx.moveTo(x + 4, cy); ctx.lineTo(x + C.T - 4, cy); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2;
        if (ratio < 0.7) { ctx.beginPath(); ctx.moveTo(x + 10, y + 6); ctx.lineTo(x + 24, y + 26); ctx.lineTo(x + 18, y + 44); ctx.stroke(); }
        if (ratio < 0.35) { ctx.beginPath(); ctx.moveTo(x + 42, y + 8); ctx.lineTo(x + 30, y + 30); ctx.lineTo(x + 40, y + 46); ctx.stroke(); }
      } else if (wl.st === 1) {
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 3, y + 5, C.T - 2, C.T - 2);
        ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 6; ctx.strokeRect(x + 4, y + 4, C.T - 8, C.T - 8);
        ctx.fillStyle = 'rgba(140,210,255,.16)'; ctx.fillRect(x + 7, y + 7, C.T - 14, C.T - 14);
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, y + 7); ctx.lineTo(cx, y + C.T - 7); ctx.moveTo(x + 7, cy); ctx.lineTo(x + C.T - 7, cy); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(x + 9, y + 9); ctx.lineTo(x + 20, y + 9); ctx.lineTo(x + 9, y + 20); ctx.fill();
      } else {
        ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
        ctx.strokeRect(x + 4, y + 4, C.T - 8, C.T - 8); ctx.setLineDash([]);
        ctx.fillStyle = rgba(col, 0.13); ctx.fillRect(x + 4, y + 4, C.T - 8, C.T - 8);
        ctx.fillStyle = rgba(col, 0.55); ctx.fillRect(x + 4, y + 4, 4, C.T - 8); ctx.fillRect(x + C.T - 8, y + 4, 4, C.T - 8);
      }
      if (flash > 0 || hf > 0) { ctx.fillStyle = 'rgba(255,255,255,' + clamp(flash + hf * 0.6, 0, 0.9) + ')'; ctx.fillRect(x + 1, y + 1, C.T - 2, C.T - 2); }
      if (build) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x - 2, y + C.T * (1 - reveal) - 1.5, C.T + 4, 3);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      /* здоровье: при наведении и несколько секунд после попадания */
      if (i === hoverI || V.wflash[i]) {
        const bw = C.T - 6, by = y - 11;
        bar(x + 3, by, bw, 6, ratio, hpCol(ratio));
      }
    }
    void mp;
  }

  function drawHover(w, me) {
    const m = V.G.mouse, i = w.cellIdx(m.x, m.y);
    if (i < 0 || !w.walls[i]) return;
    const wl = w.walls[i], mp = w.players[me];
    const x = (i % C.GW) * C.T, y = Math.floor(i / C.GW) * C.T;
    const col = TEAM[wl.own] || '#fff';
    const own = wl.own === me, inRange = Math.hypot(x + C.T / 2 - mp.x, y + C.T / 2 - mp.y) <= C.EDIT_RANGE;
    ctx.strokeStyle = own && inRange ? '#ffcf5a' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
    ctx.strokeRect(x - 1, y - 1, C.T + 2, C.T + 2);
    const ratio = clamp(wl.hp / C.WALL_HP, 0, 1);
    const pw = 150, ph = own ? 62 : 50;
    let px = x + C.T / 2 - pw / 2, py = y - ph - 18;
    if (py < 4) py = y + C.T + 14;
    px = clamp(px, 6, C.W - pw - 6);
    ctx.fillStyle = 'rgba(8,14,28,.92)'; rr(px, py, pw, ph, 10); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.5; ctx.stroke();
    text(L('wall_t' + wl.st) + ' · ' + L(own ? 'wall_mine' : 'wall_enemy'), px + 10, py + 19, 13, '#fff', 'left', 700);
    bar(px + 10, py + 27, pw - 20, 10, ratio, hpCol(ratio));
    text(Math.max(0, Math.round(wl.hp)) + ' / ' + C.WALL_HP, px + pw / 2, py + 35.5, 10, '#fff', 'center', 800);
    if (own) text('[' + lab('edit') + '] ' + L('edit'), px + 10, py + 54, 12, inRange ? '#ffcf5a' : '#6b7690', 'left', 700);
  }

  function drawMines(w, me) {
    const t = V.time;
    for (const m of w.mines) {
      const mine = m.own === me, a = mine ? 1 : 0.2;
      const armed = m.arm <= 0, blink = armed ? 0.5 + 0.5 * Math.sin(t * 6) : 0.2;
      ctx.globalAlpha = a;
      if (mine) { ctx.strokeStyle = 'rgba(255,179,71,.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(m.x, m.y, C.MOD.mine.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = '#1b2236'; ctx.beginPath(); ctx.arc(m.x, m.y, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 6; i++) { const ang = i * TAU / 6; ctx.beginPath(); ctx.moveTo(m.x + Math.cos(ang) * 11, m.y + Math.sin(ang) * 11); ctx.lineTo(m.x + Math.cos(ang) * 16, m.y + Math.sin(ang) * 16); ctx.stroke(); }
      ctx.fillStyle = armed ? 'rgba(255,90,70,' + (0.4 + blink * 0.6) + ')' : 'rgba(255,200,70,.5)';
      ctx.beginPath(); ctx.arc(m.x, m.y, 3.5, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawTurrets(w) {
    for (const tr of w.turrets) {
      const col = TEAM[tr.own];
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(tr.x + 2, tr.y + 8, 15, 8, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba('#ff8ad8', 0.5); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(tr.life / C.MOD.turret.life, 0, 1)); ctx.stroke();
      ctx.fillStyle = '#18213a'; hexPath(tr.x, tr.y, 15, Math.PI / 6); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.translate(tr.x, tr.y); ctx.rotate(tr.aim);
      ctx.fillStyle = '#cfd8ee'; ctx.fillRect(2, -3.5, 22, 7); ctx.fillStyle = '#ff8ad8'; ctx.fillRect(20, -3.5, 4, 7);
      ctx.restore();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(tr.x, tr.y, 5, 0, TAU); ctx.fill();
      bar(tr.x - 18, tr.y - 30, 36, 5, tr.hp / C.MOD.turret.hp, '#ff8ad8');
    }
  }

  function drawCamps(w) {
    const t = V.time;
    w.camps.forEach((m, i) => {
      if (!m.alive) {
        ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        return;
      }
      const col = m.boss ? '#ff9a3d' : '#a06bff', pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + i);
      ctx.globalCompositeOperation = 'lighter'; glow(m.x, m.y, m.r * 3.2 + pulse * 6, col, 0.5); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(t * (m.boss ? 0.5 : 0.8));
      ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 2; ctx.setLineDash([6, 6]); hexPath(0, 0, m.r + 12, 0); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      hexPath(m.x, m.y, m.r, 0.5 + t * 0.2);
      ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#0a0f19'; ctx.stroke();
      if (V.campFlash[i] > 0) { ctx.fillStyle = 'rgba(255,255,255,.7)'; hexPath(m.x, m.y, m.r, 0.5 + t * 0.2); ctx.fill(); }
      bar(m.x - 26, m.y - m.r - 16, 52, 6, m.hp / m.max, col);
      text(String(m.souls), m.x, m.y + 5, 14, '#0a0f19', 'center', 800);
    });
  }

  function drawCores(w) {
    const t = V.time;
    w.cores.forEach((c, i) => {
      const col = TEAM[c.team], pulse = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.strokeStyle = rgba(col, 0.12 + 0.05 * pulse); ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
      ctx.beginPath(); ctx.arc(c.x, c.y, C.TOWER_RANGE, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter'; glow(c.x, c.y, 120 + pulse * 10, col, 0.5); ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(t * 0.4 * (i ? -1 : 1));
      ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 3; ctx.setLineDash([16, 10]);
      ctx.beginPath(); ctx.arc(0, 0, C.CORE_R + 14, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      ctx.fillStyle = '#10182a'; ctx.beginPath(); ctx.arc(c.x, c.y, C.CORE_R, 0, TAU); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.stroke();
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(-t * 0.9 * (i ? -1 : 1));
      hexPath(0, 0, 22 + pulse * 2, 0); ctx.fillStyle = col; ctx.fill();
      hexPath(0, 0, 12, 0); ctx.fillStyle = '#0a1224'; ctx.fill();
      ctx.restore();
      if (V.cflash[i] > 0) { ctx.fillStyle = 'rgba(255,255,255,' + clamp(V.cflash[i] * 5, 0, 0.8) + ')'; ctx.beginPath(); ctx.arc(c.x, c.y, C.CORE_R, 0, TAU); ctx.fill(); }
      bar(c.x - 46, c.y - C.CORE_R - 24, 92, 9, c.hp / C.CORE_HP, hpCol(c.hp / C.CORE_HP), V.cghost[i] / C.CORE_HP);
    });
  }

  function drawStrikes(w) {
    const t = V.time;
    for (const s of w.strikes) {
      const k = 1 - clamp(s.t / C.STRIKE.delay, 0, 1), pulse = 0.5 + 0.5 * Math.sin(t * 22);
      ctx.fillStyle = 'rgba(255,80,60,' + (0.08 + 0.2 * k) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, C.STRIKE.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,90,' + (0.5 + 0.5 * pulse) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, C.STRIKE.r, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, C.STRIKE.r * k, 0, TAU); ctx.stroke();
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(t * 2);
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); } ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,140,100,' + (0.12 * k) + ')'; ctx.fillRect(s.x - 8 - 20 * k, 0, 16 + 40 * k, s.y);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawProjectiles(w) {
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (const b of w.pr) {
      const col = b.own === 0 || b.own === 1 ? TEAM[b.own] : '#c58cff';
      const len = b.kind === 'b' ? 0.03 : 0.022;
      ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = b.kind === 'b' ? 7 : 8;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * len * 1.6, b.y - b.vy * len * 1.6); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = b.kind === 'b' ? 3.5 : 4.5;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * len, b.y - b.vy * len); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.009, b.y - b.vy * 0.009); ctx.lineTo(b.x, b.y); ctx.stroke();
      glow(b.x, b.y, 12, col, 0.6);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt';
  }

  function drawPlayer(p, G, w) {
    const col = TEAM[p.id], t = V.time, i = p.id, me = G.me;
    if (p.dead) {
      ctx.globalAlpha = 0.3; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, C.PR, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      text('✕', p.x, p.y + 6, 18, '#fff', 'center', 800);
      if (i !== me) text(String(Math.ceil(p.resp)), p.x, p.y - 24, 16, '#fff', 'center', 800, 0.8);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 9, C.PR, C.PR * 0.55, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    glow(p.x, p.y, 38, col, 0.4);
    if (p.haste > 0) glow(p.x, p.y, 52, '#ffe14d', 0.5 + 0.2 * Math.sin(t * 20));
    ctx.globalCompositeOperation = 'source-over';

    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aim);
    const rc = V.recoil[i] * 5;
    const gg = ctx.createLinearGradient(0, -4, 0, 4); gg.addColorStop(0, '#eef3ff'); gg.addColorStop(1, '#8c9bbd');
    ctx.fillStyle = gg; ctx.fillRect(8 - rc, -3.5, C.PR + 12, 7);
    ctx.fillStyle = col; ctx.fillRect(C.PR + 14 - rc, -3.5, 6, 7);
    ctx.restore();

    const bg = ctx.createRadialGradient(p.x - 5, p.y - 6, 2, p.x, p.y, C.PR);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.25, col); bg.addColorStop(1, rgba(col, 0.7));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(p.x, p.y, C.PR, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#0a0f19'; ctx.stroke();
    if (V.pflash[i] > 0) { ctx.fillStyle = 'rgba(255,255,255,' + clamp(V.pflash[i] * 7, 0, 0.9) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, C.PR, 0, TAU); ctx.fill(); }
    if (i === me) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, C.PR + 5, 0, TAU); ctx.stroke();
    }

    if (p.shield > 0) {
      const f = clamp(p.shield / C.MOD.shield.hp, 0.2, 1);
      const flick = p.shieldT < 1.2 ? (0.5 + 0.5 * Math.sin(t * 24)) : 1;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(124,242,255,' + (0.10 + 0.08 * f) * flick + ')'; ctx.beginPath(); ctx.arc(0, 0, C.PR + 10, 0, TAU); ctx.fill();
      ctx.rotate(t * 1.6); ctx.strokeStyle = 'rgba(124,242,255,' + (0.5 + 0.4 * f) * flick + ')'; ctx.lineWidth = 3; ctx.setLineDash([14, 7]);
      ctx.beginPath(); ctx.arc(0, 0, C.PR + 10, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }

    const ratio = p.hp / p.mh;
    bar(p.x - 24, p.y - C.PR - 17, 48, 6, ratio, hpCol(ratio), V.ghost[i] / p.mh);
    if (p.shield > 0) { ctx.fillStyle = '#7cf2ff'; ctx.fillRect(p.x - 24, p.y - C.PR - 20, 48 * clamp(p.shield / C.MOD.shield.hp, 0, 1), 2.5); }
    shadowText(p.name + ' · ' + w.lvl(p), p.x, p.y - C.PR - 24, 12, '#fff', 'center', 700);
  }

  function drawFx() {
    for (const f of V.fx) {
      const k = clamp(f.life / f.max, 0, 1);
      switch (f.k) {
        case 'p':
          ctx.globalCompositeOperation = f.soft ? 'source-over' : 'lighter';
          ctx.globalAlpha = f.soft ? k * 0.4 : k; ctx.fillStyle = f.col;
          ctx.fillRect(f.x - f.sz / 2, f.y - f.sz / 2, f.sz, f.sz);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          break;
        case 'sq':
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = clamp(k * 1.5, 0, 1);
          ctx.fillStyle = f.col; ctx.fillRect(-f.sz / 2, -f.sz / 2, f.sz, f.sz);
          ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-f.sz / 2, -f.sz / 2, f.sz, f.sz * 0.3);
          ctx.restore(); ctx.globalAlpha = 1;
          break;
        case 'ring':
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = f.col; ctx.globalAlpha = k; ctx.lineWidth = f.w * k + 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * easeOut(1 - k) + 4, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          break;
        case 'streak':
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          ctx.strokeStyle = f.col; ctx.globalAlpha = k * 0.7; ctx.lineWidth = f.w * k;
          ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = k * 0.6; ctx.lineWidth = f.w * k * 0.3;
          ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke();
          ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.globalCompositeOperation = 'source-over';
          break;
        case 'flash':
          ctx.globalCompositeOperation = 'lighter'; glow(f.x, f.y, f.r, f.col, k); ctx.globalCompositeOperation = 'source-over';
          break;
        case 'ghost':
          ctx.globalAlpha = k * 0.4; ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, C.PR, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          break;
        default: break;
      }
    }
    for (const f of V.floats) {
      const k = clamp(f.life / f.max, 0, 1);
      const sc = f.life > f.max - 0.12 ? 1 + (f.life - (f.max - 0.12)) * 4 : 1;
      shadowText(f.txt, f.x, f.y, f.size * sc, f.col, 'center', 800, clamp(k * 2, 0, 1));
    }
  }

  function drawBuildGhost(G, w, me) {
    if (me.dead || w.over || !G.ready) return;
    const m = G.mouse;
    if (G.held.build || G.rdown) {
      ctx.strokeStyle = 'rgba(124,242,255,.18)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(me.x, me.y, C.BUILD_RANGE, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    let x = m.x, y = m.y;
    const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy);
    if (d > C.BUILD_RANGE) { x = me.x + dx / d * C.BUILD_RANGE; y = me.y + dy / d * C.BUILD_RANGE; }
    const gx = Math.floor(x / C.T), gy = Math.floor(y / C.T);
    if (gx >= 0 && gy >= 0 && gx < C.GW && gy < C.GH) {
      const i = gy * C.GW + gx;
      const free = !w.rock[i] && !w.walls[i], rich = me.mats >= C.WALL_COST;
      const ok = free && rich;
      ctx.strokeStyle = ok ? 'rgba(120,255,170,.8)' : 'rgba(255,110,110,.55)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.strokeRect(gx * C.T + 2, gy * C.T + 2, C.T - 4, C.T - 4); ctx.setLineDash([]);
      if (free) {
        ctx.fillStyle = ok ? 'rgba(120,255,170,.1)' : 'rgba(255,110,110,.1)'; ctx.fillRect(gx * C.T + 2, gy * C.T + 2, C.T - 4, C.T - 4);
        text(rich ? '−' + C.WALL_COST : '0', gx * C.T + C.T / 2, gy * C.T + C.T / 2 + 5, 13, ok ? '#a8ffcb' : '#ff8a98', 'center', 800);
      }
    }
  }

  function drawCrosshair(G) {
    const m = G.mouse, g = 7 + V.spread * 10, t = V.time;
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x - g - 8, m.y); ctx.lineTo(m.x - g, m.y); ctx.moveTo(m.x + g, m.y); ctx.lineTo(m.x + g + 8, m.y);
    ctx.moveTo(m.x, m.y - g - 8); ctx.lineTo(m.x, m.y - g); ctx.moveTo(m.x, m.y + g); ctx.lineTo(m.x, m.y + g + 8);
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(m.x, m.y, 1.8, 0, TAU); ctx.fill();
    if (V.hitmark > 0) {
      ctx.strokeStyle = 'rgba(255,90,90,' + V.hitmark + ')'; ctx.lineWidth = 3;
      const s = 10 + (1 - V.hitmark) * 6;
      ctx.beginPath(); ctx.moveTo(m.x - s, m.y - s); ctx.lineTo(m.x - s / 2, m.y - s / 2); ctx.moveTo(m.x + s, m.y - s); ctx.lineTo(m.x + s / 2, m.y - s / 2);
      ctx.moveTo(m.x - s, m.y + s); ctx.lineTo(m.x - s / 2, m.y + s / 2); ctx.moveTo(m.x + s, m.y + s); ctx.lineTo(m.x + s / 2, m.y + s / 2); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    void t;
  }

  /* ------------------------------ HUD ------------------------------ */
  function drawHud(G, w, me) {
    const t = V.time;
    const remain = Math.max(0, C.MATCH_TIME - w.time);
    const low = remain < 30 && w.time > 0;
    ctx.fillStyle = 'rgba(8,14,28,.8)'; rr(C.W / 2 - 64, 10, 128, 48, 14); ctx.fill();
    ctx.strokeStyle = low ? 'rgba(255,90,100,' + (0.5 + 0.5 * Math.sin(t * 8)) + ')' : 'rgba(120,170,255,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    text(Math.floor(remain / 60) + ':' + String(Math.floor(remain % 60)).padStart(2, '0'), C.W / 2, 46, 30, low ? '#ff8a98' : '#fff', 'center', 800);

    for (const p of w.players) {
      const left = p.id === 0, bw = 520, x = left ? 24 : C.W - 24 - bw, core = w.cores[p.id];
      const rating = w.ratings ? ' (' + w.ratings[p.id] + ')' : '';
      text(p.name + rating, left ? x : x + bw, 28, 17, TEAM[p.id], left ? 'left' : 'right', 800);
      text(L('kills') + ' ' + p.kills, left ? x + bw : x, 28, 13, '#9db0d4', left ? 'right' : 'left', 600);
      ctx.fillStyle = 'rgba(8,14,28,.8)'; rr(x - 2, 34, bw + 4, 22, 11); ctx.fill();
      bar(x, 36, bw, 18, core.hp / C.CORE_HP, TEAM[p.id], V.cghost[p.id] / C.CORE_HP);
      text(L('core') + ' ' + Math.round(core.hp), x + bw / 2, 50, 12, '#fff', 'center', 800);
    }

    V.feed.forEach((f, i) => {
      const left = f.until - V.time, a = clamp(left * 2, 0, 1);
      shadowText(f.txt, C.W - 28, 92 + i * 22, 14, f.k === G.me ? '#ffcf5a' : '#e9f0ff', 'right', 700, a);
    });

    /* нижняя панель */
    const x0 = (C.W - 960) / 2, y0 = C.H - 122;
    ctx.fillStyle = 'rgba(8,14,28,.86)'; rr(x0, y0, 960, 110, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,255,.2)'; ctx.lineWidth = 1.5; ctx.stroke();

    const ratio = me.hp / me.mh;
    bar(x0 + 20, y0 + 14, 330, 20, ratio, hpCol(ratio), V.ghost[G.me] / me.mh);
    text(Math.ceil(me.hp) + ' / ' + me.mh, x0 + 185, y0 + 29.5, 13, '#fff', 'center', 800);
    const poor = me.mats < C.WALL_COST * 3;
    bar(x0 + 20, y0 + 42, 330, 13, me.mats / C.MAXMATS, poor && Math.sin(t * 8) > 0 ? '#ff7a55' : '#d8a657');
    text(L('mats') + ' ' + Math.floor(me.mats) + ' / ' + C.MAXMATS, x0 + 185, y0 + 52.5, 11, '#fff', 'center', 800);
    const lv = w.lvl(me), prog = lv >= C.MAXLVL ? 1 : (me.souls % C.SPL) / C.SPL;
    bar(x0 + 20, y0 + 63, 330, 13, prog, '#b98bff');
    text(L('level') + ' ' + lv + ' · ' + L('souls') + ' ' + me.souls, x0 + 185, y0 + 73.5, 11, '#fff', 'center', 800);

    const wk = [['wep1', 'rifle'], ['wep2', 'shotgun']];
    wk.forEach((a, i) => {
      const on = G.wep === i, bx = x0 + 20 + i * 110;
      text(lab(a[0]), bx, y0 + 98, 12, on ? '#ffcf5a' : '#8da0c4', 'left', 800);
      text(L(a[1]), bx + 18, y0 + 98, 12, on ? '#ffffff' : '#8da0c4', 'left', 600);
    });

    const lvStrike = lv >= C.STRIKE.lvl;
    const abil = [
      { id: 'wall', key: lab('build'), name: L('wall'), cd: 0, max: 1, dim: me.mats < C.WALL_COST, sub: String(C.WALL_COST) },
      { id: 'edit', key: lab('edit'), name: L('edit'), cd: me.cd.edit, max: 0.2 },
      { id: 'nova', key: lab('nova'), name: L('nova'), cd: me.cd.nova, max: C.NOVA.cd },
      { id: 'dash', key: lab('dash'), name: L('dash'), cd: me.cd.dash, max: C.DASH.cd },
      { id: 'strike', key: lab('strike'), name: L('strike'), cd: me.cd.strike, max: C.STRIKE.cd, dim: !lvStrike, sub: lvStrike ? '' : 'LV' + C.STRIKE.lvl }
    ];
    abil.forEach((a, i) => {
      const bx = x0 + 372 + i * 76, by = y0 + 14, bw = 68, bh = 82;
      ctx.fillStyle = a.dim ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.08)'; rr(bx, by, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; ctx.stroke();
      text(a.key, bx + bw / 2, by + 38, a.key.length > 3 ? 15 : 26, a.dim ? '#4f5b78' : '#fff', 'center', 800);
      text(a.name, bx + bw / 2, by + 72, 11, a.dim ? '#4f5b78' : '#cfd8ee', 'center', 700);
      if (a.cd > 0) {
        ctx.save(); rr(bx, by, bw, bh, 12); ctx.clip();
        ctx.fillStyle = 'rgba(0,0,0,.66)'; ctx.beginPath(); ctx.moveTo(bx + bw / 2, by + bh / 2);
        ctx.arc(bx + bw / 2, by + bh / 2, 90, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(a.cd / a.max, 0, 1)); ctx.closePath(); ctx.fill();
        ctx.restore();
        if (a.max > 1) text(a.cd.toFixed(1), bx + bw / 2, by + 52, 17, '#fff', 'center', 800);
      }
      const rd = V.ready[a.id];
      if (rd > 0) { ctx.strokeStyle = 'rgba(124,242,255,' + clamp(rd * 2.2, 0, 1) + ')'; ctx.lineWidth = 3; rr(bx - 2, by - 2, bw + 4, bh + 4, 14); ctx.stroke(); }
      if (a.sub) text(a.sub, bx + bw - 6, by + 14, 11, '#ffcf5a', 'right', 800);
    });

    for (let s = 0; s < 2; s++) {
      const bx = x0 + 768 + s * 92, by = y0 + 14, bw = 84, bh = 82, id = me.mods[s];
      const key = lab(s === 0 ? 'mod1' : 'mod2');
      if (id >= 0) {
        const col = MODCOL[MODS[id]], pulse = 0.5 + 0.5 * Math.sin(t * 4 + s);
        ctx.fillStyle = rgba(col, 0.1 + 0.08 * pulse); rr(bx, by, bw, bh, 12); ctx.fill();
        ctx.strokeStyle = rgba(col, 0.7 + 0.3 * pulse); ctx.lineWidth = 2; ctx.stroke();
        drawModIcon(ctx, id, bx + bw / 2, by + 34, 17, col, 1);
        text(L('mod_' + MODS[id]), bx + bw / 2, by + 72, 10, '#fff', 'center', 700);
        ctx.fillStyle = col; rr(bx + 6, by + 6, 22, 18, 5); ctx.fill();
        text(key, bx + 17, by + 19.5, key.length > 2 ? 9 : 12, '#06101e', 'center', 900);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); rr(bx, by, bw, bh, 12); ctx.stroke(); ctx.setLineDash([]);
        text(key, bx + bw / 2, by + 40, 22, '#4f5b78', 'center', 800);
        text(L('mod_empty'), bx + bw / 2, by + 72, 11, '#4f5b78', 'center', 600);
      }
    }
    if (poor && w.time > 3) text(L('hint_scrap'), C.W / 2, y0 - 34, 13, '#ffb08a', 'center', 700, 0.5 + 0.5 * Math.sin(t * 5));

    /* центральные надписи */
    if (!G.ready) {
      shadowText(L('connecting'), C.W / 2, C.H / 2, 32, '#fff', 'center', 800, 0.6 + 0.4 * Math.sin(t * 4));
    } else if (w.cdown > 0) {
      const n = Math.ceil(w.cdown), frac = n - w.cdown;
      const sc = 1.7 - 0.7 * easeOut(clamp(frac * 3, 0, 1)), a = 1 - clamp((frac - 0.7) / 0.3, 0, 1);
      ctx.save(); ctx.translate(C.W / 2, C.H / 2 - 20); ctx.scale(sc, sc);
      shadowText(String(n), 0, 40, 130, '#ffffff', 'center', 900, a);
      ctx.restore();
      shadowText(L('get_ready'), C.W / 2, C.H / 2 + 60, 26, '#9db0d4', 'center', 700);
    } else if (V.goT >= 0 && t - V.goT < 1.3) {
      const k = (t - V.goT) / 1.3;
      ctx.save(); ctx.translate(C.W / 2, C.H / 2 - 30); ctx.scale(0.8 + easeBack(clamp(k * 3, 0, 1)) * 0.5 + k * 0.4, 0.8 + easeBack(clamp(k * 3, 0, 1)) * 0.5 + k * 0.4);
      shadowText(L('fight'), 0, 30, 100, '#ffcf5a', 'center', 900, 1 - clamp((k - 0.6) / 0.4, 0, 1));
      ctx.restore();
    } else if (me.dead && !w.over) {
      shadowText(L('you_died'), C.W / 2, C.H / 2 - 10, 46, '#ff5d73', 'center', 900);
      shadowText(L('respawn_in', { n: Math.ceil(me.resp) }), C.W / 2, C.H / 2 + 32, 22, '#fff', 'center', 700);
    }

    V.banners.forEach((b, i) => {
      const age = b.max - b.life, pop = easeBack(clamp(age / 0.3, 0, 1)), a = clamp(b.life / 0.5, 0, 1);
      ctx.save(); ctx.translate(C.W / 2, 150 + i * 44); ctx.scale(pop, pop);
      shadowText(b.txt, 0, 0, 30, b.col, 'center', 900, a);
      ctx.restore();
    });

    if (w.time < 14 && G.ready && w.cdown <= 0) {
      const hint = L('hint_game', {
        up: lab('up'), left: ' ' + lab('left'), down: ' ' + lab('down'), right: ' ' + lab('right'),
        build: lab('build'), edit: lab('edit'), nova: lab('nova'), dash: lab('dash'), mod1: lab('mod1'), mod2: lab('mod2')
      });
      text(hint, C.W / 2, C.H - 136, 13, 'rgba(255,255,255,.6)', 'center', 600, clamp((14 - w.time) / 2, 0, 1));
    }
    if (ST().fps) text(Math.round(V.fps) + ' FPS', 14, C.H - 14, 12, 'rgba(255,255,255,.6)', 'left', 700);
  }

  /* ------------------------------ кадр ------------------------------ */
  function frame(G, dt) {
    if (!V || V.G !== G) reset(G);
    const w = G.world, me = w.players[G.me];
    updateState(G, dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const zoom = 1 + V.zoom + (w.cdown > 0 ? 0.07 * (w.cdown / C.COUNTDOWN) : 0);
    const sh = V.shake * ST().shake;
    ctx.translate(C.W / 2 + (sh > 0.3 ? (Math.random() - 0.5) * sh : 0), C.H / 2 + (sh > 0.3 ? (Math.random() - 0.5) * sh : 0));
    ctx.scale(zoom, zoom); ctx.translate(-C.W / 2, -C.H / 2);

    drawFloor(w);
    drawPickups(w);
    drawWalls(w, G.me);
    drawMines(w, G.me);
    drawCamps(w);
    drawCores(w);
    drawTurrets(w);
    drawStrikes(w);
    drawProjectiles(w);
    for (const p of w.players) drawPlayer(p, G, w);
    drawFx();
    drawBuildGhost(G, w, me);
    drawHover(w, G.me);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (V.hurt > 0) {
      const g = ctx.createRadialGradient(C.W / 2, C.H / 2, C.H * 0.35, C.W / 2, C.H / 2, C.H * 0.95);
      g.addColorStop(0, 'rgba(255,40,70,0)'); g.addColorStop(1, 'rgba(255,40,70,' + clamp(V.hurt * 0.55, 0, 0.6) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, C.W, C.H);
    }
    if (me.hp < me.mh * 0.28 && !me.dead) {
      const g = ctx.createRadialGradient(C.W / 2, C.H / 2, C.H * 0.45, C.W / 2, C.H / 2, C.H);
      g.addColorStop(0, 'rgba(255,40,70,0)'); g.addColorStop(1, 'rgba(255,40,70,' + (0.18 + 0.12 * Math.sin(V.time * 6)) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, C.W, C.H);
    }
    if (V.flashA > 0) { ctx.fillStyle = 'rgba(255,240,220,' + V.flashA + ')'; ctx.fillRect(0, 0, C.W, C.H); }
    if (w.over) { ctx.fillStyle = 'rgba(3,6,13,' + clamp((V.time - (V.overT || (V.overT = V.time))) * 0.5, 0, 0.35) + ')'; ctx.fillRect(0, 0, C.W, C.H); }

    drawHud(G, w, me);
    if (!me.dead && !w.over) drawCrosshair(G);
  }

  window.Render = {
    init(canvas) { cv = canvas; ctx = cv.getContext('2d'); },
    reset, frame, drawModIcon, MODCOL, TEAM
  };
})();
