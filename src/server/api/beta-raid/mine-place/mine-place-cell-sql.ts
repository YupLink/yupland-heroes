// Признаки клетки, которые шахта проверяет сверх сундука (ПРАВИЛА §8.59.8), —
// одним куском на оба места: оператор постановки (одна клетка, mine-place-sql)
// и кандидаты режима стройки (19 клеток одним запросом, mine-plan-candidates).
// Правило одно — расходиться им негде.
//
//  · road — дорога на клетке;
//  · taken — блок клеток, объект (и повергнутый — он встанет снова) или декор;
//  · bag — живой мешочек (на земле или закопанный): под шахтой его не забрать;
//  · player — на клетке стоит ДРУГОЙ игрок (под себя ставить можно).
//
// Строка клетки — алиас c (raid_map_cells); at сопоставляет чужие таблицы с ней.
import { sqlStr } from "@/server/api/raid-shared";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";
import { livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";
import type { CellAt } from "@/server/api/beta-raid/chest/chest-cell";

/**
 * Живой мешочек (алиас lb): есть живая порция или забор в полёте — тот же
 * признак, что у сборщика (livePortion / inFlight): такой он не уберёт.
 */
export const liveBagSql = (lb: string): string =>
  `(EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
             WHERE x.bag_id = ${lb}.id AND ${livePortion("x")})
    OR EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_op o
                WHERE o.bag_id = ${lb}.id AND o.state = 'taken'))`;

/** Столбцы road / taken / bag / player для строки клетки c. */
export const mineCellColsSql = (account: string, at: CellAt): string =>
  `NULLIF(btrim(COALESCE(c.road_id, '')), '') IS NOT NULL AS road,
              (c.group_id IS NOT NULL OR c.object_id IS NOT NULL
               OR c.decoration_id IS NOT NULL) AS taken,
              EXISTS (SELECT 1 FROM yuplink.raid_loot_bag lb
                       WHERE ${at("lb")} AND ${liveBagSql("lb")}) AS bag,
              EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                       WHERE p.q = c.q AND p.r = c.r AND ${POS_MAP_SQL("p")} = c.map_id
                         AND p.account_id <> ${sqlStr(account)}) AS player`;
