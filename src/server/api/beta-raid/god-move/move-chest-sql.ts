// Перенос сундука (режим бога): обычного (§8.22) и магического (§8.15).
//
// Едет строка сундука как есть: хозяин, предмет, закопанность (бугорок едет
// бугорком). Содержимое к клетке не привязано — у обычного ячейки по id
// сундука, у магического сеть по хозяину, — поэтому едет само. Охрана
// магического (raid_mine_guard его клетки) едет с ним; на клетке с постройкой
// охрана могла быть и шахтой — не различить, отказ (как у переноса здания).
// Входы «Открыть» (§8.23) в этот сундук гаснут, как при «Забрать сундук»: у
// магического вход по клетке, у обычного окно закрывается по прежней клетке, а
// окно у игрока уже про пустую клетку. Журналы (сделки, «Забрать сундук») —
// история и остаются где были.
//
// Куда можно — куда встал бы сундук при установке (CELL_HELD, §8.28) с землёй,
// но без ЛЮБОГО декора: под декором бугорок не виден никому и не выкапывается
// (bag.decor, §8.19), а проходимый декор не рубят — сундук застрял бы навсегда;
// плюс для охраны — без любой строки охраны на цели (ключ — клетка).
// Локи — как у установки и «Забрать сундук»: сеть хозяина (chest:) или сундук
// (pchest:), затем клетки chestcell: обеих клеток; decor-respawn — сборщик
// отрастания не вырастит декор поверх стоящего на цели сундука; строки сундука,
// охраны и обеих клеток FOR UPDATE (удар по охране лока сети не берёт).
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellExtraSql, cellFlagsSql, cellLockKey } from "@/server/api/beta-raid/chest/chest-cell";
import { buildingHeldSql } from "@/server/api/beta-raid/cell-sql";
import { magicTarget, plainTarget } from "@/server/api/beta-raid/open-pass/pass-sql";
import { atCell, hasAt } from "@/server/api/beta-raid/god-move/move-where";
import { doneOf, refusalOf, type RowBase } from "@/server/api/beta-raid/god-move/move-row";
import type { GodCell, GodMoveResult } from "@/lib/godMove";

/**
 * Перенос сундука. ref — что видел админ: у магического — хозяин (аккаунт), у
 * обычного — id сундука.
 */
export type ChestAt = { mapId: string; from: GodCell; to: GodCell; magic: boolean; ref: string };

export type ChestRow = RowBase & { [count: string]: unknown };

/** Имена записей — для ответа и журнала сервера. */
export const chestWriteNames = (o: ChestAt): string[] =>
  o.magic ? ["chest", "guard", "pass"] : ["chest", "pass"];

/** Локи переноса сундука — отдельными операторами до чтения. */
export function chestLocksSql(o: ChestAt): string {
  const m = sqlStr(o.mapId);
  const cells = [cellLockKey(o.mapId, o.from.q, o.from.r), cellLockKey(o.mapId, o.to.q, o.to.r)];
  const own = o.magic ? `chest:${o.ref}` : `pchest:${o.ref}`;
  const row = o.magic
    ? `SELECT 1 FROM yuplink.raid_mine_guard g WHERE ${atCell("g", o.mapId, o.from)} FOR UPDATE;
     SELECT 1 FROM yuplink.raid_magic_chest x WHERE ${atCell("x", o.mapId, o.from)} FOR UPDATE;`
    : `SELECT 1 FROM yuplink.raid_plain_chest x WHERE x.id = ${sqlStr(o.ref)} FOR UPDATE;`;
  return `${locksSql(`godmove:${o.mapId}`, own, ...cells.sort(), "decor-respawn")}
     ${row}
     SELECT 1 FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${m}
        AND ((c.q = ${o.from.q} AND c.r = ${o.from.r}) OR (c.q = ${o.to.q} AND c.r = ${o.to.r}))
      ORDER BY c.q, c.r
        FOR UPDATE;`;
}

/** Сундук тот самый? Нет — повтор («already»), другой («changed») или ушёл. */
function sourceSql(o: ChestAt): string[] {
  const want = sqlStr(o.ref);
  const any = `(EXISTS (SELECT 1 FROM mc_a) OR EXISTS (SELECT 1 FROM pc_a))`;
  if (o.magic) {
    const there = `EXISTS (SELECT 1 FROM yuplink.raid_magic_chest x
                     WHERE ${atCell("x", o.mapId, o.to)} AND x.owner_account = ${want})`;
    return [
      `WHEN NOT ${any} THEN CASE WHEN ${there} THEN 'already' ELSE 'gone' END`,
      `WHEN NOT EXISTS (SELECT 1 FROM mc_a WHERE mc_a.owner_account = ${want}) THEN 'changed'`,
      `WHEN ${hasAt("raid_mine_guard", o.mapId, o.from)}
            AND EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                         WHERE ${atCell("c", o.mapId, o.from)} AND ${buildingHeldSql("c")})
       THEN 'chest_guard'`,
    ];
  }
  const there = `EXISTS (SELECT 1 FROM yuplink.raid_plain_chest x
                   WHERE x.id = ${want} AND ${atCell("x", o.mapId, o.to)})`;
  return [
    `WHEN NOT EXISTS (SELECT 1 FROM pc_a WHERE pc_a.id = ${want}) THEN
       CASE WHEN ${there} THEN 'already' WHEN ${any} THEN 'changed' ELSE 'gone' END`,
  ];
}

/** Причина по порядку: сначала сам сундук, потом целевая клетка (CELL_HELD). */
function reasonSql(o: ChestAt): string {
  const held: Array<[string, string]> = [
    ["f.water", "target_water"],
    ["f.dome", "target_dome"],
    ["f.building", "target_building"],
    ["f.obj", "target_object"],
    ["f.chest", "target_chest"],
    ["f.guard", "target_guard"],
    ["dst.decor", "target_decor"],
    ["ex.ship", "target_ship"],
  ];
  const guardRow = o.magic
    ? [
        `WHEN ${hasAt("raid_mine_guard", o.mapId, o.from)} AND ${hasAt("raid_mine_guard", o.mapId, o.to)}
       THEN 'target_guard'`,
      ]
    : [];
  return `SELECT CASE
     ${sourceSql(o).join("\n     ")}
     WHEN NOT EXISTS (SELECT 1 FROM dst WHERE dst.ground) THEN 'target_missing'
     ${held.map(([f, r]) => `WHEN (SELECT ${f} FROM ${f.split(".")[0]}) THEN '${r}'`).join("\n     ")}
     ${guardRow.join("\n     ")}
     ELSE 'ok' END AS reason`;
}

/** Записи: сундук (и охрана магического) на новую клетку, входы гаснут. */
function writesSql(o: ChestAt): string {
  const to = `q = ${o.to.q}, r = ${o.to.r}`;
  const passes = o.magic
    ? `p.target IN (${sqlStr(magicTarget(o.mapId, o.from.q, o.from.r))}, ${sqlStr(
        magicTarget(o.mapId, o.to.q, o.to.r),
      )})`
    : `p.target = ${sqlStr(plainTarget(o.ref))}`;
  const chest = o.magic
    ? `UPDATE yuplink.raid_magic_chest x SET ${to} FROM go
        WHERE ${atCell("x", o.mapId, o.from)} AND x.owner_account = ${sqlStr(o.ref)}`
    : `UPDATE yuplink.raid_plain_chest x SET ${to} FROM go
        WHERE x.id = ${sqlStr(o.ref)} AND ${atCell("x", o.mapId, o.from)}`;
  return [
    `chest AS (
       ${chest}
       RETURNING 1
     )`,
    ...(o.magic
      ? [
          `guard AS (
       UPDATE yuplink.raid_mine_guard g SET ${to} FROM go
        WHERE ${atCell("g", o.mapId, o.from)}
       RETURNING 1
     )`,
        ]
      : []),
    `pass AS (
       UPDATE yuplink.raid_open_pass p SET until = now() FROM go
        WHERE ${passes} AND p.until > now()
       RETURNING 1
     )`,
  ].join(",\n     ");
}

/** Весь перенос сундука: локи, решение, запись и ответ одной строкой. */
export function moveChestSql(o: ChestAt): string {
  const counts = chestWriteNames(o)
    .map((n) => `(SELECT count(*) FROM ${n}) AS ${n}`)
    .join(", ");
  return `${chestLocksSql(o)}
     WITH mc_a AS (SELECT x.owner_account FROM yuplink.raid_magic_chest x
                    WHERE ${atCell("x", o.mapId, o.from)}),
     pc_a AS (SELECT x.id FROM yuplink.raid_plain_chest x WHERE ${atCell("x", o.mapId, o.from)}),
     dst AS (SELECT c.terrain_id IS NOT NULL AS ground, c.decoration_id IS NOT NULL AS decor
               FROM yuplink.raid_map_cells c WHERE ${atCell("c", o.mapId, o.to)}),
     f AS (${cellFlagsSql(o.mapId, o.to.q, o.to.r)}),
     ex AS (${cellExtraSql(o.mapId, o.to.q, o.to.r)}),
     chk AS (${reasonSql(o)}),
     go AS (SELECT 1 AS ok FROM chk WHERE chk.reason = 'ok'),
     ${writesSql(o)}
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT reason FROM chk) AS reason, ${counts}
     ) _t;`;
}

/** Ответ базы → итог. undefined — строки нет: вызывающий бросает ошибку. */
export function parseChestRow(row: ChestRow | undefined): GodMoveResult | undefined {
  const no = refusalOf(row);
  if (no !== null || !row) return no ?? undefined;
  return doneOf(row, { cells: [], object: null });
}
