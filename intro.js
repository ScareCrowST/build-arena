/* BUILD ARENA — интро, живой фон меню, переходы и эффекты кнопок */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  /* ============================== ИНТРО ============================== */
  function run() {
    return new Promise(resolve => {
      const el = $('intro'), cv = $('intro-cv');
      if (!el || !cv || reduced()) { if (el) el.remove(); resolve(); return; }

      /* буквы логотипа */
      const logo = $('intro-logo');
      logo.textContent = '';
      let idx = 0;
      ['BUILD', 'ARENA'].forEach((word, row) => {
        const r = document.createElement('div');
        r.className = 'row r' + (row + 1);
        for (const ch of word) {
          const s = document.createElement('span');
          s.textContent = ch;
          s.style.setProperty('--i', idx++);
          r.appendChild(s);
        }
        logo.appendChild(r);
      });

      const ctx = cv.getContext('2d');
      let W = 0, H = 0, dpr = 1;
      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#03060d'; ctx.fillRect(0, 0, W, H);
      }
      resize();
      window.addEventListener('resize', resize);

      const N = 280;
      const parts = [];
      const cols = ['#38b6ff', '#7cf2ff', '#ffffff', '#ff4d6a', '#ffb347'];
      for (let i = 0; i < N; i++) {
        parts.push({
          a: Math.random() * TAU, r0: Math.max(W, H) * (0.62 + Math.random() * 0.6),
          spin: (Math.random() - 0.5) * 2.6, sz: 1 + Math.random() * 2.2,
          d: Math.random() * 0.7, c: cols[(Math.random() * cols.length) | 0]
        });
      }
      const sparks = [], rings = [];
      let burst = false, done = false, raf = 0, slammed = false;
      const t0 = performance.now();

      function hex(cx, cy, r) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + Math.PI / 6;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
      }

      function doBurst(cx, cy) {
        burst = true;
        el.classList.add('boom');
        for (let i = 0; i < 220; i++) {
          const a = Math.random() * TAU, s = 120 + Math.random() * 900;
          sparks.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7 + Math.random() * 0.9, max: 1.6, c: cols[(Math.random() * cols.length) | 0], sz: 1 + Math.random() * 2.5 });
        }
        rings.push({ r: 10, v: 1500, a: 1, w: 6, c: '#7cf2ff' });
        rings.push({ r: 10, v: 900, a: 0.8, w: 3, c: '#ffffff' });
        rings.push({ r: 10, v: 520, a: 0.6, w: 10, c: '#38b6ff' });
        if (window.SFX) window.SFX.play('slam');
      }

      let last = t0;
      function frame(now) {
        if (done) return;
        const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const cx = W / 2, cy = H / 2;

        /* шлейфы: затемняем прошлый кадр */
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = t < 1.8 ? 'rgba(3,6,13,0.2)' : 'rgba(3,6,13,0.32)';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';

        /* шестигранная сетка раскрывается от центра */
        if (t > 0.5) {
          const reveal = clamp((t - 0.5) / 2.2, 0, 1), maxR = Math.hypot(W, H) * 0.55 * reveal;
          const s = 46;
          ctx.lineWidth = 1;
          for (let q = -14; q <= 14; q++) {
            for (let r = -10; r <= 10; r++) {
              const x = cx + s * 1.5 * q, y = cy + s * 1.732 * (r + q / 2);
              const d = Math.hypot(x - cx, y - cy);
              if (d > maxR || x < -s || x > W + s || y < -s || y > H + s) continue;
              const edge = clamp(1 - (d / (maxR + 1)), 0, 1);
              ctx.strokeStyle = 'rgba(56,182,255,' + (0.05 + 0.1 * edge * (burst ? 1.4 : 0.8)) + ')';
              hex(x, y, s - 2); ctx.stroke();
            }
          }
        }

        /* энергия стягивается в центр */
        if (t < 2.0) {
          const g = clamp((t - 0.5) / 1.3, 0, 1);
          const rad = 20 + 160 * g;
          const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 2);
          gr.addColorStop(0, 'rgba(255,255,255,' + (0.5 * g) + ')');
          gr.addColorStop(0.3, 'rgba(56,182,255,' + (0.35 * g) + ')');
          gr.addColorStop(1, 'rgba(56,182,255,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, rad * 2, 0, TAU); ctx.fill();
        }
        for (const p of parts) {
          const u = clamp((t - p.d) / 1.45, 0, 1);
          if (u <= 0 || u >= 1) continue;
          const e = u * u * (3 - 2 * u);
          const rr = p.r0 * (1 - e) + 6;
          const aa = p.a + p.spin * (1 - e) * 2.4;
          const x = cx + Math.cos(aa) * rr, y = cy + Math.sin(aa) * rr;
          const pe = clamp(u - 0.04, 0, 1), pe2 = pe * pe * (3 - 2 * pe);
          const rr2 = p.r0 * (1 - pe2) + 6, aa2 = p.a + p.spin * (1 - pe2) * 2.4;
          ctx.strokeStyle = p.c; ctx.globalAlpha = 0.25 + 0.75 * e; ctx.lineWidth = p.sz;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(aa2) * rr2, cy + Math.sin(aa2) * rr2); ctx.lineTo(x, y); ctx.stroke();
          ctx.globalAlpha = 1;
        }

        /* взрыв и ударные кольца */
        if (!burst && t >= 1.75) doBurst(cx, cy);
        if (burst) {
          for (let i = sparks.length - 1; i >= 0; i--) {
            const s = sparks[i];
            s.life -= dt;
            if (s.life <= 0) { sparks.splice(i, 1); continue; }
            s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.965; s.vy *= 0.965;
            ctx.globalAlpha = clamp(s.life / s.max, 0, 1);
            ctx.fillStyle = s.c; ctx.fillRect(s.x - s.sz / 2, s.y - s.sz / 2, s.sz, s.sz);
          }
          ctx.globalAlpha = 1;
          for (let i = rings.length - 1; i >= 0; i--) {
            const rg = rings[i];
            rg.r += rg.v * dt; rg.a -= dt * 0.9;
            if (rg.a <= 0) { rings.splice(i, 1); continue; }
            ctx.strokeStyle = rg.c; ctx.globalAlpha = clamp(rg.a, 0, 1); ctx.lineWidth = rg.w * rg.a;
            ctx.beginPath(); ctx.arc(cx, cy, rg.r, 0, TAU); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        /* световые полосы над логотипом */
        if (t > 2.25 && t < 3.2) {
          const k = (t - 2.25) / 0.95;
          for (let i = 0; i < 3; i++) {
            const y = cy + (i - 1) * H * 0.11, x = -W * 0.4 + (W * 1.8) * clamp(k - i * 0.06, 0, 1);
            const gr = ctx.createLinearGradient(x - 340, 0, x + 340, 0);
            gr.addColorStop(0, 'rgba(124,242,255,0)');
            gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
            gr.addColorStop(1, 'rgba(124,242,255,0)');
            ctx.fillStyle = gr; ctx.fillRect(x - 340, y - 1.5, 680, 3);
          }
        }

        if (t > 1.9 && !slammed) { slammed = true; el.classList.add('landed'); }
        if (t > 3.0 && !el.classList.contains('ready')) el.classList.add('ready');
        if (t > 5.2) { finish(); return; }
        raf = requestAnimationFrame(frame);
      }

      function finish() {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', skip, true);
        window.removeEventListener('pointerdown', skip, true);
        window.removeEventListener('resize', resize);
        el.classList.add('out');
        setTimeout(() => { el.remove(); }, 800);
        setTimeout(resolve, 380);
      }
      function skip(e) {
        if (performance.now() - t0 < 350) return;
        if (window.SFX) window.SFX.unlock();
        if (e && e.type === 'keydown') e.stopPropagation();
        finish();
      }
      window.addEventListener('keydown', skip, true);
      window.addEventListener('pointerdown', skip, true);
      raf = requestAnimationFrame(frame);
    });
  }

  /* ============================== ФОН МЕНЮ ============================== */
  const MenuBG = (function () {
    let cv = null, ctx = null, W = 0, H = 0, raf = 0, running = false, pattern = null;
    let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5, last = 0, time = 0;
    const parts = [];
    const ripples = [];

    function makePattern() {
      const s = 44, w = Math.round(3 * s), h = Math.round(1.7320508 * s);
      const t = document.createElement('canvas'); t.width = w; t.height = h;
      const g = t.getContext('2d');
      g.strokeStyle = 'rgba(70,140,230,0.13)'; g.lineWidth = 1;
      const centers = [[0, 0], [w, 0], [0, h], [w, h], [1.5 * s, 0.5 * h]];
      for (const [cx, cy] of centers) {
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          const x = cx + Math.cos(a) * s, y = cy + Math.sin(a) * s;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.closePath(); g.stroke();
      }
      pattern = ctx.createPattern(t, 'repeat');
    }

    function resize() {
      if (!cv) return;
      W = cv.width = window.innerWidth; H = cv.height = window.innerHeight;
      makePattern();
    }

    function init() {
      cv = $('bg'); if (!cv) return;
      ctx = cv.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
      window.addEventListener('pointermove', e => { tx = e.clientX / Math.max(1, W); ty = e.clientY / Math.max(1, H); });
      window.addEventListener('pointerdown', e => { ripples.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.7 }); });
      const cols = ['56,182,255', '124,242,255', '255,77,106', '255,179,71', '182,140,255'];
      for (let i = 0; i < 70; i++) {
        parts.push({
          x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.9,
          vx: (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 16,
          r: 1 + Math.random() * 2.6, hex: Math.random() < 0.28, c: cols[(Math.random() * cols.length) | 0],
          ph: Math.random() * TAU
        });
      }
    }

    function hexPath(x, y, r, rot) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = rot + i * Math.PI / 3;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }

    function loop(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
      mx += (tx - mx) * Math.min(1, dt * 5); my += (ty - my) * Math.min(1, dt * 5);
      const mxp = mx * W, myp = my * H;

      const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.85);
      bg.addColorStop(0, '#142347'); bg.addColorStop(0.55, '#0a1020'); bg.addColorStop(1, '#04070d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      /* сетка с параллаксом */
      ctx.save();
      ctx.translate((0.5 - mx) * 44 + time * 6, (0.5 - my) * 30 + time * 3);
      ctx.fillStyle = pattern; ctx.fillRect(-200, -200, W + 400, H + 400);
      ctx.restore();

      /* бегущая линия-скан */
      const sy = ((time * 90) % (H + 300)) - 150;
      const sg = ctx.createLinearGradient(0, sy - 120, 0, sy + 120);
      sg.addColorStop(0, 'rgba(56,182,255,0)'); sg.addColorStop(0.5, 'rgba(56,182,255,0.05)'); sg.addColorStop(1, 'rgba(56,182,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, sy - 120, W, 240);

      /* свет за курсором */
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(mxp, myp, 0, mxp, myp, 260);
      glow.addColorStop(0, 'rgba(56,182,255,0.22)'); glow.addColorStop(1, 'rgba(56,182,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(mxp - 260, myp - 260, 520, 520);

      /* частицы */
      for (const p of parts) {
        p.x += (p.vx + Math.sin(time * 0.6 + p.ph) * 6) * dt * p.z;
        p.y += p.vy * dt * p.z;
        const dx = p.x - mxp, dy = p.y - myp, d2 = dx * dx + dy * dy;
        if (d2 < 22000) { const d = Math.sqrt(d2) || 1, f = (1 - d / 148) * 90 * dt; p.x += dx / d * f; p.y += dy / d * f; }
        if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
        if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        const a = (0.25 + 0.35 * Math.sin(time * 1.4 + p.ph)) * p.z;
        if (p.hex) {
          ctx.strokeStyle = 'rgba(' + p.c + ',' + clamp(a, 0, 1) + ')'; ctx.lineWidth = 1.5;
          hexPath(p.x, p.y, p.r * 4.5, time * 0.3 + p.ph); ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(' + p.c + ',' + clamp(a, 0, 1) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.z, 0, TAU); ctx.fill();
        }
      }

      /* круги от кликов */
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.r += 420 * dt; r.a -= dt * 1.1;
        if (r.a <= 0) { ripples.splice(i, 1); continue; }
        ctx.strokeStyle = 'rgba(124,242,255,' + r.a + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (!cv || running) return;
      running = true; cv.style.display = 'block'; last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false; cancelAnimationFrame(raf);
      if (cv) cv.style.display = 'none';
    }
    return { init, start, stop };
  })();

  /* ============================== переход-«шторка» ============================== */
  const Wipe = {
    go() {
      const el = $('wipe');
      if (!el || reduced()) return;
      el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    }
  };

  /* ============================== эффекты интерфейса ============================== */
  const SEL = '.btn, .menu-btn, .icon-btn, .tab, .keycap, .seg button, .toggle';
  const UIFX = {
    init() {
      const root = document.documentElement;
      window.addEventListener('pointermove', e => {
        root.style.setProperty('--px', ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
        root.style.setProperty('--py', ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
        const b = e.target.closest ? e.target.closest(SEL) : null;
        if (b) {
          const r = b.getBoundingClientRect();
          b.style.setProperty('--mx', (e.clientX - r.left) + 'px');
          b.style.setProperty('--my', (e.clientY - r.top) + 'px');
        }
      });
      document.addEventListener('mouseover', e => {
        const b = e.target.closest ? e.target.closest(SEL) : null;
        if (b && !b.disabled && (!e.relatedTarget || !b.contains(e.relatedTarget))) { if (window.SFX) window.SFX.play('hover'); }
      });
      document.addEventListener('click', e => {
        const b = e.target.closest ? e.target.closest(SEL) : null;
        if (!b || b.disabled) return;
        if (window.SFX && !b.classList.contains('keycap')) window.SFX.play('click');
        if (b.classList.contains('no-ripple')) return;
        const r = b.getBoundingClientRect();
        const s = document.createElement('span');
        s.className = 'ripple';
        s.style.left = (e.clientX - r.left) + 'px'; s.style.top = (e.clientY - r.top) + 'px';
        b.appendChild(s);
        setTimeout(() => s.remove(), 650);
      });
      const unlock = () => { if (window.SFX) window.SFX.unlock(); };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
    }
  };

  window.Intro = { run };
  window.MenuBG = MenuBG;
  window.Wipe = Wipe;
  window.UIFX = UIFX;
})();
