/* BUILD ARENA — локализация (RU / EN). Все видимые тексты лежат здесь. */
(function () {
  'use strict';

  const D = {
    ru: {
      tagline: 'Строй. Сражайся. Доминируй.',
      skip_intro: 'Нажми, чтобы пропустить',
      loading: 'Загрузка…',

      auth_login: 'Вход', auth_register: 'Регистрация',
      auth_nick: 'Ник (3–16 символов)', auth_nick_ph: 'Например, Builder99',
      auth_email: 'Email', auth_pass: 'Пароль', auth_pass_ph: 'минимум 6 символов',
      auth_btn_login: 'Войти', auth_btn_register: 'Создать аккаунт',
      auth_skip: 'Играть без аккаунта (тренировка)',
      err_config: 'Онлайн не настроен: заполни config.js',
      err_fill: 'Введи email и пароль (минимум 6 символов)',
      err_nick: 'Ник: 3–16 символов — буквы, цифры, _',
      err_invalid: 'Неверный email или пароль',
      err_exists: 'Такой email уже зарегистрирован',
      err_nickbad: 'Ник занят или содержит недопустимые символы',
      err_confirm: 'Подтверди email (письмо уже отправлено)',
      msg_created: 'Аккаунт создан. Подтверди email и войди.',

      menu_play: 'Рейтинговый матч', menu_play_sub: 'Соперник близкий по рейтингу',
      menu_practice: 'Тренировка', menu_practice_sub: 'Отработай приёмы против бота',
      menu_board: 'Таблица лидеров', menu_board_sub: 'Лучшие игроки сезона',
      menu_help: 'Как играть', menu_help_sub: 'Правила, добыча, модули',
      menu_settings: 'Настройки', menu_settings_sub: 'Управление и язык',
      menu_logout: 'Выйти', menu_login: 'Войти / создать аккаунт',
      offline_note: 'Онлайн-режим не настроен: заполни config.js данными Supabase (см. README). Тренировка работает и так.',
      guest: 'Гость',
      guest_sub_online: 'Войди, чтобы играть рейтинговые матчи',
      guest_sub_offline: 'Тренировка без рейтинга',
      rating: 'рейтинг',
      stat_games: 'Игры', stat_wins: 'Победы', stat_wr: 'Винрейт',
      top_players: 'Топ игроков', top_empty: 'Пока никого нет',
      rank_bronze: 'Бронза', rank_silver: 'Серебро', rank_gold: 'Золото',
      rank_plat: 'Платина', rank_diamond: 'Алмаз', rank_master: 'Мастер',
      rank_to_next: 'До «{r}»: {n}', rank_max: 'Максимальный ранг',
      tip_label: 'Совет',
      tip1: 'Материалы не восстанавливаются сами. Собирай обломки на карте и бей нейтралов.',
      tip2: 'Окно в стене пропускает пули: стреляй сквозь него, пока враг не может пройти.',
      tip3: 'Капсулы модулей появляются в центре. Побеждает тот, кто добежал первым.',
      tip4: 'Босс в центре карты даёт много душ, материалов и бесплатный модуль.',
      tip5: 'Мины и турели можно уничтожить волной или ударом с орбиты.',
      tip6: 'С 3 уровня открывается удар с орбиты — он сносит стены и бьёт по ядру.',

      queue_title: 'Поиск соперника…', queue_sub: 'Подбираем игрока близкого по рейтингу',
      queue_sec: '{n} с', cancel: 'Отмена',

      board_title: 'Таблица лидеров',
      col_player: 'Игрок', col_rating: 'Рейтинг', col_games: 'Игры', col_wins: 'Победы',
      back: 'Назад', board_err: 'Не удалось загрузить таблицу',

      wall: 'Стена', edit: 'Правка', nova: 'Волна', dash: 'Рывок', strike: 'Орбита',
      rifle: 'Винтовка', shotgun: 'Дробовик',
      mats: 'материалы', level: 'уровень', souls: 'души',
      core: 'ядро', kills: 'убийств',
      you_died: 'Ты погиб', respawn_in: 'Возрождение через {n}',
      get_ready: 'Приготовься!', fight: 'В БОЙ!', connecting: 'Подключение к сопернику…',
      neutrals: 'Нейтралы', died: '{n} погиб', lvl_up: 'УРОВЕНЬ {n}',
      kill_banner: 'УБИЙСТВО', mod_empty: 'пусто',
      wall_t0: 'Стена', wall_t1: 'Окно', wall_t2: 'Дверь',
      wall_mine: 'твоя', wall_enemy: 'вражеская',
      got_mod: 'Получен модуль: {m}', got_mats: '+{n} материалов',
      mod_full: 'Слоты заняты',
      hint_game: '{up}{left}{down}{right} — ход · ЛКМ — огонь · {build} / ПКМ — стена · {edit} — правка · {nova} — волна · {dash} — рывок · {mod1} / {mod2} — модули',
      hint_scrap: 'Материалы не восстанавливаются сами: собирай обломки',

      mod_shield: 'Энергощит', mod_repair: 'Ремкомплект', mod_mine: 'Мина',
      mod_haste: 'Ускоритель', mod_turret: 'Турель', mod_blink: 'Скачок',
      mod_shield_d: 'Поглощает 70 урона в течение 5 секунд.',
      mod_repair_d: 'Лечит 45 здоровья и полностью чинит твои стены рядом.',
      mod_mine_d: 'Скрытая мина: 65 урона и замедление врага. Живёт 45 секунд.',
      mod_haste_d: 'На 5 секунд: скорость +45% и стрельба быстрее на 30%.',
      mod_turret_d: 'Автотурель на 12 секунд стреляет по врагу в радиусе 340.',
      mod_blink_d: 'Мгновенный телепорт к курсору (до 360), в том числе через стены.',
      scrap: 'Обломки', capsule: 'Капсула модуля',

      res_win: 'ПОБЕДА', res_lose: 'ПОРАЖЕНИЕ', res_draw: 'НИЧЬЯ',
      res_core_win: 'Ядро врага уничтожено', res_core_lose: 'Твоё ядро уничтожено',
      res_dc: 'Соперник отключился',
      res_time: 'Время вышло — решили ядра, убийства и души',
      res_practice: 'Тренировка — рейтинг не меняется',
      res_counting: 'Подсчёт рейтинга…',
      res_disputed: 'Результаты не совпали — рейтинг не изменён',
      res_aborted: 'Матч отменён — рейтинг не изменён',
      res_pending: 'Результат ещё обрабатывается — загляни в меню позже',
      res_error: 'Не удалось записать результат: {e}',
      res_again: 'Ещё раз', res_menu: 'В меню',
      res_stats: 'Убийств: {k} · Смертей: {d} · Уровень: {l}',
      confirm_title: 'Выйти из матча?', confirm_text: 'Это будет засчитано как поражение.',
      confirm_yes: 'Выйти', confirm_no: 'Остаться',
      leave: 'Выйти',
      err_match: 'матч не найден', err_channel: 'Нет связи с сервером матча',
      err_search: 'Ошибка поиска: {e}',
      opp_no_show: 'Соперник не подключился. Матч отменён, рейтинг не изменён.',

      set_title: 'Настройки',
      set_lang: 'Язык', set_audio: 'Звук', set_volume: 'Громкость',
      set_gfx: 'Графика', set_shake: 'Тряска экрана', set_quality: 'Эффекты',
      q_high: 'Высокие', q_low: 'Экономные',
      set_dmg: 'Показывать числа урона', set_fps: 'Показывать FPS',
      set_controls: 'Управление', set_reset: 'Сбросить клавиши',
      bind_press: 'Нажми клавишу…', bind_cancel: 'Esc — отмена',
      mouse_info: 'Мышь: ЛКМ — огонь, ПКМ — стена (клавиша стройки тоже работает), прицел — курсор.',
      act_up: 'Вверх', act_down: 'Вниз', act_left: 'Влево', act_right: 'Вправо',
      act_build: 'Поставить стену', act_edit: 'Править стену', act_nova: 'Взрывная волна',
      act_dash: 'Рывок', act_strike: 'Удар с орбиты',
      act_mod1: 'Модуль 1', act_mod2: 'Модуль 2',
      act_wep1: 'Винтовка', act_wep2: 'Дробовик',
      on: 'Вкл', off: 'Выкл',

      help_title: 'Как играть',
      help_goal: 'Цель', help_goal_t: 'Уничтожь ядро врага. Оно стреляет по тем, кто подходит близко. Через 4 минуты побеждает тот, у кого ядро целее.',
      help_build: 'Стройка', help_build_t: 'Стена стоит 10 материалов. Правка меняет её по кругу: стена, окно (пули летят насквозь), дверь (проходить можно). Наведи курсор на стену, чтобы увидеть её здоровье.',
      help_mats: 'Материалы', help_mats_t: 'Они не восстанавливаются сами. Источники: обломки на карте (по 25, возрождаются через 20 секунд), нейтральные лагеря, убийство врага и босс в центре.',
      help_levels: 'Души и уровни', help_levels_t: 'Убивай нейтралов и врага, получай души. Уровень повышает здоровье и урон, с 3 уровня открывается удар с орбиты.',
      help_mods: 'Модули', help_mods_t: 'В центре карты появляются капсулы. Подбери капсулу, и модуль ляжет в свободный слот (всего два слота). Используется клавишей слота один раз.',
      help_controls: 'Клавиши'
    },

    en: {
      tagline: 'Build. Fight. Dominate.',
      skip_intro: 'Click to skip',
      loading: 'Loading…',

      auth_login: 'Log in', auth_register: 'Sign up',
      auth_nick: 'Nickname (3–16 characters)', auth_nick_ph: 'For example, Builder99',
      auth_email: 'Email', auth_pass: 'Password', auth_pass_ph: 'at least 6 characters',
      auth_btn_login: 'Log in', auth_btn_register: 'Create account',
      auth_skip: 'Play without account (practice)',
      err_config: 'Online is not configured: fill in config.js',
      err_fill: 'Enter email and password (at least 6 characters)',
      err_nick: 'Nickname: 3–16 characters — letters, digits, _',
      err_invalid: 'Wrong email or password',
      err_exists: 'This email is already registered',
      err_nickbad: 'Nickname is taken or has invalid characters',
      err_confirm: 'Confirm your email (a message was sent)',
      msg_created: 'Account created. Confirm your email and log in.',

      menu_play: 'Ranked match', menu_play_sub: 'Opponent close to your rating',
      menu_practice: 'Practice', menu_practice_sub: 'Train against a bot',
      menu_board: 'Leaderboard', menu_board_sub: 'Best players of the season',
      menu_help: 'How to play', menu_help_sub: 'Rules, resources, modules',
      menu_settings: 'Settings', menu_settings_sub: 'Controls and language',
      menu_logout: 'Log out', menu_login: 'Log in / create account',
      offline_note: 'Online mode is not configured: fill in config.js with your Supabase data (see README). Practice works anyway.',
      guest: 'Guest',
      guest_sub_online: 'Log in to play ranked matches',
      guest_sub_offline: 'Practice without rating',
      rating: 'rating',
      stat_games: 'Games', stat_wins: 'Wins', stat_wr: 'Win rate',
      top_players: 'Top players', top_empty: 'Nobody here yet',
      rank_bronze: 'Bronze', rank_silver: 'Silver', rank_gold: 'Gold',
      rank_plat: 'Platinum', rank_diamond: 'Diamond', rank_master: 'Master',
      rank_to_next: 'To {r}: {n}', rank_max: 'Maximum rank',
      tip_label: 'Tip',
      tip1: 'Materials never regenerate. Collect scrap on the map and hunt neutral camps.',
      tip2: 'A window lets bullets through: shoot across it while the enemy cannot pass.',
      tip3: 'Module capsules spawn near the center. Whoever gets there first wins them.',
      tip4: 'The boss in the middle gives lots of souls, materials and a free module.',
      tip5: 'Mines and turrets can be destroyed with a nova or an orbital strike.',
      tip6: 'Level 3 unlocks the orbital strike: it wrecks walls and hits the core.',

      queue_title: 'Searching for an opponent…', queue_sub: 'Looking for a player near your rating',
      queue_sec: '{n} s', cancel: 'Cancel',

      board_title: 'Leaderboard',
      col_player: 'Player', col_rating: 'Rating', col_games: 'Games', col_wins: 'Wins',
      back: 'Back', board_err: 'Could not load the leaderboard',

      wall: 'Wall', edit: 'Edit', nova: 'Nova', dash: 'Dash', strike: 'Orbital',
      rifle: 'Rifle', shotgun: 'Shotgun',
      mats: 'materials', level: 'level', souls: 'souls',
      core: 'core', kills: 'kills',
      you_died: 'You died', respawn_in: 'Respawn in {n}',
      get_ready: 'Get ready!', fight: 'FIGHT!', connecting: 'Connecting to opponent…',
      neutrals: 'Neutrals', died: '{n} died', lvl_up: 'LEVEL {n}',
      kill_banner: 'ELIMINATED', mod_empty: 'empty',
      wall_t0: 'Wall', wall_t1: 'Window', wall_t2: 'Door',
      wall_mine: 'yours', wall_enemy: 'enemy',
      got_mod: 'Module acquired: {m}', got_mats: '+{n} materials',
      mod_full: 'Slots are full',
      hint_game: '{up}{left}{down}{right} — move · LMB — fire · {build} / RMB — wall · {edit} — edit · {nova} — nova · {dash} — dash · {mod1} / {mod2} — modules',
      hint_scrap: 'Materials never regenerate: collect scrap',

      mod_shield: 'Energy Shield', mod_repair: 'Repair Kit', mod_mine: 'Mine',
      mod_haste: 'Overdrive', mod_turret: 'Turret', mod_blink: 'Blink',
      mod_shield_d: 'Absorbs 70 damage for 5 seconds.',
      mod_repair_d: 'Heals 45 health and fully repairs your nearby walls.',
      mod_mine_d: 'Hidden mine: 65 damage and slows the enemy. Lasts 45 seconds.',
      mod_haste_d: 'For 5 seconds: +45% speed and 30% faster fire.',
      mod_turret_d: 'Auto-turret for 12 seconds fires at enemies within 340.',
      mod_blink_d: 'Instant teleport toward the cursor (up to 360), even through walls.',
      scrap: 'Scrap', capsule: 'Module capsule',

      res_win: 'VICTORY', res_lose: 'DEFEAT', res_draw: 'DRAW',
      res_core_win: 'Enemy core destroyed', res_core_lose: 'Your core was destroyed',
      res_dc: 'Opponent disconnected',
      res_time: 'Time is up — decided by cores, kills and souls',
      res_practice: 'Practice — rating does not change',
      res_counting: 'Calculating rating…',
      res_disputed: 'Results did not match — rating unchanged',
      res_aborted: 'Match cancelled — rating unchanged',
      res_pending: 'Result is still processing — check the menu later',
      res_error: 'Could not save the result: {e}',
      res_again: 'Play again', res_menu: 'Menu',
      res_stats: 'Kills: {k} · Deaths: {d} · Level: {l}',
      confirm_title: 'Leave the match?', confirm_text: 'It will count as a defeat.',
      confirm_yes: 'Leave', confirm_no: 'Stay',
      leave: 'Leave',
      err_match: 'match not found', err_channel: 'No connection to the match server',
      err_search: 'Search error: {e}',
      opp_no_show: 'Opponent did not connect. Match cancelled, rating unchanged.',

      set_title: 'Settings',
      set_lang: 'Language', set_audio: 'Sound', set_volume: 'Volume',
      set_gfx: 'Graphics', set_shake: 'Screen shake', set_quality: 'Effects',
      q_high: 'High', q_low: 'Light',
      set_dmg: 'Show damage numbers', set_fps: 'Show FPS',
      set_controls: 'Controls', set_reset: 'Reset keys',
      bind_press: 'Press a key…', bind_cancel: 'Esc to cancel',
      mouse_info: 'Mouse: LMB — fire, RMB — wall (the build key works too), aim with the cursor.',
      act_up: 'Move up', act_down: 'Move down', act_left: 'Move left', act_right: 'Move right',
      act_build: 'Place wall', act_edit: 'Edit wall', act_nova: 'Nova blast',
      act_dash: 'Dash', act_strike: 'Orbital strike',
      act_mod1: 'Module 1', act_mod2: 'Module 2',
      act_wep1: 'Rifle', act_wep2: 'Shotgun',
      on: 'On', off: 'Off',

      help_title: 'How to play',
      help_goal: 'Goal', help_goal_t: 'Destroy the enemy core. It shoots anyone who gets close. After 4 minutes the player whose core has more health wins.',
      help_build: 'Building', help_build_t: 'A wall costs 10 materials. Editing cycles it: wall, window (bullets fly through), door (you can walk through). Hover a wall to see its health.',
      help_mats: 'Materials', help_mats_t: 'They never regenerate. Sources: scrap on the map (25 each, back after 20 seconds), neutral camps, killing the enemy and the boss in the middle.',
      help_levels: 'Souls and levels', help_levels_t: 'Kill neutrals and the enemy to earn souls. Levels raise health and damage, and level 3 unlocks the orbital strike.',
      help_mods: 'Modules', help_mods_t: 'Capsules spawn on the map. Grab one and the module goes to a free slot (two slots in total). Press the slot key to use it once.',
      help_controls: 'Keys'
    }
  };

  function detect() {
    try { const s = localStorage.getItem('ba_lang'); if (s === 'ru' || s === 'en') return s; } catch (e) { /* ignore */ }
    return String((typeof navigator !== 'undefined' && navigator.language) || 'en').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
  }

  let lang = detect();

  function t(key, vars) {
    let s = (D[lang] && D[lang][key]);
    if (s === undefined) s = D.en[key];
    if (s === undefined) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  }

  function apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-ph]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    if (document.documentElement) document.documentElement.lang = lang;
  }

  function setLang(l) {
    if (l !== 'ru' && l !== 'en') return;
    lang = l;
    try { localStorage.setItem('ba_lang', l); } catch (e) { /* ignore */ }
    apply();
    window.dispatchEvent(new Event('langchange'));
  }

  window.I18N = { t, apply, setLang, get lang() { return lang; } };
})();
