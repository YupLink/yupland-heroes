-- Остров новичка (владелец, 14.10.2026): «при входе новичок попадает на свою
-- собственную маленькую карту, генерируется под каждого отдельно, там только
-- он; герой, фишки, тестовые задания с инструкцией; рецепты топора, кирки и
-- лопаты; шахта, дерево, монстры; разрушенный портал — починил и перешёл в
-- основной мир». Пока — только для админов (тест), новичкам не включено.
--
-- Карта острова — обычная raid_maps (черновик, active = false) с id «isle_…»:
-- игроков главного мира там нет, порталы мира туда не ведут. Строка ниже — чей
-- это остров, где на нём что стоит и какие шаги задания уже засчитаны.
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.raid_island (
  account_id  text PRIMARY KEY,
  map_id      text NOT NULL UNIQUE REFERENCES yuplink.raid_maps(id) ON DELETE CASCADE,
  seed        bigint NOT NULL,
  -- Роли клеток: старт, сундук, мастерская, дубы, слизни, кристаллы, шахта,
  -- клад, портал, ратуша — куда ведёт кнопка «Показать» у шага.
  places      jsonb NOT NULL,
  -- Засчитанные шаги — раз и навсегда: дуб вырастет снова, шаг не откатится.
  done        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Тест админа: куда вернуть с острова (новичок выходит к замку мира).
  back_map    text,
  back_q      integer,
  back_r      integer,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- Разрушенный портал острова: тир 1 — руины, тир 2 — рабочий портал. Починка —
-- обычная постройка тира (building-action) за бревна, пыльцу и слиток из
-- рюкзака. Картинки руин — island-portal-ruin.webp (из облика «Портал»).
INSERT INTO yuplink.mystic_item_template (id, kind, name, image_url, meta, active)
VALUES (
  'building_island_portal', 'building', 'Портал острова',
  '/uploads/tasks/island-portal-ruin.webp',
  jsonb_build_object(
    'effect', 'portal',
    'levelPrices', '[]'::jsonb,
    'tiers', jsonb_build_array(
      jsonb_build_object(
        'name', 'Разрушенный портал',
        'imageUrl', '/uploads/tasks/island-portal-ruin.webp',
        'price', NULL,
        'requires', NULL,
        'costs', jsonb_build_array(
          jsonb_build_object('resource', 'item', 'itemKey', 'custom:cst_wtza7b6iq7va',
                             'itemName', 'Бревна Дуба', 'token', NULL, 'amount', 2),
          jsonb_build_object('resource', 'item', 'itemKey', 'custom:cst_plnb53k8v5dm',
                             'itemName', 'Магическая пыльца', 'token', NULL, 'amount', 2),
          jsonb_build_object('resource', 'item', 'itemKey', 'custom:cst_64csav5sczbu',
                             'itemName', 'Слиток Железа', 'token', NULL, 'amount', 1))),
      jsonb_build_object(
        'name', 'Портал',
        'imageUrl', '/uploads/tasks/E4hVRf4o2l.png',
        'price', NULL,
        'costs', NULL,
        'requires', NULL))),
  true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
