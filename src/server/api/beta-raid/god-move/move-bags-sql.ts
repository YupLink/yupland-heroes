// Перенос мешочков клетки (режим бога, §8.21): разом все, что видел админ, —
// и живые, и закопанные (бугорок едет бугорком). Упавший на клетку после
// открытия окна остаётся: повтор переноса (потерянный ответ, двойной тап) не
// увезёт то, чего админ не видел, а ответит «уже там».
//
// Порции, сроки, метки и ключи нажатий живут по id мешочка (raid_loot_bag_item,
// raid_loot_bag_op), поэтому едут сами: снятие в полёте и его откат (backSql)
// работают с тем же мешочком на новой клетке. Входы «Открыть» в эти мешочки
// гаснут: окно у игрока — про прежнюю клетку.
//
// Куда можно: земля, не вода и не купол (там мешочек не увидеть и не взять),
// без декора (под декором мешочков не видно никому, §8.19) и без живого
// объекта или беглеца (пока он жив, мешочек не открыть, §8.21 п. 6). Постройка,
// сундук и другие мешочки — не помеха: мешочек лежит поверх, несколько —
// вкладками.
// Локи — как у выброса в мешочек: клетки (lootdrop:) обеих клеток, затем каждый
// мешочек (lootbag:<id>) по порядку id; строки мешочков и клеток FOR UPDATE.
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellFlagsSql } from "@/server/api/beta-raid/chest/chest-cell";
import { bagTarget } from "@/server/api/beta-raid/open-pass/pass-sql";
import { atCell } from "@/server/api/beta-raid/god-move/move-where";
import { doneOf, refusalOf, type RowBase } from "@/server/api/beta-raid/god-move/move-row";
import type { GodCell, GodMoveResult } from "@/lib/godMove";

/** Перенос мешочков: карта, откуда, куда и какие мешочки видел админ (id). */
export type BagsAt = { mapId: string; from: GodCell; to: GodCell; ids: string[] };

export type BagsRow = RowBase & { [count: string]: unknown };

export const BAGS_WRITE_NAMES = ["bags", "pass"] as const;

/** Виденные админом мешочки — список id для SQL (пусто — ни один). */
const seenSql = (o: BagsAt): string => (o.ids.length ? o.ids.map(sqlStr).join(", ") : "NULL");

/** Локи переноса мешочков — отдельными операторами до чтения. */
export function bagsLocksSql(o: BagsAt): string {
  const drop = (c: GodCell) => `lootdrop:${o.mapId}:${c.q}:${c.r}`;
  const mine = `${atCell("b", o.mapId, o.from)} AND b.id IN (${seenSql(o)})`;
  return `${locksSql(`godmove:${o.mapId}`, ...[drop(o.from), drop(o.to)].sort())}
     SELECT pg_advisory_xact_lock(hashtext('lootbag:' || s.id)) AS l
       FROM (SELECT b.id FROM yuplink.raid_loot_bag b WHERE ${mine} ORDER BY b.id) s;
     SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${mine} ORDER BY b.id
        FOR UPDATE;
     SELECT 1 FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(o.mapId)}
        AND ((c.q = ${o.from.q} AND c.r = ${o.from.r}) OR (c.q = ${o.to.q} AND c.r = ${o.to.r}))
      ORDER BY c.q, c.r
        FOR UPDATE;`;
}

/** Причина по порядку: сначала мешочки, потом целевая клетка. */
function reasonSql(o: BagsAt): string {
  const seen = seenSql(o);
  const at = (c: GodCell) => `EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b
                          WHERE ${atCell("b", o.mapId, c)} AND b.id IN (${seen}))`;
  return `SELECT CASE
     WHEN NOT ${at(o.from)} THEN
       CASE WHEN ${at(o.to)} THEN 'already'
            WHEN EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${atCell("b", o.mapId, o.from)})
            THEN 'changed' ELSE 'gone' END
     WHEN NOT EXISTS (SELECT 1 FROM dst WHERE dst.terrain_id IS NOT NULL) THEN 'target_missing'
     WHEN (SELECT f.water FROM f) THEN 'target_water'
     WHEN (SELECT f.dome FROM f) THEN 'target_dome'
     WHEN (SELECT f.obj FROM f) THEN 'target_object'
     WHEN EXISTS (SELECT 1 FROM dst WHERE dst.decoration_id IS NOT NULL) THEN 'target_decor'
     ELSE 'ok' END AS reason`;
}

/** Весь перенос мешочков: локи, решение, запись и ответ одной строкой. */
export function moveBagsSql(o: BagsAt): string {
  return `${bagsLocksSql(o)}
     WITH dst AS (SELECT c.terrain_id, c.decoration_id FROM yuplink.raid_map_cells c
                   WHERE ${atCell("c", o.mapId, o.to)}),
     f AS (${cellFlagsSql(o.mapId, o.to.q, o.to.r)}),
     chk AS (${reasonSql(o)}),
     go AS (SELECT 1 AS ok FROM chk WHERE chk.reason = 'ok'),
     bags AS (
       UPDATE yuplink.raid_loot_bag b SET q = ${o.to.q}, r = ${o.to.r}
         FROM go
        WHERE ${atCell("b", o.mapId, o.from)} AND b.id IN (${seenSql(o)})
       RETURNING b.id
     ),
     pass AS (
       UPDATE yuplink.raid_open_pass p SET until = now()
         FROM bags x
        WHERE p.target = ${sqlStr(bagTarget(""))} || x.id AND p.until > now()
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT reason FROM chk) AS reason,
              ${BAGS_WRITE_NAMES.map((n) => `(SELECT count(*) FROM ${n}) AS ${n}`).join(", ")}
     ) _t;`;
}

/** Ответ базы → итог. undefined — строки нет: вызывающий бросает ошибку. */
export function parseBagsRow(row: BagsRow | undefined): GodMoveResult | undefined {
  const no = refusalOf(row);
  if (no !== null || !row) return no ?? undefined;
  return doneOf(row, { cells: [], object: null });
}
