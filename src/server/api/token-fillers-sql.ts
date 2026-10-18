// Как читать денежную награду объекта карты — общее для «Свободно USDT»
// (token-free-pool) и проверок перед записью на карту (usdt-objects).

/**
 * Номинал наполнителя. Тот же разбор, что у обеспечения Darai
 * (map-darai-read): вписанное руками «1 000» не должно ронять весь запрос.
 */
export const AMOUNT_SQL = `CASE
      WHEN jsonb_typeof(f->'amount') = 'number' THEN (f->>'amount')::numeric
      WHEN COALESCE(f->>'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (f->>'amount')::numeric
      ELSE 0 END`;

/**
 * Где у объекта лежит награда: своя настройка → шаблон босса → снимок
 * удалённого шаблона → шаблон предмета. Порядок обязан совпадать с выдачей,
 * иначе «на карте» покажет не то, что игрок реально получит.
 * Ждёт в запросе алиасы `bt` (raid_boss_template) и `t` (mystic_item_template).
 */
export const FILLERS_SQL = (o: string) => `CASE
    WHEN jsonb_typeof(${o}.object_config->'rewardConfig'->'fillers') = 'array'
      THEN ${o}.object_config->'rewardConfig'->'fillers'
    WHEN jsonb_typeof(bt.reward_tiers->'fillers') = 'array'
      THEN bt.reward_tiers->'fillers'
    WHEN jsonb_typeof(${o}.object_config->'tpl'->'rewardConfig'->'fillers') = 'array'
      THEN ${o}.object_config->'tpl'->'rewardConfig'->'fillers'
    WHEN jsonb_typeof(t.meta->'rewardConfig'->'fillers') = 'array'
      THEN t.meta->'rewardConfig'->'fillers'
    ELSE '[]'::jsonb END`;

/** Шаблоны босса и предмета для объекта с алиасом `o` — под FILLERS_SQL. */
export const TEMPLATE_JOINS_SQL = (o: string) => `
    LEFT JOIN yuplink.raid_boss_template bt
           ON ${o}.object_id LIKE 'boss:%' AND bt.id = split_part(${o}.object_id, ':', 2)
    LEFT JOIN yuplink.mystic_item_template t
           ON t.id = CASE WHEN ${o}.object_id LIKE '%:%'
                          THEN split_part(${o}.object_id, ':', 2) ELSE ${o}.object_id END`;

/** Условие «наполнитель — эта монета» (регистр не важен). */
export const TOKEN_FILLER_SQL = (symbolSql: string) =>
  `f->>'kind' = 'token' AND lower(COALESCE(f->>'token', '')) = lower(${symbolSql})`;
