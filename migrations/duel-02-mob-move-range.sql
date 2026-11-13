-- Дуэль героев (владелец 08.11.2026): у каждого воина два поля —
--   duel_move  — на сколько клеток уходит за ход;
--   duel_range — дальность выстрела, только у дальнобойных (пусто — бьёт вплотную).
-- Значения проставлены по виду моба (летуны и звери быстрее, големы и древо
-- медленнее; маги, стрелки, сирены, пираты с оружием — стреляют). Правится в
-- админке: окно моба → «Дуэль». Старый флажок duel_ranged заменён дальностью
-- (снимается в duel-03 после выката).
ALTER TABLE yuplink.raid_boss_template
  ADD COLUMN IF NOT EXISTS duel_range integer
    CHECK (duel_range IS NULL OR duel_range BETWEEN 2 AND 8);
ALTER TABLE yuplink.raid_boss_template
  DROP CONSTRAINT IF EXISTS raid_boss_template_duel_move_check;
ALTER TABLE yuplink.raid_boss_template
  ADD CONSTRAINT raid_boss_template_duel_move_check CHECK (duel_move IS NULL OR duel_move BETWEEN 1 AND 8);

UPDATE yuplink.raid_boss_template t
   SET duel_move = v.move, duel_range = v.range
  FROM (VALUES
  ('rbt_j5-gWHAk', 2, NULL),  -- Болотный Слизень
  ('rbt_9EQ7GoCm', 4, NULL),  -- Горный Хомяк (1 Lv)
  ('rbt_8ddSlFDa', 6, NULL),  -- Небесный голубь
  ('rbt_BOxy9qgC', 3, NULL),  -- Лесной Еж
  ('rbt_blAOHQ_8', 5, NULL),  -- Магический заяц (0 Lv)
  ('rbt_kXuRIV7h', 4, NULL),  -- Ящерица (1 Lv)
  ('rbt_pZ13FRtf', 1, NULL),  -- Горная Черепаха (1 Lv)
  ('rbt__Z2f3J92', 2, NULL),  -- Болотная Пиявка
  ('rbt_rjnYAnA1', 5, NULL),  -- Лягушка - Убегушка
  ('rbt_see6S0cB', 3, NULL),  -- Крабик (2 Lv)
  ('rbt_QtZj5vBS', 3, 4),  -- Глазик (3 Lv)
  ('rbt_JmQkhBLo', 2, NULL),  -- Жучек (3 Lv)
  ('rbt_HRvoJGWe', 2, NULL),  -- Гречневое пугало
  ('rbt_BBy2d0JD', 3, 5),  -- Лесной Маг
  ('rbt_C8qgp9dQ', 2, 3),  -- Грибок Безумия (5 Lv)
  ('rbt_VdDcZUQj', 3, NULL),  -- Болотный Скелет Воин
  ('rbt_X4G18qLe', 4, NULL),  -- Скорпион (5 Lv)
  ('rbt_6taE2zvP', 6, NULL),  -- Чайка (5 Lv)
  ('rbt_quETQ0ta', 2, NULL),  -- Горный Воин
  ('rbt_HY7J0p-6', 4, 4),  -- Огонек (5 Lv)
  ('rbt_rhHfMKgF', 5, NULL),  -- Чертенок  (5 Lv)
  ('rbt__ThJtr_7', 2, 4),  -- Ядовитый Гриб (5 Lv)
  ('rbt_E-klwdIn', 2, NULL),  -- Болотный Зомби
  ('rbt_9mVE5BmF', 5, NULL),  -- Горный защитник
  ('rbt_33Jr2xtZ', 3, 4),  -- Пират (10 Lv)
  ('rbt_OuKcIRAY', 5, NULL),  -- Пляжная Буря
  ('rbt_X9beTH50', 6, NULL),  -- Стервятник (10 Lv)
  ('rbt_PoPxDbv2', 6, NULL),  -- Адская Гончая (10 Lv)
  ('rbt_pwWbzaIL', 3, 4),  -- Маг отжимания
  ('rbt_zYJjfJh2', 1, NULL),  -- Древо Замедления (10 Lv)
  ('rbt_ueV8ECie', 3, 6),  -- Колдун (10 Lv)
  ('rbt_PnYPF3rX', 5, NULL),  -- Святой Олень (10 Lv)
  ('rbt_SSFRPtdq', 3, 5),  -- Лесной Маг
  ('rbt_3gsBSiCU', 3, NULL),  -- Болотный Огр
  ('rbt_hYeEOo7j', 4, NULL),  -- Разбойник (12 Lv)
  ('rbt_gS4XbGZb', 2, 3),  -- Камень Безумия (13 Lv)
  ('rbt_MfJmpcKB', 5, NULL),  -- Адский Олень (15 Lv)
  ('rbt_GGdnV4lf', 3, 6),  -- Горный Отравитель
  ('rbt_b3pijnk-', 2, NULL),  -- Исполин (15 Lv)
  ('rbt_9sQKjdtK', 3, 5),  -- Подражатель Кайлани
  ('rbt_shaman', 2, 5),  -- Шаман
  ('rbt_Ot2lzWzS', 2, NULL),  -- Дикий Сундук
  ('rbt_fVnyNzMJ', 4, NULL),  -- Опасный Пират (15 Lv)
  ('rbt_Mwodqf1b', 3, 4),  -- Лесной Рандом
  ('rbt_zojaKMEg', 2, NULL),  -- Гречневый Голем
  ('rbt_QKTcqJ5_', 2, NULL),  -- Мумия (20 Lv)
  ('rbt_Kuc2m31K', 2, 5),  -- Батя Грибка Безумия (23 Lv)
  ('rbt_jwFzjFYC', 6, NULL),  -- Дикий Оборотень
  ('rbt_8xiMPlOr', 6, NULL),  -- Исполим (25 Lv)
  ('rbt_lQmGQbMo', 3, 5),  -- Сирена (25 Lv)
  ('rbt_1cIiRqdl', 3, 5),  -- Лесная Сирена
  ('rbt_ORRCEGSX', 3, NULL),  -- Гречневое отродье
  ('rbt_TTl8k76J', 4, NULL),  -- Дьявол (30 Lv)
  ('rbt_WyPrUVsR', 3, 5),  -- Болотная Кикимора
  ('rbt_81C4Pw1d', 5, NULL),  -- Само Безумие (45 Lv)
  ('rbt_dla9VN0D', 2, NULL),  -- Горный Батя
  ('rbt_8vlwEGzf', 7, NULL),  -- Грифон страж Рая
  ('rbt_7hzQ8XGV', 6, NULL),  -- Гречневый кот
  ('rbt_VkLWh8rQ', 4, 4),  -- Архи Дьявол (50 Lv)
  ('rbt_TTCTa91O', 5, 4),  -- Джин (45 Lv)
  ('rbt_T4yLOC8P', 2, 3),  -- Ктулху
  ('rbt_aJNyRPtX', 4, 5),  -- Глава Пиратов (75 Lv)
  ('rbt_y_KTqLU9', 3, 5),  -- Владыка Мороза (75 Lv)
  ('rbt_XxHBm-wA', 5, 5),  -- Лесная Лис
  ('rbt_ItXgVJfy', 6, NULL),  -- Страж Сокровища (80 Lv)
  ('rbt_BzvLVFyd', 2, NULL),  -- Гречневое Батя
  ('rbt_0WGvKGB7', 4, 7),  -- Бог Игры
  ('rbt_9RaMH1iz', 7, NULL),  -- Серафим
  ('rbt_11Wmqkcc', 6, 5)  -- Лесной Бог
  ) AS v(id, move, range)
 WHERE t.id = v.id;
