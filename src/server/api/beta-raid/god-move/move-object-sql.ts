// Перенос объекта карты (режим бога): босс, моб, ресурсный объект клетки.
//
// Едет объект СВОЕЙ клетки (слой 0): id, настройки (object_config — свой запас
// HP, награды, снимок удалённого шаблона), расписка Darai и боевое состояние.
// Боевое состояние (beta_raid_object_hp) не пересоздаётся, а переезжает ТОЙ ЖЕ
// строкой — как при побеге (flee-sql-moves): её id — ключ урона игроков
// (beta_raid_object_run.hp_id), отметки «награда выдана» (`beta:<id>`) и ключа
// добычи босса; новое у неё только адрес. Расписка Darai держится за объектом:
// пул не трогаем, а расписки клеток меняются местами — у пустой цели бывает
// старая расписка снесённого объекта, и она не теряется, а остаётся на пустой
// клетке.
//
// Беглец под объектом НЕ едет: он прибежал сам, живёт своим слоем со своим
// домом (home_q/home_r) и ходит сам, как корабль и игрок. Объект уехал — беглец
// открылся на прежней клетке. Повергнутый объект не переносится: уборка трупов
// снимет его через секунды (dead-sweep), а переезд под ней воскресил бы его.
//
// Куда можно — туда же, куда ставит объект автораздача (scatter FREE_CELL и
// суша): земля, не вода, не купол, не блок, без постройки, объекта, беглеца,
// игрока, живого мешочка, сундука (и бугорка), декора; плюс без живой охраны,
// корабля и без боевого состояния прежнего объекта (иначе оно стало бы чужим).
// Локи: godmove:<карта>; decor-respawn — тот же, что у сборщика отрастания
// декора: декор не вырастет на цели поверх переезжающего объекта; chestcell и
// lootdrop цели — те же, что у установки сундука и выброса в мешочек: они не
// лягут под объект; строки обеих клеток и боевое состояние FOR UPDATE — удар по
// объекту подождёт.
import { sqlStr } from "@/server/api/raid-shared";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellLockKey } from "@/server/api/beta-raid/chest/chest-cell";
import { WATER_SQL, buildingHeldSql } from "@/server/api/beta-raid/cell-sql";
import { CELL_LAYER, deadHpSql } from "@/server/api/beta-raid/runners";
import { atCell } from "@/server/api/beta-raid/god-move/move-where";
import { doneOf, refusalOf, type RowBase } from "@/server/api/beta-raid/god-move/move-row";
import type { GodCell, GodMoveResult } from "@/lib/godMove";

/** Перенос объекта: карта, откуда, куда и какой объект (id клетки) видел админ. */
export type ObjectAt = { mapId: string; from: GodCell; to: GodCell; ref: string };

export type ObjectRow = RowBase & {
  object_id?: string | null;
  /** На прежней клетке лежат мешочки: открылись — разослать слой мешочков. */
  bags_from?: boolean | null;
  [count: string]: unknown;
};

export const OBJECT_WRITE_NAMES = ["cells", "hp"] as const;

/** Локи переноса объекта — отдельными операторами до чтения. */
export function objectLocksSql(o: ObjectAt): string {
  const m = sqlStr(o.mapId);
  return `${locksSql(
    `godmove:${o.mapId}`,
    "decor-respawn",
    cellLockKey(o.mapId, o.to.q, o.to.r),
    `lootdrop:${o.mapId}:${o.to.q}:${o.to.r}`,
  )}
     SELECT 1 FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${m}
        AND ((c.q = ${o.from.q} AND c.r = ${o.from.r}) OR (c.q = ${o.to.q} AND c.r = ${o.to.r}))
      ORDER BY c.q, c.r
        FOR UPDATE;
     SELECT 1 FROM yuplink.beta_raid_object_hp h
      WHERE ${atCell("h", o.mapId, o.from)} AND h.cycle_no = ${CELL_LAYER}
        FOR UPDATE;`;
}

/** Цель глазами автораздачи (FREE_CELL) плюс охрана, корабль и чужой бой.
 *  Его же читает возрождение мобов (mob-spawn-sql): встать можно туда же. */
export function targetSql(o: ObjectAt): string {
  const here = (t: string, a: string) =>
    `EXISTS (SELECT 1 FROM yuplink.${t} ${a}
              WHERE ${a}.map_id = c.map_id AND ${a}.q = c.q AND ${a}.r = c.r`;
  return `SELECT c.terrain_id IS NOT NULL AS ground,
            COALESCE(${WATER_SQL}, false) AS water,
            c.void_fog AS dome,
            c.group_id IS NOT NULL AS block,
            ${buildingHeldSql("c")} AS building,
            c.object_id IS NOT NULL AS obj,
            ${here("beta_raid_runner", "rn")}) AS runner,
            EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                     WHERE p.q = c.q AND p.r = c.r
                       AND ${POS_MAP_SQL("p")} = c.map_id) AS player,
            (${here("raid_magic_chest", "mc")}) OR ${here("raid_plain_chest", "pc")})) AS chest,
            EXISTS (SELECT 1 FROM yuplink.raid_loot_bag lb
                      JOIN yuplink.raid_loot_bag_item li ON li.bag_id = lb.id
                     WHERE lb.map_id = c.map_id AND lb.q = c.q AND lb.r = c.r
                       AND li.count > 0 AND li.expires_at > now()) AS bag,
            ${here("raid_mine_guard", "g")} AND g.killed_at IS NULL AND g.current_hp > 0) AS guard,
            c.decoration_id IS NOT NULL AS decor,
            ${here("beta_raid_ship", "s")}) AS ship,
            ${here("beta_raid_object_hp", "h")} AND h.cycle_no = ${CELL_LAYER}) AS object
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE ${atCell("c", o.mapId, o.to)}`;
}

/** Причина по порядку: сначала сам объект, потом целевая клетка. */
function reasonSql(o: ObjectAt): string {
  const want = sqlStr(o.ref);
  const flags: Array<[string, string]> = [
    ["block", "target_block"],
    ["water", "target_water"],
    ["dome", "target_dome"],
    ["building", "target_building"],
    ["obj", "target_object"],
    ["runner", "target_runner"],
    ["player", "target_player"],
    ["chest", "target_chest"],
    ["bag", "target_bag"],
    ["guard", "target_guard"],
    ["decor", "target_decor"],
    ["ship", "target_ship"],
    ["object", "target_leftovers"],
  ];
  return `SELECT CASE
     WHEN NOT EXISTS (SELECT 1 FROM src WHERE src.object_id IS NOT NULL) THEN
       CASE WHEN EXISTS (SELECT 1 FROM dst WHERE dst.object_id = ${want})
            THEN 'already' ELSE 'gone' END
     WHEN NOT EXISTS (SELECT 1 FROM src WHERE src.object_id = ${want}) THEN 'changed'
     WHEN (SELECT src.dead FROM src) THEN 'dead'
     WHEN NOT EXISTS (SELECT 1 FROM tg WHERE tg.ground) THEN 'target_missing'
     ${flags.map(([f, r]) => `WHEN (SELECT tg.${f} FROM tg) THEN '${r}'`).join("\n     ")}
     ELSE 'ok' END AS reason`;
}

/**
 * Весь перенос объекта: локи, решение, запись и ответ одной строкой.
 * `also` — своя запись той же транзакцией, только если перенос состоялся
 * (шаг бродящего моба отмечает, где он теперь: mob-spawn-sql).
 */
export function moveObjectSql(o: ObjectAt, also?: string): string {
  const m = o.mapId;
  const isFrom = `c.q = ${o.from.q} AND c.r = ${o.from.r}`;
  const isTo = `c.q = ${o.to.q} AND c.r = ${o.to.r}`;
  const pick = (col: string, a: string) => `CASE WHEN ${isFrom} THEN ${a} ELSE s.${col} END`;
  return `${objectLocksSql(o)}
     WITH src AS (
       SELECT c.object_id, c.object_config, c.darai_ref, c.darai_hold,
              ${deadHpSql("c", CELL_LAYER)} AS dead
         FROM yuplink.raid_map_cells c WHERE ${atCell("c", m, o.from)}
     ),
     dst AS (
       SELECT c.object_id, c.darai_ref, c.darai_hold
         FROM yuplink.raid_map_cells c WHERE ${atCell("c", m, o.to)}
     ),
     tg AS (${targetSql(o)}),
     chk AS (${reasonSql(o)}),
     go AS (SELECT 1 AS ok FROM chk WHERE chk.reason = 'ok'),
     cells AS (
       UPDATE yuplink.raid_map_cells c
          SET object_id = ${pick("object_id", "NULL")},
              object_config = ${pick("object_config", "NULL")},
              darai_ref = ${pick("darai_ref", "d.darai_ref")},
              darai_hold = ${pick("darai_hold", "d.darai_hold")},
              saved_at = now()
         FROM src s, dst d, go
        WHERE c.map_id = ${sqlStr(m)} AND ((${isFrom}) OR (${isTo}))
       RETURNING 1
     ),
     hp AS (
       UPDATE yuplink.beta_raid_object_hp h SET q = ${o.to.q}, r = ${o.to.r}
         FROM go
        WHERE ${atCell("h", m, o.from)} AND h.cycle_no = ${CELL_LAYER}
       RETURNING 1
     )${
       also
         ? `,
     also AS (${also})`
         : ""
     }
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT reason FROM chk) AS reason,
              (SELECT tg.object FROM tg) AS object,
              CASE WHEN (SELECT reason FROM chk) = 'already'
                   THEN (SELECT dst.object_id FROM dst) ELSE (SELECT src.object_id FROM src) END
                AS object_id,
              EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b WHERE ${atCell("b", m, o.from)})
                AS bags_from,
              ${OBJECT_WRITE_NAMES.map((n) => `(SELECT count(*) FROM ${n}) AS ${n}`).join(", ")}
     ) _t;`;
}

/** Ответ базы → итог. undefined — строки нет: вызывающий бросает ошибку. */
export function parseObjectRow(row: ObjectRow | undefined): GodMoveResult | undefined {
  const no = refusalOf(row);
  if (no !== null || !row) return no ?? undefined;
  if (!row.object_id) return undefined;
  return doneOf(row, { cells: [], object: { id: String(row.object_id), alive: true } });
}
