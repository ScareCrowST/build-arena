/* BUILD ARENA — синтезированные звуки (WebAudio, без файлов). Всё в try/catch: звук не должен ломать игру. */
(function () {
  'use strict';

  let ac = null, master = null, noiseBuf = null;
  const last = {};
  const MIN_GAP = { shoot: 45, shotgun: 90, hit: 35, hurt: 80, build: 40, hover: 60, spark: 30, break: 50, step: 100, pickup: 40 };

  function vol() { return window.Settings ? window.Settings.data.vol : 0.6; }

  function unlock() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.connect(ac.destination);
        const n = ac.sampleRate;
        noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
      setVolume();
    } catch (e) { /* ignore */ }
  }

  function setVolume() { try { if (master) master.gain.value = vol() * 0.5; } catch (e) { /* ignore */ } }

  function tone(f0, dur, type, gain, f1, delay) {
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain, hp, lp, delay) {
    const t0 = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = s;
    if (hp) { const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    node.connect(g); g.connect(master);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }

  function play(name, v) {
    try {
      if (!ac || ac.state !== 'running' || vol() <= 0) return;
      const nowMs = performance.now();
      if (MIN_GAP[name] && last[name] && nowMs - last[name] < MIN_GAP[name]) return;
      last[name] = nowMs;
      const k = v === undefined ? 1 : v;
      switch (name) {
        case 'click': tone(520, 0.07, 'square', 0.12 * k, 880); break;
        case 'hover': tone(1200, 0.035, 'sine', 0.05 * k); break;
        case 'open': tone(300, 0.18, 'sawtooth', 0.1 * k, 900); noise(0.15, 0.05 * k, 3000); break;
        case 'shoot': tone(900, 0.07, 'square', 0.07 * k, 220); noise(0.05, 0.05 * k, 2500); break;
        case 'shotgun': tone(200, 0.16, 'sawtooth', 0.14 * k, 60); noise(0.16, 0.14 * k, 600, 6000); break;
        case 'hit': tone(240, 0.05, 'triangle', 0.08 * k, 120); break;
        case 'hurt': tone(160, 0.14, 'sawtooth', 0.14 * k, 70); break;
        case 'build': tone(420, 0.09, 'square', 0.09 * k, 840); tone(840, 0.07, 'triangle', 0.06 * k, 1100, 0.06); break;
        case 'edit': tone(700, 0.06, 'square', 0.08 * k, 1000); break;
        case 'break': noise(0.2, 0.12 * k, 300, 4000); tone(140, 0.12, 'triangle', 0.08 * k, 60); break;
        case 'boom': noise(0.5, 0.25 * k, 40, 1800); tone(90, 0.4, 'sawtooth', 0.2 * k, 30); break;
        case 'nova': tone(200, 0.35, 'sawtooth', 0.16 * k, 1000); noise(0.3, 0.1 * k, 800); break;
        case 'dash': noise(0.18, 0.1 * k, 1200, 7000); tone(300, 0.15, 'sine', 0.06 * k, 900); break;
        case 'pickup': tone(660, 0.07, 'square', 0.08 * k); tone(990, 0.1, 'square', 0.08 * k, 0, 0.07); break;
        case 'capture': tone(440, 0.09, 'triangle', 0.12 * k); tone(660, 0.09, 'triangle', 0.12 * k, 0, 0.08); tone(990, 0.16, 'triangle', 0.12 * k, 0, 0.16); break;
        case 'mod': tone(260, 0.3, 'sawtooth', 0.12 * k, 780); tone(520, 0.3, 'sine', 0.1 * k, 1560); break;
        case 'blink': tone(1400, 0.18, 'sine', 0.1 * k, 200); noise(0.12, 0.06 * k, 3000); break;
        case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12 * k, 0, i * 0.07)); break;
        case 'kill': tone(130, 0.3, 'sawtooth', 0.16 * k, 50); tone(660, 0.25, 'square', 0.08 * k, 1320, 0.05); break;
        case 'count': tone(660, 0.12, 'square', 0.12 * k); break;
        case 'go': tone(880, 0.35, 'sawtooth', 0.14 * k, 1760); noise(0.25, 0.1 * k, 1000); break;
        case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14 * k, 0, i * 0.1)); break;
        case 'lose': [392, 349, 294, 220].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1 * k, 0, i * 0.14)); break;
        case 'intro': noise(1.4, 0.12 * k, 200, 5000); tone(60, 1.4, 'sawtooth', 0.2 * k, 220); break;
        case 'slam': tone(70, 0.5, 'sawtooth', 0.28 * k, 28); noise(0.4, 0.2 * k, 60, 2500); break;
        default: break;
      }
    } catch (e) { /* ignore */ }
  }

  window.SFX = { unlock, play, setVolume };
})();
