/* BUILD ARENA — настройки: язык, звук, графика и переназначаемые клавиши */
(function () {
  'use strict';

  const DEF_BINDS = {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    build: 'KeyQ', edit: 'KeyE', nova: 'KeyZ', dash: 'Space', strike: 'KeyR',
    mod1: 'KeyF', mod2: 'KeyG', wep1: 'Digit1', wep2: 'Digit2',
    fire: 'KeyX', aimUp: 'ArrowUp', aimDown: 'ArrowDown', aimLeft: 'ArrowLeft', aimRight: 'ArrowRight', ctrl: 'KeyT'
  };
  const ACTIONS = Object.keys(DEF_BINDS);
  const DEF = { vol: 0.6, shake: 1, quality: 'high', dmg: true, fps: false, ctrl: 'mouse' };

  const binds = Object.assign({}, DEF_BINDS);
  const data = Object.assign({}, DEF);
  let rev = null;
  let capturing = null;
  let layout = null;

  function load() {
    try {
      const b = JSON.parse(localStorage.getItem('ba_binds') || 'null');
      if (b) for (const a of ACTIONS) if (typeof b[a] === 'string') binds[a] = b[a];
      const d = JSON.parse(localStorage.getItem('ba_settings') || 'null');
      if (d) {
        if (typeof d.vol === 'number') data.vol = Math.min(1, Math.max(0, d.vol));
        if (typeof d.shake === 'number') data.shake = Math.min(1.5, Math.max(0, d.shake));
        if (d.quality === 'low' || d.quality === 'high') data.quality = d.quality;
        if (typeof d.dmg === 'boolean') data.dmg = d.dmg;
        if (typeof d.fps === 'boolean') data.fps = d.fps;
        if (d.ctrl === 'mouse' || d.ctrl === 'kbd') data.ctrl = d.ctrl;
      }
    } catch (e) { /* ignore */ }
  }
  function save() {
    try {
      localStorage.setItem('ba_binds', JSON.stringify(binds));
      localStorage.setItem('ba_settings', JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }
  load();

  try {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then(m => { layout = m; render(); }).catch(() => {});
    }
  } catch (e) { /* ignore */ }

  const SPECIAL = {
    Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: '⌫', CapsLock: 'Caps',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn'
  };

  function label(code) {
    if (!code) return '—';
    if (SPECIAL[code]) return SPECIAL[code];
    if (layout && layout.get && layout.get(code)) return String(layout.get(code)).toUpperCase();
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code.indexOf('Numpad') === 0) return 'Num' + code.slice(6);
    return code;
  }

  function reverse() {
    if (rev) return rev;
    rev = {};
    for (const a of ACTIONS) rev[binds[a]] = a;
    return rev;
  }

  function setBind(action, code) {
    const other = ACTIONS.find(a => a !== action && binds[a] === code);
    if (other) binds[other] = binds[action];
    binds[action] = code;
    rev = null; save(); render();
  }

  function resetBinds() {
    Object.assign(binds, DEF_BINDS);
    rev = null; save(); render();
  }

  function onCapture(e) {
    if (!capturing) return;
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { capturing = null; render(); return; }
    if (['MetaLeft', 'MetaRight', 'ContextMenu'].indexOf(e.code) >= 0) return;
    const a = capturing; capturing = null;
    setBind(a, e.code);
    if (window.SFX) window.SFX.play('click');
  }
  window.addEventListener('keydown', onCapture, true);

  /* ------------------------------ интерфейс ------------------------------ */
  function $(id) { return document.getElementById(id); }

  function render() {
    const list = $('set-binds');
    if (!list) return;
    list.textContent = '';
    ACTIONS.forEach((a, i) => {
      const row = document.createElement('div');
      row.className = 'bind-row';
      row.style.setProperty('--i', i);
      const name = document.createElement('span');
      name.textContent = window.I18N.t('act_' + a);
      const btn = document.createElement('button');
      btn.className = 'keycap' + (capturing === a ? ' capturing' : '');
      btn.textContent = capturing === a ? window.I18N.t('bind_press') : label(binds[a]);
      btn.addEventListener('click', () => {
        capturing = capturing === a ? null : a;
        if (window.SFX) window.SFX.play('click');
        render();
      });
      row.appendChild(name); row.appendChild(btn);
      list.appendChild(row);
    });
    const ru = $('lang-ru'), en = $('lang-en');
    if (ru) ru.classList.toggle('on', window.I18N.lang === 'ru');
    if (en) en.classList.toggle('on', window.I18N.lang === 'en');
    const cm = $('ctrl-mouse'), ck = $('ctrl-kbd');
    if (cm) cm.classList.toggle('on', data.ctrl === 'mouse');
    if (ck) ck.classList.toggle('on', data.ctrl === 'kbd');
    const mi = $('mouse-info'); if (mi) mi.textContent = window.I18N.t(data.ctrl === 'kbd' ? 'kbd_info' : 'mouse_info');
    const q = $('set-quality');
    if (q) { q.textContent = window.I18N.t(data.quality === 'low' ? 'q_low' : 'q_high'); }
    const d = $('set-dmg'); if (d) { d.textContent = window.I18N.t(data.dmg ? 'on' : 'off'); d.classList.toggle('on', data.dmg); }
    const f = $('set-fps'); if (f) { f.textContent = window.I18N.t(data.fps ? 'on' : 'off'); f.classList.toggle('on', data.fps); }
    const v = $('set-vol'), vl = $('set-vol-val');
    if (v) v.value = Math.round(data.vol * 100);
    if (vl) vl.textContent = Math.round(data.vol * 100) + '%';
    const s = $('set-shake'), sl = $('set-shake-val');
    if (s) s.value = Math.round(data.shake * 100);
    if (sl) sl.textContent = Math.round(data.shake * 100) + '%';
    const lt = $('btn-lang'); if (lt) lt.textContent = window.I18N.lang.toUpperCase();
  }

  function init() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('lang-ru', 'click', () => window.I18N.setLang('ru'));
    on('lang-en', 'click', () => window.I18N.setLang('en'));
    on('ctrl-mouse', 'click', () => setCtrl('mouse'));
    on('ctrl-kbd', 'click', () => setCtrl('kbd'));
    on('btn-lang', 'click', () => window.I18N.setLang(window.I18N.lang === 'ru' ? 'en' : 'ru'));
    on('set-vol', 'input', e => { data.vol = e.target.value / 100; save(); render(); if (window.SFX) window.SFX.setVolume(); });
    on('set-vol', 'change', () => { if (window.SFX) window.SFX.play('click'); });
    on('set-shake', 'input', e => { data.shake = e.target.value / 100; save(); render(); });
    on('set-quality', 'click', () => { data.quality = data.quality === 'high' ? 'low' : 'high'; save(); render(); if (window.SFX) window.SFX.play('click'); });
    on('set-dmg', 'click', () => { data.dmg = !data.dmg; save(); render(); if (window.SFX) window.SFX.play('click'); });
    on('set-fps', 'click', () => { data.fps = !data.fps; save(); render(); if (window.SFX) window.SFX.play('click'); });
    on('btn-reset-binds', 'click', () => { resetBinds(); if (window.SFX) window.SFX.play('click'); });
    window.addEventListener('langchange', render);
    render();
  }

  function setCtrl(v) {
    if (v !== 'mouse' && v !== 'kbd') return;
    data.ctrl = v; save(); render();
    if (window.SFX) window.SFX.play('click');
  }

  function cancelCapture() { if (capturing) { capturing = null; render(); } }

  window.Settings = { data, binds, ACTIONS, label, reverse, render, init, save, setCtrl, cancelCapture, get capturing() { return capturing; } };
})();
