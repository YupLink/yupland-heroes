// Чем объект платит: SQL-кусочки для восстановления карты.
//
// Поднятый объект снова обещает игроку свою награду и снова тянет пул. Админ
// вправе решать отдельно по каждой валюте: «боссов с Darai поднимай, а с USDT
// не трогай». Отсюда фильтр по ресурсам — он нужен и кнопке, и подсчёту перед
// ней, поэтому живёт одним модулем, а не двумя копиями.
//
// Порядок поиска награды тот же, что у выдачи (cell-override → шаблон босса →
// снимок удалённого шаблона → шаблон предмета). Иначе фильтр судил бы по
// одной награде, а игрок получал другую: у боссов настройка лежит в
// raid_boss_template, и короткая цепочка их попросту не видела.

/** Ресурсы, которыми управляет галочка в окне восстановления. */
export const RESTORE_RESOURCES = ["darai", "usdt"] as const;
export type RestoreResource = (typeof RESTORE_RESOURCES)[number];

/** Номинал наполнителя. Вписанное руками «1 000» не должно ронять запрос. */
export const AMOUNT_SQL = `CASE
      WHEN jsonb_typeof(f->'amount') = 'number' THEN (f->>'amount')::numeric
      WHEN COALESCE(f->>'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (f->>'amount')::numeric
      ELSE 0 END`;

/** Где лежит награда объекта. Алиасы `bt` и `t` обязаны быть в запросе. */
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

/** Подключение шаблона босса — без него у боссов не видно их награды. */
export const BOSS_TEMPLATE_JOIN = (o: string) => `LEFT JOIN yuplink.raid_boss_template bt
            ON ${o}.object_id LIKE 'boss:%' AND bt.id = split_part(${o}.object_id, ':', 2)`;

/** Сумма одной валюты в награде объекта — для отчёта «сколько вернётся». */
export const resourceSumSql = (o: string, resource: RestoreResource): string =>
  `(SELECT COALESCE(SUM(${AMOUNT_SQL}), 0)
      FROM jsonb_array_elements(${FILLERS_SQL(o)}) f
     WHERE f->>'kind' = 'token' AND lower(COALESCE(f->>'token','')) = '${resource}')`;

/**
 * Условие «этот объект разрешено поднимать».
 *
 * Снятая галочка запрещает объекты, которые платят этой валютой: они не
 * оживают и пул не качают. Объект, который не платит ни одной из них (паки,
 * энергия, предметы), поднимается всегда — обеспечивать ему нечего.
 *
 * Нулевой номинал не считается: филлер «Darai 0» ничего не обещает, и
 * блокировать из-за него объект значило бы прятать его без причины.
 *
 * Обе галочки на месте — фильтра нет вовсе (`TRUE`), запрос остаётся прежним.
 */
export function resourceFilterSql(o: string, allowed: Record<RestoreResource, boolean>): string {
  const banned = RESTORE_RESOURCES.filter((r) => !allowed[r]);
  if (banned.length === 0) return "TRUE";
  const list = banned.map((r) => `'${r}'`).join(",");
  return `NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(${FILLERS_SQL(o)}) f
       WHERE f->>'kind' = 'token'
         AND lower(COALESCE(f->>'token','')) IN (${list})
         AND ${AMOUNT_SQL} > 0)`;
}
