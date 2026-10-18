// Перенос здания, блока или декора (режим бога) — текст запроса и ответ.
//
// Одна строка запроса — одна неявная транзакция (так держат и сундуки,
// chest-net-sql): сначала локи ОТДЕЛЬНЫМИ операторами, затем один WITH —
// решение (move-check-sql) и перенос (move-cells-sql, move-write-sql) на одном
// снимке. Локи:
//  • godmove:<карта> — два переноса на карте идут по очереди: одно и то же
//    не уедет дважды, на одну клетку не встанут двое;
//  • decor-respawn — тот же, что у сборщика отрастания декора: он не поставит
//    декор и не снимет возврат посреди переезда;
//  • mine:/field:<карта>:<q>:<r> клетки постройки и её цели — те же, что у
//    захвата и сбора шахты и у грядки: шахта не захватится и герой не снимется
//    посреди переезда;
//  • chestcell:<карта>:<q>:<r> всех новых клеток — тот же, что у установки
//    сундука: сундук не встанет туда, куда едет дом (и пустой член блока);
//  • строки всех затронутых клеток raid_map_cells FOR UPDATE — правка кисти
//    этих клеток и рубка декора (CAS по клетке) подождут;
//  • строки склада города клетки постройки FOR UPDATE — начатые раньше сделка
//    или суточный тик успевают лечь в журнал склада до снимка переноса.
// Без обёртки wrapJson: изменяющие CTE — верхний уровень, JSON ответа
// собираем сами (sqlRow). Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { cellLockKey } from "@/server/api/beta-raid/chest/chest-cell";
import { checkCtes } from "@/server/api/beta-raid/god-move/move-check-sql";
import { atCell, inCells } from "@/server/api/beta-raid/god-move/move-where";
import { WRITE_NAMES, writeCtes } from "@/server/api/beta-raid/god-move/move-write-sql";
import {
  cellWriteNames,
  regrowCtes,
  unitCellsSql,
} from "@/server/api/beta-raid/god-move/move-cells-sql";
import {
  buildingCell,
  freshCells,
  newCells,
  shifted,
  type UnitAt,
} from "@/server/api/beta-raid/god-move/move-unit";
import {
  doneOf,
  parseCells,
  refusalOf,
  type RowBase,
} from "@/server/api/beta-raid/god-move/move-row";
import type { GodCell, GodMoveResult } from "@/lib/godMove";

/** Строка ответа: причина, остатки на цели, клетки после переноса, тир, счётчики. */
export type UnitRow = RowBase & {
  moved?: unknown;
  tier?: number | string | null;
  [count: string]: unknown;
};

const byCell = (a: GodCell, b: GodCell) => a.q - b.q || a.r - b.r;

/** Локи переноса — отдельными операторами до чтения. */
export function unitLocksSql(o: UnitAt): string {
  const b = buildingCell(o);
  const key = (kind: string, c: GodCell) => `${kind}:${o.mapId}:${c.q}:${c.r}`;
  const keys = [`godmove:${o.mapId}`, "decor-respawn"];
  if (b) {
    const t = shifted(o, b);
    keys.push(key("mine", b), key("mine", t), key("field", b), key("field", t));
  }
  for (const c of [...newCells(o)].sort(byCell)) keys.push(cellLockKey(o.mapId, c.q, c.r));
  const all = [...o.unit.cells, ...freshCells(o)];
  return `${locksSql(...keys)}
     SELECT 1 FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(o.mapId)} AND ${inCells("c", all)}
      ORDER BY c.q, c.r
        FOR UPDATE;${
          b
            ? `
     SELECT 1 FROM yuplink.raid_town_stock x
      WHERE ${atCell("x", o.mapId, b)}
      ORDER BY x.good_id
        FOR UPDATE;`
            : ""
        }`;
}

/** Имена подзапросов записи — для ответа и журнала сервера. */
export function unitWriteNames(o: UnitAt): string[] {
  return [...cellWriteNames(o), ...(buildingCell(o) ? WRITE_NAMES : [])];
}

/** Весь перенос: локи, решение, запись и ответ одной строкой. */
export function moveUnitSql(o: UnitAt): string {
  const b = buildingCell(o);
  const writes = [
    unitCellsSql(o),
    ...regrowCtes(o),
    ...(b ? [writeCtes({ mapId: o.mapId, from: b, to: shifted(o, b) })] : []),
  ];
  const counts = unitWriteNames(o)
    .map((n) => `(SELECT count(*) FROM ${n}) AS ${n}`)
    .join(",\n              ");
  const moved = `(SELECT json_agg(json_build_object(
                  'q', x.q, 'r', x.r, 'b', x.building_id, 's', x.building_skin_id,
                  'd', x.decoration_id, 'g', x.group_id, 'k', x.icon_scale))
                 FROM cells x)`;
  const tier = b ? "(SELECT x.tier FROM tier_up x LIMIT 1)" : "NULL::int";
  return `${unitLocksSql(o)}
     WITH ${checkCtes(o)},
     ${writes.join(",\n     ")}
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT reason FROM chk) AS reason,
              lo.market, lo.town, lo.warehouse, lo.field, lo.mine,
              ${moved} AS moved,
              ${tier} AS tier,
              ${counts}
         FROM lo
     ) _t;`;
}

/**
 * Ответ базы → итог для окна. undefined — строки нет (запрос не ответил):
 * вызывающий бросает ошибку, а не рапортует перенос, которого не видел.
 */
export function parseUnitRow(row: UnitRow | undefined): GodMoveResult | undefined {
  const no = refusalOf(row);
  if (no !== null || !row) return no ?? undefined;
  return doneOf(row, { cells: parseCells(row.moved, row.tier), object: null });
}
