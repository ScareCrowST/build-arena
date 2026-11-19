/* =====================================================================
   BUILD ARENA — игровое ядро (без DOM, работает и в браузере, и в Node)
   Хост (или практика) считает всю симуляцию; гость получает снапшоты.
   ===================================================================== */
(function (root) {
  'use strict';

  const C = {
    W: 1600, H: 900, T: 50, GW: 32, GH: 18,
    PR: 16, SPEED: 240,
    // материалы: самовосстановления НЕТ, добываются только на карте
    START_MATS: 80, MAXMATS: 150, WALL_COST: 10, WALL_HP: 240, BUILD_RANGE: 230, EDIT_RANGE: 280,
    SCRAP_VAL: 25, SCRAP_RESP: 20, SCRAP_R: 30,
    CAMP_MATS: 20, BOSS_MATS: 60, KILL_MATS: 40, RESPAWN_MATS: 30,
    CAP_RESP: 40, CAP_FIRST: 12, CAP_R: 32,
    CORE_HP: 1500, CORE_R: 44, TOWER_RANGE: 340, TOWER_DMG: 9, TOWER_CD: 0.85,
    MATCH_TIME: 240, COUNTDOWN: 3,
    SPL: 8, MAXLVL: 8,
    WEAPONS: [
      { name: 'rifle', cd: 0.17, dmg: 13, spd: 950, life: 0.9, pellets: 1, spread: 0.03 },
      { name: 'shotgun', cd: 0.85, dmg: 8, spd: 800, life: 0.32, pellets: 6, spread: 0.2 }
    ],
    NOVA: { cd: 8, r: 150, dmg: 30, wall: 90, kb: 640 },
    STRIKE: { cd: 40, r: 115, dmg: 115, wall: 400, delay: 1.0, range: 650, lvl: 3 },
    DASH: { cd: 5, dist: 210 },
    MOD: {
      shield: { hp: 70, time: 5 },
      repair: { heal: 45, r: 230 },
      mine: { dmg: 65, r: 34, life: 45, slow: 2, arm: 0.7, max: 3 },
      haste: { time: 5, spd: 1.45, fire: 0.7 },
      turret: { hp: 90, life: 12, range: 340, dmg: 7, cd: 0.45 },
      blink: { dist: 360 }
    }
  };

  const MODS = ['shield', 'repair', 'mine', 'haste', 'turret', 'blink'];

  // Неразрушимые камни (левая половина, правая отражается зеркально)
  const ROCKS = [
    [8, 4], [8, 5], [8, 12], [8, 13], [12, 8], [12, 9], [6, 0], [6, 1], [6, 16], [6, 17],
    [14, 3], [14, 14], [11, 6], [11, 11], [15, 7], [15, 10], [10, 1], [10, 16]
  ];

  const CAMP_DEFS = [
    { x: 450, y: 200, boss: false }, { x: 450, y: 700, boss: false },
    { x: 1150, y: 200, boss: false }, { x: 1150, y: 700, boss: false },
    { x: 800, y: 450, boss: true }
  ];

  const SCRAP_L = [[275, 325], [275, 575], [525, 450], [675, 250], [675, 650]];
  const SCRAP_SPOTS = SCRAP_L.concat(SCRAP_L.map(([x, y]) => [1600 - x, y]), [[800, 160], [800, 740]]);
  const CAP_L = [[600, 175], [600, 725]];
  const CAP_SPOTS = CAP_L.concat(CAP_L.map(([x, y]) => [1600 - x, y]));

  const CD_KEYS = ['fire', 'build', 'edit', 'nova', 'strike', 'dash', 'mod'];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r1 = v => Math.round(v * 10) / 10;
  const lvlOf = s => 1 + Math.min(C.MAXLVL - 1, Math.floor(s / C.SPL));
  const spawnOf = i => ({ x: i === 0 ? 270 : C.W - 270, y: C.H / 2 });
  const randMod = () => Math.floor(Math.random() * MODS.length);

  function mkPlayer(i, name, bot) {
    const s = spawnOf(i);
    return {
      id: i, name: name || ('P' + (i + 1)),
      x: s.x, y: s.y, tx: s.x, ty: s.y, aim: i ? Math.PI : 0,
      hp: 100, mh: 100, mats: C.START_MATS, souls: 0, kills: 0, deaths: 0,
      dead: false, resp: 0, rsn: 0, wep: 0, kx: 0, ky: 0, slow: 0, ign: 0,
      mods: [-1, -1], shield: 0, shieldT: 0, haste: 0,
      bot: !!bot, remote: false,
      cd: { fire: 0, build: 0, edit: 0, nova: 0, strike: 0, dash: 0, mod: 0 }
    };
  }

  function mkCamp(d) {
    const max = d.boss ? 700 : 160;
    return {
      x: d.x, y: d.y, boss: d.boss, hp: max, max, r: d.boss ? 32 : 20,
      souls: d.boss ? 14 : 4, alive: true, resp: 0, cd: 0, agg: 0, tgt: -1,
      range: d.boss ? 320 : 260
    };
  }

  class World {
    constructor(opts) {
      opts = opts || {};
      const n = opts.names || ['Игрок 1', 'Игрок 2'];
      const bots = opts.bots || [false, false];
      this.time = 0; this.cdown = C.COUNTDOWN; this.over = null;
      this.seq = 0; this.lseq = 0; this.lastEv = 0; this.ev = []; this.guest = false;
      this.rock = new Uint8Array(C.GW * C.GH);
      for (const [gx, gy] of ROCKS) {
        this.rock[gy * C.GW + gx] = 1;
        this.rock[gy * C.GW + (C.GW - 1 - gx)] = 1;
      }
      this.walls = new Array(C.GW * C.GH).fill(null);
      this.cores = [
        { x: 150, y: C.H / 2, hp: C.CORE_HP, team: 0, cd: 0 },
        { x: C.W - 150, y: C.H / 2, hp: C.CORE_HP, team: 1, cd: 0 }
      ];
      this.players = [mkPlayer(0, n[0], bots[0]), mkPlayer(1, n[1], bots[1])];
      this.camps = CAMP_DEFS.map(mkCamp);
      this.scraps = SCRAP_SPOTS.map(([x, y]) => ({ x, y, alive: true, resp: 0 }));
      this.caps = CAP_SPOTS.map(([x, y]) => ({ x, y, alive: false, resp: C.CAP_FIRST, kind: randMod() }));
      this.pr = []; this.strikes = []; this.mines = []; this.turrets = [];
    }

    /* ---------- события (для эффектов и сети) ---------- */
    emit(type, data) {
      const e = Object.assign({ s: this.guest ? -(++this.lseq) : ++this.seq, ts: this.time, type }, data);
      this.ev.push(e);
    }
    pruneEv() {
      while (this.ev.length && this.ev[0].ts < this.time - 1.0) this.ev.shift();
    }

    /* ---------- геометрия ---------- */
    cellIdx(x, y) {
      const gx = Math.floor(x / C.T), gy = Math.floor(y / C.T);
      if (gx < 0 || gy < 0 || gx >= C.GW || gy >= C.GH) return -1;
      return gy * C.GW + gx;
    }
    bodyBlocked(i) { return this.rock[i] === 1 || (this.walls[i] !== null && this.walls[i].st !== 2); }

    resolve(p) {
      const r = C.PR, T = C.T;
      for (let it = 0; it < 2; it++) {
        const gx0 = Math.floor((p.x - r) / T), gx1 = Math.floor((p.x + r) / T);
        const gy0 = Math.floor((p.y - r) / T), gy1 = Math.floor((p.y + r) / T);
        for (let gy = gy0; gy <= gy1; gy++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            if (gx < 0 || gy < 0 || gx >= C.GW || gy >= C.GH) continue;
            const i = gy * C.GW + gx;
            if (!this.bodyBlocked(i)) continue;
            const nx = clamp(p.x, gx * T, gx * T + T), ny = clamp(p.y, gy * T, gy * T + T);
            let dx = p.x - nx, dy = p.y - ny;
            const d2 = dx * dx + dy * dy;
            if (d2 < r * r) {
              if (d2 < 1e-6) {
                const cx = gx * T + T / 2, cy = gy * T + T / 2;
                dx = p.x - cx; dy = p.y - cy;
                if (Math.abs(dx) > Math.abs(dy)) p.x = cx + (dx < 0 ? -1 : 1) * (T / 2 + r);
                else p.y = cy + (dy < 0 ? -1 : 1) * (T / 2 + r);
              } else {
                const d = Math.sqrt(d2);
                p.x = nx + dx / d * r; p.y = ny + dy / d * r;
              }
            }
          }
        }
      }
      for (const c of this.cores) {
        const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), min = C.CORE_R + r;
        if (d < min && d > 0) { p.x = c.x + dx / d * min; p.y = c.y + dy / d * min; }
      }
      p.x = clamp(p.x, r, C.W - r); p.y = clamp(p.y, r, C.H - r);
    }

    movePlayer(p, mx, my, dt) {
      if (p.dead) return;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      const sp = C.SPEED * (p.slow > 0 ? 0.6 : 1) * (p.haste > 0 ? C.MOD.haste.spd : 1);
      p.x += (mx * sp + p.kx) * dt; p.y += (my * sp + p.ky) * dt;
      const dec = Math.exp(-6 * dt); p.kx *= dec; p.ky *= dec;
      this.resolve(p);
    }

    dash(p, dx, dy) {
      if (p.dead || p.cd.dash > 0 || this.over || this.cdown > 0) return false;
      let l = Math.hypot(dx, dy);
      if (l < 0.01) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); l = 1; }
      dx /= l; dy /= l;
      const x0 = p.x, y0 = p.y;
      for (let i = 0; i < 21; i++) { p.x += dx * 10; p.y += dy * 10; this.resolve(p); }
      this.emit('dash', { x: x0, y: y0, x1: p.x, y1: p.y, p: p.id });
      p.cd.dash = C.DASH.cd;
      return true;
    }

    /* ---------- прогрессия ---------- */
    lvl(p) { return lvlOf(p.souls); }
    dmgMul(p) { return 1 + 0.08 * (lvlOf(p.souls) - 1); }
    addSouls(p, n) {
      const before = lvlOf(p.souls);
      p.souls += n;
      const after = lvlOf(p.souls);
      p.mh = 100 + 15 * (after - 1);
      if (after > before) {
        p.hp = Math.min(p.mh, p.hp + p.mh * 0.3);
        this.emit('lvl', { p: p.id, l: after });
      }
    }
    addMats(p, n) { p.mats = Math.min(C.MAXMATS, p.mats + n); }
    giveMod(p, kind) {
      const slot = p.mods.indexOf(-1);
      if (slot < 0) return false;
      p.mods[slot] = kind;
      return true;
    }

    /* ---------- урон ---------- */
    hurtPlayer(p, dmg, src) {
      if (p.dead || this.over) return;
      if (p.shield > 0) {
        const ab = Math.min(p.shield, dmg);
        p.shield -= ab; dmg -= ab;
        this.emit('hit', { x: p.x, y: p.y - 10, d: 0, t: p.id, sh: 1 });
        if (p.shield <= 0.01) { p.shield = 0; p.shieldT = 0; this.emit('sbreak', { x: p.x, y: p.y, p: p.id }); }
        if (dmg <= 0.01) return;
      }
      p.hp -= dmg;
      this.emit('hit', { x: p.x, y: p.y - 10, d: Math.round(dmg), t: p.id });
      if (p.hp <= 0) {
        p.hp = 0; p.dead = true; p.deaths++;
        p.shield = 0; p.shieldT = 0; p.haste = 0;
        p.resp = 5 + (lvlOf(p.souls) - 1);
        const k = (src === 0 || src === 1) ? this.players[src] : null;
        if (k && k !== p) { k.kills++; this.addSouls(k, 6); this.addMats(k, C.KILL_MATS); }
        this.emit('kill', { k: k ? k.id : -1, v: p.id });
        this.emit('boom', { x: p.x, y: p.y, r: 45 });
      }
    }
    damageWall(i, dmg) {
      const w = this.walls[i];
      if (!w) return;
      w.hp -= dmg;
      if (w.hp <= 0) {
        this.walls[i] = null;
        this.emit('wb', { x: (i % C.GW) * C.T + C.T / 2, y: Math.floor(i / C.GW) * C.T + C.T / 2, o: w.own });
      }
    }
    hurtCore(c, dmg, srcTeam) {
      if (this.over || c.hp <= 0) return;
      c.hp = Math.max(0, c.hp - dmg);
      this.emit('hit', { x: c.x + (Math.random() - 0.5) * 40, y: c.y + (Math.random() - 0.5) * 40, d: Math.round(dmg), t: -2 });
      if (c.hp <= 0) {
        this.emit('boom', { x: c.x, y: c.y, r: 160 });
        this.setOver(srcTeam === 0 || srcTeam === 1 ? srcTeam : 1 - c.team, 'core');
      }
    }
    hurtCamp(m, dmg, p) {
      if (!m.alive) return;
      m.hp -= dmg; m.agg = 4; m.tgt = p ? p.id : m.tgt;
      this.emit('hit', { x: m.x, y: m.y - 14, d: Math.round(dmg), t: -1 });
      if (m.hp <= 0) {
        m.alive = false; m.resp = m.boss ? 60 : 25;
        this.emit('boom', { x: m.x, y: m.y, r: m.r * 2.2 });
        if (p) {
          this.addSouls(p, m.souls);
          this.addMats(p, m.boss ? C.BOSS_MATS : C.CAMP_MATS);
          this.emit('loot', { x: m.x, y: m.y, p: p.id, mats: m.boss ? C.BOSS_MATS : C.CAMP_MATS });
          if (m.boss) {
            const kind = randMod();
            if (this.giveMod(p, kind)) this.emit('pick', { k: 'cap', p: p.id, x: m.x, y: m.y, m: kind });
          }
        }
      }
    }
    hurtTurret(k, dmg) {
      const t = this.turrets[k];
      if (!t) return;
      t.hp -= dmg;
      this.emit('hit', { x: t.x, y: t.y - 16, d: Math.round(dmg), t: -1 });
      if (t.hp <= 0) {
        this.turrets.splice(k, 1);
        this.emit('boom', { x: t.x, y: t.y, r: 40 });
      }
    }
    /* область: бьёт вражеские турели и обезвреживает вражеские мины */
    aoe(x, y, r, dmg, own) {
      for (let k = this.turrets.length - 1; k >= 0; k--) {
        const t = this.turrets[k];
        if (t.own !== own && Math.hypot(t.x - x, t.y - y) < r + 14) this.hurtTurret(k, dmg);
      }
      for (let k = this.mines.length - 1; k >= 0; k--) {
        const m = this.mines[k];
        if (m.own !== own && Math.hypot(m.x - x, m.y - y) < r) {
          this.mines.splice(k, 1);
          this.emit('boom', { x: m.x, y: m.y, r: 30 });
        }
      }
    }
    setOver(w, why) {
      if (this.over) return;
      this.over = { w, why };
      this.emit('end', { w, why });
    }

    /* ---------- действия игроков (вызывает хост) ---------- */
    act(i, a) {
      const p = this.players[i];
      if (!p || !a || p.dead || this.over || this.cdown > 0) return;
      if (Number.isFinite(a.aim)) p.aim = a.aim;
      switch (a.k) {
        case 'fire': this.fire(p, a.w | 0); break;
        case 'build': if (Number.isFinite(a.x) && Number.isFinite(a.y)) this.build(p, a.x, a.y); break;
        case 'edit': if (Number.isFinite(a.x) && Number.isFinite(a.y)) this.edit(p, a.x, a.y); break;
        case 'nova': this.nova(p); break;
        case 'strike': if (Number.isFinite(a.x) && Number.isFinite(a.y)) this.strike(p, a.x, a.y); break;
        case 'mod': this.useMod(p, a.i | 0, a.x, a.y); break;
        default: break;
      }
    }

    fire(p, wi) {
      const wp = C.WEAPONS[wi] || C.WEAPONS[0];
      if (p.cd.fire > 0) return;
      p.wep = C.WEAPONS[wi] ? wi : 0;
      p.cd.fire = wp.cd * (p.haste > 0 ? C.MOD.haste.fire : 1);
      const dmg = wp.dmg * this.dmgMul(p);
      for (let k = 0; k < wp.pellets; k++) {
        const ang = p.aim + (Math.random() - 0.5) * 2 * wp.spread;
        const c = Math.cos(ang), s = Math.sin(ang);
        this.pr.push({
          x: p.x + c * (C.PR + 4), y: p.y + s * (C.PR + 4),
          vx: c * wp.spd, vy: s * wp.spd, dmg, own: p.id, kind: 'b', life: wp.life
        });
      }
    }

    build(p, x, y) {
      if (p.cd.build > 0 || p.mats < C.WALL_COST) return;
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d > C.BUILD_RANGE) { x = p.x + dx / d * C.BUILD_RANGE; y = p.y + dy / d * C.BUILD_RANGE; }
      const gx = Math.floor(x / C.T), gy = Math.floor(y / C.T);
      if (gx < 0 || gy < 0 || gx >= C.GW || gy >= C.GH) return;
      const i = gy * C.GW + gx;
      if (this.rock[i] || this.walls[i]) return;
      const x0 = gx * C.T, y0 = gy * C.T;
      const near = (px, py, rad) => {
        const nx = clamp(px, x0, x0 + C.T), ny = clamp(py, y0, y0 + C.T);
        return Math.hypot(px - nx, py - ny) < rad;
      };
      for (const q of this.players) if (!q.dead && near(q.x, q.y, C.PR + 1)) return;
      for (const c of this.cores) if (near(c.x, c.y, C.CORE_R + 6)) return;
      for (const m of this.camps) if (m.alive && near(m.x, m.y, m.r + 6)) return;
      this.walls[i] = { hp: C.WALL_HP, st: 0, own: p.id };
      p.mats -= C.WALL_COST; p.cd.build = 0.12;
      this.emit('wbuild', { i, x: x0 + C.T / 2, y: y0 + C.T / 2, o: p.id });
    }

    edit(p, x, y) {
      if (p.cd.edit > 0) return;
      if (Math.hypot(x - p.x, y - p.y) > C.EDIT_RANGE) return;
      const i = this.cellIdx(x, y);
      if (i < 0) return;
      const w = this.walls[i];
      if (!w || w.own !== p.id) return;
      w.st = (w.st + 1) % 3;
      p.cd.edit = 0.2;
      this.emit('wedit', { i, x: (i % C.GW) * C.T + C.T / 2, y: Math.floor(i / C.GW) * C.T + C.T / 2, st: w.st, o: p.id });
    }

    nova(p) {
      if (p.cd.nova > 0) return;
      p.cd.nova = C.NOVA.cd;
      const mul = this.dmgMul(p), R = C.NOVA.r;
      const dmg = (C.NOVA.dmg + 6 * (lvlOf(p.souls) - 1)) * mul;
      this.emit('nova', { x: p.x, y: p.y, r: R, p: p.id });
      const e = this.players[1 - p.id];
      if (!e.dead) {
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
        if (d < R + C.PR) {
          this.hurtPlayer(e, dmg, p.id);
          const k = C.NOVA.kb / Math.max(1, d);
          e.kx += dx * k; e.ky += dy * k; e.slow = 1.2;
          this.emit('kb', { p: e.id, kx: dx * k, ky: dy * k });
        }
      }
      for (const m of this.camps) if (m.alive && Math.hypot(m.x - p.x, m.y - p.y) < R + m.r) this.hurtCamp(m, dmg, p);
      this.aoe(p.x, p.y, R, dmg, p.id);
      const g0x = Math.floor((p.x - R) / C.T), g1x = Math.floor((p.x + R) / C.T);
      const g0y = Math.floor((p.y - R) / C.T), g1y = Math.floor((p.y + R) / C.T);
      for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
        if (gx < 0 || gy < 0 || gx >= C.GW || gy >= C.GH) continue;
        const i = gy * C.GW + gx, w = this.walls[i];
        if (!w || w.own === p.id) continue;
        if (Math.hypot(gx * C.T + C.T / 2 - p.x, gy * C.T + C.T / 2 - p.y) < R + C.T / 2) this.damageWall(i, C.NOVA.wall);
      }
    }

    strike(p, x, y) {
      if (lvlOf(p.souls) < C.STRIKE.lvl || p.cd.strike > 0) return;
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d > C.STRIKE.range) { x = p.x + dx / d * C.STRIKE.range; y = p.y + dy / d * C.STRIKE.range; }
      p.cd.strike = C.STRIKE.cd;
      this.strikes.push({ x, y, t: C.STRIKE.delay, own: p.id, dmg: C.STRIKE.dmg * this.dmgMul(p) });
    }

    /* ---------- модули: одноразовые способности из слотов ---------- */
    useMod(p, slot, x, y) {
      if (p.dead || this.over || this.cdown > 0 || p.cd.mod > 0) return false;
      slot |= 0;
      if (slot < 0 || slot > 1) return false;
      const id = p.mods[slot];
      if (id < 0) return false;
      if (!Number.isFinite(x) || !Number.isFinite(y)) { x = p.x + Math.cos(p.aim) * 100; y = p.y + Math.sin(p.aim) * 100; }
      p.mods[slot] = -1; p.cd.mod = 0.4;
      const M = C.MOD;
      switch (MODS[id]) {
        case 'shield':
          p.shield = M.shield.hp; p.shieldT = M.shield.time;
          break;
        case 'repair': {
          p.hp = Math.min(p.mh, p.hp + M.repair.heal);
          for (let i = 0; i < this.walls.length; i++) {
            const w = this.walls[i];
            if (!w || w.own !== p.id) continue;
            const cx = (i % C.GW) * C.T + C.T / 2, cy = Math.floor(i / C.GW) * C.T + C.T / 2;
            if (Math.hypot(cx - p.x, cy - p.y) < M.repair.r) w.hp = C.WALL_HP;
          }
          this.emit('heal', { x: p.x, y: p.y, r: M.repair.r, p: p.id });
          break;
        }
        case 'mine': {
          let n = 0;
          for (const m of this.mines) if (m.own === p.id) n++;
          if (n >= M.mine.max) {
            const k = this.mines.findIndex(m => m.own === p.id);
            if (k >= 0) this.mines.splice(k, 1);
          }
          this.mines.push({ x: p.x, y: p.y, own: p.id, life: M.mine.life, arm: M.mine.arm });
          break;
        }
        case 'haste':
          p.haste = M.haste.time;
          break;
        case 'turret': {
          for (let k = this.turrets.length - 1; k >= 0; k--) if (this.turrets[k].own === p.id) this.turrets.splice(k, 1);
          let tx = p.x + Math.cos(p.aim) * 36, ty = p.y + Math.sin(p.aim) * 36;
          const ci = this.cellIdx(tx, ty);
          if (ci < 0 || this.rock[ci] || this.walls[ci]) { tx = p.x; ty = p.y; }
          this.turrets.push({ x: tx, y: ty, own: p.id, hp: M.turret.hp, life: M.turret.life, cd: 0.5, aim: p.aim });
          break;
        }
        case 'blink': {
          const dx = x - p.x, dy = y - p.y;
          let d = Math.hypot(dx, dy), ux, uy;
          if (d < 1) { ux = Math.cos(p.aim); uy = Math.sin(p.aim); d = M.blink.dist; } else { ux = dx / d; uy = dy / d; }
          const dist = Math.min(d, M.blink.dist);
          const x0 = p.x, y0 = p.y;
          const q = { x: p.x + ux * dist, y: p.y + uy * dist };
          this.resolve(q);
          p.x = q.x; p.y = q.y; p.tx = q.x; p.ty = q.y; p.kx = 0; p.ky = 0;
          if (p.remote) p.ign = 0.3;
          this.emit('blink', { x0, y0, x1: p.x, y1: p.y, p: p.id });
          this.emit('tp', { p: p.id, x: p.x, y: p.y });
          break;
        }
        default: break;
      }
      this.emit('mod', { p: p.id, m: id, x: p.x, y: p.y });
      return true;
    }

    /* ---------- обновление мира ---------- */
    update(dt) {
      this.pruneEv();
      if (this.over) return;
      if (this.cdown > 0) { this.cdown = Math.max(0, this.cdown - dt); return; }
      this.time += dt;
      for (const p of this.players) this.updatePlayer(p, dt);
      this.updateCamps(dt);
      this.updateTowers(dt);
      this.updatePickups(dt);
      this.updateMines(dt);
      this.updateTurrets(dt);
      this.updateProjectiles(dt);
      this.updateStrikes(dt);
      if (!this.over && this.time >= C.MATCH_TIME) this.finishByTime();
    }

    updatePlayer(p, dt) {
      for (const k of CD_KEYS) p.cd[k] = Math.max(0, p.cd[k] - dt);
      if (p.slow > 0) p.slow -= dt;
      if (p.ign > 0) p.ign -= dt;
      if (p.haste > 0) p.haste -= dt;
      if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) { p.shield = 0; p.shieldT = 0; } }
      if (p.dead) {
        p.resp -= dt;
        if (p.resp <= 0) {
          const s = spawnOf(p.id);
          p.x = s.x; p.y = s.y; p.tx = s.x; p.ty = s.y;
          p.hp = p.mh; p.dead = false; p.kx = 0; p.ky = 0; p.rsn++; p.ign = 0.5;
          p.mats = Math.max(p.mats, C.RESPAWN_MATS);
        }
        return;
      }
      const c = this.cores[p.id];
      if (Math.hypot(p.x - c.x, p.y - c.y) < 210) p.hp = Math.min(p.mh, p.hp + 25 * dt);
      this.collect(p);
      if (p.remote) {
        const k = Math.min(1, dt * 14);
        p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
      } else if (p.bot) this.botAct(p, dt);
    }

    collect(p) {
      for (const s of this.scraps) {
        if (!s.alive || p.mats >= C.MAXMATS) continue;
        if (Math.hypot(s.x - p.x, s.y - p.y) < C.SCRAP_R + C.PR) {
          s.alive = false; s.resp = C.SCRAP_RESP;
          this.addMats(p, C.SCRAP_VAL);
          this.emit('pick', { k: 'scrap', p: p.id, x: s.x, y: s.y });
        }
      }
      for (const c of this.caps) {
        if (!c.alive) continue;
        if (Math.hypot(c.x - p.x, c.y - p.y) < C.CAP_R + C.PR && this.giveMod(p, c.kind)) {
          c.alive = false; c.resp = C.CAP_RESP;
          this.emit('pick', { k: 'cap', p: p.id, x: c.x, y: c.y, m: c.kind });
        }
      }
    }

    updatePickups(dt) {
      for (const s of this.scraps) {
        if (s.alive) continue;
        s.resp -= dt;
        if (s.resp <= 0) { s.alive = true; this.emit('spawn', { k: 'scrap', x: s.x, y: s.y }); }
      }
      for (const c of this.caps) {
        if (c.alive) continue;
        c.resp -= dt;
        if (c.resp <= 0) { c.alive = true; c.kind = randMod(); this.emit('spawn', { k: 'cap', x: c.x, y: c.y, m: c.kind }); }
      }
    }

    updateMines(dt) {
      for (let k = this.mines.length - 1; k >= 0; k--) {
        const m = this.mines[k];
        m.life -= dt; m.arm = Math.max(0, m.arm - dt);
        if (m.life <= 0) { this.mines.splice(k, 1); continue; }
        if (m.arm > 0) continue;
        const e = this.players[1 - m.own];
        if (!e.dead && Math.hypot(e.x - m.x, e.y - m.y) < C.MOD.mine.r + C.PR * 0.5) {
          this.mines.splice(k, 1);
          this.emit('boom', { x: m.x, y: m.y, r: 70 });
          this.hurtPlayer(e, C.MOD.mine.dmg, m.own);
          e.slow = C.MOD.mine.slow;
        }
      }
    }

    updateTurrets(dt) {
      for (let k = this.turrets.length - 1; k >= 0; k--) {
        const t = this.turrets[k];
        t.life -= dt; t.cd -= dt;
        if (t.life <= 0) {
          this.turrets.splice(k, 1);
          this.emit('boom', { x: t.x, y: t.y, r: 36 });
          continue;
        }
        const e = this.players[1 - t.own];
        if (e.dead) continue;
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d > C.MOD.turret.range) continue;
        t.aim = Math.atan2(e.y - t.y, e.x - t.x);
        if (t.cd <= 0) {
          t.cd = C.MOD.turret.cd;
          this.pr.push({
            x: t.x + Math.cos(t.aim) * 20, y: t.y + Math.sin(t.aim) * 20,
            vx: Math.cos(t.aim) * 760, vy: Math.sin(t.aim) * 760, dmg: C.MOD.turret.dmg, own: t.own, kind: 'x', life: 0.6
          });
        }
      }
    }

    updateCamps(dt) {
      for (const m of this.camps) {
        if (!m.alive) {
          m.resp -= dt;
          if (m.resp <= 0) { m.alive = true; m.hp = m.max; m.agg = 0; }
          continue;
        }
        m.cd -= dt; m.agg -= dt;
        const t = m.agg > 0 ? this.players[m.tgt] : null;
        if (t && !t.dead && Math.hypot(t.x - m.x, t.y - m.y) < m.range) {
          if (m.cd <= 0) {
            m.cd = m.boss ? 0.7 : 0.9;
            const a = Math.atan2(t.y - m.y, t.x - m.x);
            this.pr.push({
              x: m.x + Math.cos(a) * (m.r + 4), y: m.y + Math.sin(a) * (m.r + 4),
              vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, dmg: m.boss ? 9 : 5, own: -1, kind: 'x', life: 1.0
            });
          }
        } else if (m.hp < m.max) m.hp = Math.min(m.max, m.hp + m.max * 0.15 * dt);
      }
    }

    updateTowers(dt) {
      for (const c of this.cores) {
        c.cd -= dt;
        if (c.cd > 0 || c.hp <= 0) continue;
        const e = this.players[1 - c.team];
        if (e.dead || Math.hypot(e.x - c.x, e.y - c.y) > C.TOWER_RANGE) continue;
        c.cd = C.TOWER_CD;
        const a = Math.atan2(e.y - c.y, e.x - c.x);
        this.pr.push({
          x: c.x + Math.cos(a) * (C.CORE_R + 6), y: c.y + Math.sin(a) * (C.CORE_R + 6),
          vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, dmg: C.TOWER_DMG, own: c.team, kind: 'x', life: 0.8
        });
      }
    }

    updateProjectiles(dt) {
      const pr = this.pr;
      for (let k = pr.length - 1; k >= 0; k--) {
        const b = pr[k];
        b.life -= dt;
        let dead = b.life <= 0;
        for (let s = 0; s < 2 && !dead; s++) {
          b.x += b.vx * dt / 2; b.y += b.vy * dt / 2;
          const i = this.cellIdx(b.x, b.y);
          if (i < 0 || this.rock[i]) { dead = true; break; }
          const w = this.walls[i];
          if (w && w.st !== 1) { this.damageWall(i, b.dmg); dead = true; break; }
          for (const pl of this.players) {
            if (pl.dead || pl.id === b.own) continue;
            if (Math.hypot(pl.x - b.x, pl.y - b.y) < C.PR + 3) { this.hurtPlayer(pl, b.dmg, b.own); dead = true; break; }
          }
          if (dead) break;
          if (b.kind === 'b') {
            for (let ti = 0; ti < this.turrets.length; ti++) {
              const t = this.turrets[ti];
              if (t.own !== b.own && Math.hypot(t.x - b.x, t.y - b.y) < 18) { this.hurtTurret(ti, b.dmg); dead = true; break; }
            }
            if (dead) break;
            for (const c of this.cores) {
              if (c.team !== b.own && Math.hypot(c.x - b.x, c.y - b.y) < C.CORE_R) { this.hurtCore(c, b.dmg, b.own); dead = true; break; }
            }
            if (dead) break;
            for (const m of this.camps) {
              if (m.alive && Math.hypot(m.x - b.x, m.y - b.y) < m.r) { this.hurtCamp(m, b.dmg, this.players[b.own]); dead = true; break; }
            }
          }
        }
        if (dead) { pr[k] = pr[pr.length - 1]; pr.pop(); }
      }
    }

    updateStrikes(dt) {
      for (let k = this.strikes.length - 1; k >= 0; k--) {
        const s = this.strikes[k];
        s.t -= dt;
        if (s.t > 0) continue;
        this.strikes.splice(k, 1);
        const R = C.STRIKE.r, owner = this.players[s.own];
        this.emit('boom', { x: s.x, y: s.y, r: R });
        for (const p of this.players) {
          if (p.id !== s.own && !p.dead && Math.hypot(p.x - s.x, p.y - s.y) < R + C.PR) this.hurtPlayer(p, s.dmg, s.own);
        }
        for (const m of this.camps) if (m.alive && Math.hypot(m.x - s.x, m.y - s.y) < R + m.r) this.hurtCamp(m, s.dmg * 1.5, owner);
        for (const c of this.cores) if (c.team !== s.own && Math.hypot(c.x - s.x, c.y - s.y) < R + C.CORE_R) this.hurtCore(c, 140, s.own);
        this.aoe(s.x, s.y, R, s.dmg, s.own);
        const g0x = Math.floor((s.x - R) / C.T), g1x = Math.floor((s.x + R) / C.T);
        const g0y = Math.floor((s.y - R) / C.T), g1y = Math.floor((s.y + R) / C.T);
        for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
          if (gx < 0 || gy < 0 || gx >= C.GW || gy >= C.GH) continue;
          const i = gy * C.GW + gx;
          if (this.walls[i] && Math.hypot(gx * C.T + C.T / 2 - s.x, gy * C.T + C.T / 2 - s.y) < R + C.T / 2) this.damageWall(i, C.STRIKE.wall);
        }
      }
    }

    finishByTime() {
      const a = this.cores[0].hp, b = this.cores[1].hp;
      let w = null;
      if (a !== b) w = a > b ? 0 : 1;
      else if (this.players[0].kills !== this.players[1].kills) w = this.players[0].kills > this.players[1].kills ? 0 : 1;
      else if (this.players[0].souls !== this.players[1].souls) w = this.players[0].souls > this.players[1].souls ? 0 : 1;
      this.setOver(w, 'time');
    }

    /* ---------- простой бот (практика) ---------- */
    nearestAlive(list, p, maxd) {
      let best = null, bd = maxd;
      for (const o of list) {
        if (!o.alive) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }

    botMods(p, e, de, mode, own) {
      for (let s = 0; s < 2; s++) {
        const id = p.mods[s];
        if (id < 0) continue;
        let use = false, tx = e.x, ty = e.y;
        switch (MODS[id]) {
          case 'shield': use = de < 420 && p.hp < p.mh * 0.85; break;
          case 'repair': use = p.hp < p.mh * 0.5; break;
          case 'mine': use = mode === 'retreat' || (de < 280 && Math.random() < 0.4); break;
          case 'haste': use = mode === 'fight' && de < 400; break;
          case 'turret': use = mode === 'fight' && de < 380; break;
          case 'blink': use = mode === 'retreat'; tx = own.x; ty = own.y; break;
          default: break;
        }
        if (use) { this.useMod(p, s, tx, ty); return; }
      }
    }

    botAct(p, dt) {
      const b = p.ai || (p.ai = { st: 0, sx: 1, ux: 0, uy: 0, un: 0, px: p.x, py: p.y, pt: 0.6, bw: 0, mt: 1 });
      const e = this.players[1 - p.id];
      const own = this.cores[p.id], foe = this.cores[1 - p.id];
      b.st -= dt; b.pt -= dt; b.un -= dt; b.bw -= dt; b.mt -= dt;
      if (b.st <= 0) { b.st = 0.6 + Math.random() * 0.9; b.sx = Math.random() < 0.5 ? -1 : 1; }
      if (b.pt <= 0) {
        b.pt = 0.6;
        if (Math.hypot(p.x - b.px, p.y - b.py) < 18) { b.un = 0.9; const a = Math.random() * 6.28; b.ux = Math.cos(a); b.uy = Math.sin(a); }
        b.px = p.x; b.py = p.y;
      }
      const de = e.dead ? 1e9 : Math.hypot(e.x - p.x, e.y - p.y);
      let tx, ty, stop, shoot = null, mode = 'push';
      if (p.hp < p.mh * 0.3) { tx = own.x + (p.id ? -70 : 70); ty = own.y; stop = 40; mode = 'retreat'; }
      else if (de < 480) { tx = e.x; ty = e.y; stop = 250; shoot = e; mode = 'fight'; }
      else {
        let want = null;
        if (p.mats < 25) want = this.nearestAlive(this.scraps, p, 800);
        if (!want && p.mods.indexOf(-1) >= 0) want = this.nearestAlive(this.caps, p, 520);
        if (want) { tx = want.x; ty = want.y; stop = 4; mode = 'scav'; }
        else if (this.lvl(p) < 3 || this.time < 45) {
          let best = null, bd = 1e9;
          for (const m of this.camps) {
            if (!m.alive) continue;
            if (!m.boss && (p.id === 0 ? m.x > 800 : m.x < 800)) continue;
            const d = Math.hypot(m.x - p.x, m.y - p.y);
            if (d < bd) { bd = d; best = m; }
          }
          if (best) { tx = best.x; ty = best.y; stop = 200; shoot = best; mode = 'farm'; }
        }
      }
      if (tx === undefined) { tx = foe.x; ty = foe.y; stop = 300; shoot = foe; mode = 'push'; }

      const dx = tx - p.x, dy = ty - p.y, d = Math.max(1, Math.hypot(dx, dy));
      const mv = d > stop + 20 ? 1 : (d < stop - 60 ? -0.6 : 0);
      let mx = dx / d * mv, my = dy / d * mv;
      if (mode === 'fight') { mx += -dy / d * b.sx * 0.7; my += dx / d * b.sx * 0.7; }
      if (b.un > 0) { mx = b.ux; my = b.uy; }
      this.movePlayer(p, mx, my, dt);

      if (shoot) {
        p.aim = Math.atan2(shoot.y - p.y, shoot.x - p.x) + (Math.random() - 0.5) * 0.2;
        const sd = Math.hypot(shoot.x - p.x, shoot.y - p.y);
        if (sd < 520) this.fire(p, mode === 'fight' && sd < 190 ? 1 : 0);
        if (this.lvl(p) >= C.STRIKE.lvl && sd < 600 && p.cd.strike <= 0) this.strike(p, shoot.x, shoot.y);
      }
      if (mode === 'fight' && de < 130) this.nova(p);
      if (mode === 'fight' && p.hp < p.mh * 0.6 && b.bw <= 0) {
        b.bw = 2.5; const a = Math.atan2(e.y - p.y, e.x - p.x);
        this.build(p, p.x + Math.cos(a) * 85, p.y + Math.sin(a) * 85);
      }
      if (mode === 'retreat' && p.cd.dash <= 0) this.dash(p, own.x - p.x, own.y - p.y);
      if (b.mt <= 0) { b.mt = 0.4; this.botMods(p, e, de, mode, own); }
    }

    /* ---------- сеть: снапшот хоста -> гость ---------- */
    snapshot() {
      const walls = [];
      for (let i = 0; i < this.walls.length; i++) {
        const w = this.walls[i];
        if (w) walls.push([i, Math.round(w.hp), w.st, w.own]);
      }
      return {
        t: r1(this.time), cd: r1(this.cdown), o: this.over,
        p: this.players.map(p => ({
          x: r1(p.x), y: r1(p.y), a: Math.round(p.aim * 100) / 100,
          hp: Math.round(p.hp), mh: p.mh, m: Math.round(p.mats), s: p.souls, k: p.kills, d: p.deaths,
          dd: p.dead ? 1 : 0, rs: r1(p.resp), rn: p.rsn, w: p.wep,
          c: CD_KEYS.map(k => r1(p.cd[k])),
          md: p.mods.slice(), sh: Math.round(p.shield), st: r1(p.shieldT), hs: r1(p.haste)
        })),
        c: this.cores.map(c => Math.round(c.hp)),
        m: this.camps.map(m => [Math.round(m.hp), m.alive ? 1 : 0]),
        sc: this.scraps.map(s => (s.alive ? 1 : 0)),
        cp: this.caps.map(c => [c.alive ? 1 : 0, c.kind, Math.round(c.resp)]),
        mn: this.mines.map(m => [r1(m.x), r1(m.y), m.own, r1(m.life), r1(m.arm)]),
        tr: this.turrets.map(t => [r1(t.x), r1(t.y), t.own, Math.round(t.hp), r1(t.life), Math.round(t.aim * 100) / 100]),
        w: walls,
        b: this.pr.map(b => [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), b.own, b.kind === 'b' ? 0 : 1]),
        s: this.strikes.map(s => [r1(s.x), r1(s.y), r1(s.t), s.own]),
        e: this.ev.filter(e => e.ts > this.time - 0.7).slice(-60)
      };
    }

    applySnapshot(s, me) {
      this.guest = true;
      this.time = s.t; this.cdown = s.cd; this.over = s.o || null;
      for (let i = 0; i < 2; i++) {
        const q = s.p[i], p = this.players[i];
        p.hp = q.hp; p.mh = q.mh; p.mats = q.m; p.souls = q.s; p.kills = q.k; p.deaths = q.d;
        p.dead = !!q.dd; p.resp = q.rs; p.wep = q.w;
        p.mods = q.md.slice(); p.shield = q.sh; p.shieldT = q.st; p.haste = q.hs;
        for (let k = 0; k < CD_KEYS.length; k++) {
          if (i === me && CD_KEYS[k] === 'dash') continue;
          p.cd[CD_KEYS[k]] = q.c[k];
        }
        if (i === me) {
          if (q.rn !== p.rsn) { p.x = q.x; p.y = q.y; p.kx = 0; p.ky = 0; }
        } else { p.tx = q.x; p.ty = q.y; p.aim = q.a; if (q.rn !== p.rsn) { p.x = q.x; p.y = q.y; } }
        p.rsn = q.rn;
      }
      this.cores[0].hp = s.c[0]; this.cores[1].hp = s.c[1];
      s.m.forEach((m, i) => { this.camps[i].hp = m[0]; this.camps[i].alive = !!m[1]; });
      s.sc.forEach((a, i) => { this.scraps[i].alive = !!a; });
      s.cp.forEach((c, i) => { this.caps[i].alive = !!c[0]; this.caps[i].kind = c[1]; this.caps[i].resp = c[2]; });
      this.mines = s.mn.map(m => ({ x: m[0], y: m[1], own: m[2], life: m[3], arm: m[4] }));
      this.turrets = s.tr.map(t => ({ x: t[0], y: t[1], own: t[2], hp: t[3], life: t[4], aim: t[5] }));
      this.walls.fill(null);
      for (const w of s.w) this.walls[w[0]] = { hp: w[1], st: w[2], own: w[3] };
      this.pr = s.b.map(b => ({ x: b[0], y: b[1], vx: b[2], vy: b[3], own: b[4], kind: b[5] ? 'x' : 'b', life: 1 }));
      this.strikes = s.s.map(t => ({ x: t[0], y: t[1], t: t[2], own: t[3] }));
      for (const e of s.e) {
        if (e.s <= this.lastEv) continue;
        this.lastEv = e.s;
        const ev = Object.assign({}, e, { ts: this.time });
        this.ev.push(ev);
        if (ev.type === 'kb' && ev.p === me) { this.players[me].kx += ev.kx; this.players[me].ky += ev.ky; this.players[me].slow = 1.2; }
        if (ev.type === 'tp' && ev.p === me) { const pm = this.players[me]; pm.x = ev.x; pm.y = ev.y; pm.kx = 0; pm.ky = 0; }
      }
    }

    /* между снапшотами гость экстраполирует то, что видит */
    clientUpdate(dt, me) {
      this.pruneEv();
      for (const p of this.players) for (const k of CD_KEYS) p.cd[k] = Math.max(0, p.cd[k] - dt);
      const o = this.players[1 - me], k = Math.min(1, dt * 14);
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
      for (const b of this.pr) { b.x += b.vx * dt; b.y += b.vy * dt; }
      for (const s of this.strikes) s.t -= dt;
      for (const m of this.mines) { m.life -= dt; m.arm = Math.max(0, m.arm - dt); }
      for (const t of this.turrets) t.life -= dt;
      const p = this.players[me];
      if (p.slow > 0) p.slow -= dt;
      if (p.haste > 0) p.haste -= dt;
    }
  }

  const api = { C, World, lvlOf, spawnOf, CD_KEYS, ROCKS, CAMP_DEFS, MODS, SCRAP_SPOTS, CAP_SPOTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sim = api;
})(typeof window !== 'undefined' ? window : globalThis);
