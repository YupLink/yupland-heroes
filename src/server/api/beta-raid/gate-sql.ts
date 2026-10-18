// Клетка с дверью — в SQL.
//
// Дверь берёт плату за вход, поэтому там, где клетку выбирает СЕРВЕР (сход на
// берег, выход из портала), её надо обходить: иначе игрок оказывался бы за
// дверью бесплатно, а списать с него молча — хуже вдвойне.
//
// Признак портала здесь ровно тот же, что в JS (buildingEffect): явный
// meta.effect, а имя смотрим ТОЛЬКО когда поля effect нет вовсе. Иначе
// постройка «Врата замка» с сознательно выключенным эффектом считалась бы
// дверью в SQL и не считалась в коде — маршрут её обходит, а плату никто не
// берёт.
//
// Номер сети читаем строкой и проверяем на цифры: `::int` от вписанного руками
// «первая» ронял бы весь запрос — вместе со сходом на берег по всей карте.
export const DOOR_SQL = (o: string): string => `(
  ${o}.building_id IS NOT NULL
  AND ${o}.building_config->'portal' IS NOT NULL
  AND (
    -- Эффект, назначенный КЛЕТКЕ, главнее шаблона: та же лестница, что в
    -- cellBuildingEffect. Табличка с ролью портала — тоже дверь.
    ${o}.building_config->>'effect' = 'portal'
    OR (
      (${o}.building_config->>'effect') IS NULL
      AND EXISTS (
        SELECT 1 FROM yuplink.mystic_item_template bt
         WHERE bt.id = ${o}.building_id
           AND (bt.meta->>'effect' = 'portal'
                OR (NOT (bt.meta ? 'effect')
                    AND bt.name ~* '(портал|телепорт|врат|portal)')))
    )
  )
  AND COALESCE(NULLIF(${o}.building_config->'portal'->>'group', ''), '0') ~ '^[0-9]+$'
  AND COALESCE(NULLIF(${o}.building_config->'portal'->>'group', ''), '0')::int = 0
  -- Достроенность считаем так же, как код (isBuilt): недостроенная дверь —
  -- стройка, платы не берёт, и обходить её маршруту незачем.
  AND EXISTS (
    SELECT 1 FROM yuplink.mystic_item_template bt2
     WHERE bt2.id = ${o}.building_id
       AND jsonb_typeof(bt2.meta->'tiers') = 'array'
       AND jsonb_array_length(bt2.meta->'tiers') > 0
       AND COALESCE((SELECT bs.tier FROM yuplink.beta_raid_building_state bs
                      WHERE bs.map_id = ${o}.map_id AND bs.q = ${o}.q AND bs.r = ${o}.r), 0)
           >= jsonb_array_length(bt2.meta->'tiers') - 1))`;
