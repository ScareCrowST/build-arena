/* BUILD ARENA — девлог. Новая запись добавляется В НАЧАЛО списка entries. */
(function () {
  'use strict';

  const entries = [
    {
      ver: '0.3', date: '2026-11-19',
      title: { en: 'Keyboard-only mode', ru: 'Режим «только клавиатура»' },
      items: {
        en: [
          'Play without a mouse: arrow keys aim, X fires.',
          'Auto-aim: with no arrows held, your aim locks onto the nearest target.',
          'A marker ahead of you shows where the next wall will go; edit picks the nearest wall along your aim.',
          'Switch between mouse and keyboard in Settings, or press T during a match.',
          'The menu can be navigated with Tab and arrow keys.',
          'New Devlog screen in the menu.'
        ],
        ru: [
          'Игра без мыши: стрелки — прицел, X — огонь.',
          'Авто-прицел: если стрелки не нажаты, прицел сам берёт ближайшую цель.',
          'Метка перед игроком показывает, куда встанет стена; правка берёт ближайшую стену по линии прицела.',
          'Мышь и клавиатура переключаются в настройках или клавишей T прямо в матче.',
          'По меню можно ходить клавишами Tab и стрелками.',
          'В меню появился экран «Девлог».'
        ]
      }
    },
    {
      ver: '0.2', date: '2026-11-19',
      title: { en: 'Visuals and new systems', ru: 'Визуал и новые механики' },
      items: {
        en: [
          'Epic intro, animated menu background and smooth screen transitions.',
          'Finite materials: no passive regeneration. Collect scrap, clear camps, beat the boss.',
          'Modules: six abilities in two slots (Shield, Repair Kit, Mine, Overdrive, Turret, Blink), found in capsules on the map.',
          'Wall build animation and a health bar when you hover over a wall.',
          'Settings: key rebinding, volume, screen shake, effects quality.',
          'English and Russian, English by default.',
          'Sound effects.'
        ],
        ru: [
          'Эпичное интро, анимированный фон меню и плавные переходы между экранами.',
          'Конечные материалы: пассивного восстановления нет. Собирай обломки, зачищай лагеря, бей босса.',
          'Модули: шесть способностей в двух слотах (Щит, Ремкомплект, Мина, Форсаж, Турель, Блинк), их находят в капсулах на карте.',
          'Анимация постройки стены и полоска здоровья при наведении на стену.',
          'Настройки: переназначение клавиш, громкость, тряска экрана, качество эффектов.',
          'Русский и английский языки, по умолчанию английский.',
          'Звуковые эффекты.'
        ]
      }
    },
    {
      ver: '0.1', date: '2026-11-18',
      title: { en: 'First release', ru: 'Первый релиз' },
      items: {
        en: [
          'Ranked 1v1 duels with Elo rating and a global leaderboard.',
          'Accounts, matchmaking by rating, practice mode against a bot.',
          'Walls you can edit into windows and doors, a core with a defence tower, neutral camps and a boss.',
          'Souls and levels, plus the orbital strike at level 3.'
        ],
        ru: [
          'Рейтинговые дуэли 1 на 1 с рейтингом Elo и общей таблицей лидеров.',
          'Аккаунты, подбор соперника по рейтингу, тренировка с ботом.',
          'Стены, которые можно превратить в окно или дверь, ядро с башней, нейтральные лагеря и босс.',
          'Души и уровни, на 3 уровне открывается удар с орбиты.'
        ]
      }
    }
  ];

  const next = {
    en: ['A dedicated game server for fairer, cheat-resistant matches', 'More modules and map events', 'Ranked seasons'],
    ru: ['Свой игровой сервер для честных матчей без читеров', 'Больше модулей и событий на карте', 'Рейтинговые сезоны']
  };

  window.DEVLOG = { entries, next, latest: entries[0].ver };
})();
