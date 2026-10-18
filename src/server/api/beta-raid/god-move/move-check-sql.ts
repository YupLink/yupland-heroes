// Перенос здания, блока или декора (режим бога): можно ли — решает ОДИН
// подзапрос `chk`.
//
// Всё, что пишет перенос (move-cells-sql, move-write-sql), подвешено к строке
// `go`: она есть, только когда `chk` сказал «ok». Отказ поэтому всегда раньше
// любых изменений — и тем же оператором, что перенос.
//
// Что значит «можно»:
//  • ОТКУДА — на ведущей клетке тот самый слой, что видел админ (постройка без
//    облика или декор), и состав единицы тот же, что в снимке (`drift`: клетки
//    блока, где постройка и декор). Сундук с охраной на клетке здания (старые,
//    до запрета §8.28) — отказ: охрана одна на клетку, и чья она — не различить.
//  • КУДА — новые клетки, которых в единице не было: правило «клетку держит»
//    сундука (CELL_HELD, chest-cell.ts) плюс земля и не чужой блок. Свои
//    старые клетки свободны: блок сдвигается «сам на себя». Блок и декор не
//    ложатся и на проходной чужой декор (он пропал бы или стал картинкой
//    блока); едущий декор — ещё и на беглеца и игрока (рост декора их ждёт,
//    decor-respawn-sql BUSY). Клетка, куда встаёт постройка или декор, даже
//    своя старая, — без живого объекта, сундука и охраны; куда встаёт декор —
//    ещё и без живых мешочков (под декором их не видно, §8.19). Клетка
//    постройки — без данных снесённой постройки (лавка, ратуша, склад, грядка,
//    шахта).
//  • Повтор: на ведущей клетке слоя уже нет, а на цели тот же — «already».
import { sqlStr } from "@/server/api/raid-shared";
import { cellExtraSql, cellFlagsSql } from "@/server/api/beta-raid/chest/chest-cell";
import {
  buildingCell,
  decorCell,
  decorHereSql,
  freshCells,
  unitParts,
  type UnitAt,
} from "@/server/api/beta-raid/god-move/move-unit";
import { atCell, hasAt, inCells } from "@/server/api/beta-raid/god-move/move-where";
import {
  bagsUnderSql,
  freshExtraSql,
  groundSql,
  landingCells,
  leftoversSql,
} from "@/server/api/beta-raid/god-move/move-target-sql";

/** Флаги «клетку держит» по нескольким клеткам разом: держит хоть одна. */
const anyOf = (parts: string[], cols: string[]): string =>
  `SELECT ${cols.map((c) => `bool_or(x.${c}) AS ${c}`).join(", ")}
     FROM (${parts.map((p) => `(${p})`).join(" UNION ALL ")}) x`;

/** Колонка слоя, по которому узнаём ведущую клетку: постройка или декор. */
const layerCol = (o: UnitAt): string => (o.kind === "building" ? "building_id" : "decoration_id");

/**
 * Состав единицы разошёлся со снимком: клетки блока другие, или постройка /
 * декор стоят уже не там. Вне блока — клетка вступила в блок.
 */
function driftSql(o: UnitAt): string {
  const p = unitParts(o);
  const plan = o.unit.cells.map((c) => `(${c.q}, ${c.r}, ${c.building}, ${c.decor})`).join(", ");
  const where = o.unit.gid
    ? `c.group_id = ${sqlStr(o.unit.gid)}`
    : `c.q = ${o.from.q} AND c.r = ${o.from.r} AND c.group_id IS NULL`;
  const diff = [
    "u.q IS NULL",
    "p.q IS NULL",
    ...(p.building ? ["u.b <> p.b"] : []),
    ...(p.decor ? ["u.d <> p.d"] : []),
  ].join(" OR ");
  return `SELECT 1 FROM (
         SELECT c.q, c.r, c.building_id IS NOT NULL AS b, ${decorHereSql("c")} AS d
           FROM yuplink.raid_map_cells c
          WHERE c.map_id = ${sqlStr(o.mapId)} AND ${where}
       ) u
       FULL JOIN (VALUES ${plan}) AS p(q, r, b, d) ON p.q = u.q AND p.r = u.r
      WHERE ${diff}`;
}

/** Причина отказа по порядку: сначала сама единица, потом новые клетки. */
function reasonSql(o: UnitAt): string {
  const p = unitParts(o);
  const col = layerCol(o);
  const want = sqlStr(o.ref);
  const b = buildingCell(o);
  // Едет декор — рост его ждёт беглеца и игрока (BUSY), и он же не ложится на
  // чужой декор; блок — тоже: проходной декор новой клетки стал бы картинкой блока.
  const busy = decorCell(o) !== null;
  const decorish = p.decor || p.group;
  // Повтор блока — цель держит тот же блок: id шаблона у разных построек общий.
  const sameBlock = o.unit.gid ? ` AND goal.group_id = ${sqlStr(o.unit.gid)}` : "";
  const lines = [
    `WHEN NOT EXISTS (SELECT 1 FROM lead WHERE lead.${col} IS NOT NULL) THEN
       CASE WHEN EXISTS (SELECT 1 FROM goal WHERE goal.${col} = ${want}${sameBlock})
            THEN 'already' ELSE 'gone' END`,
    `WHEN NOT EXISTS (SELECT 1 FROM lead WHERE lead.${col} = ${want}) THEN 'changed'`,
    `WHEN EXISTS (SELECT 1 FROM drift) THEN 'changed'`,
    ...(b
      ? [
          `WHEN ${hasAt("raid_magic_chest", o.mapId, b)} AND ${hasAt("raid_mine_guard", o.mapId, b)}
       THEN 'chest_guard'`,
        ]
      : []),
    `WHEN EXISTS (SELECT 1 FROM ground) THEN 'target_missing'`,
    `WHEN (SELECT fx.block FROM fx) THEN 'target_block'`,
    `WHEN (SELECT f.water FROM f) THEN 'target_water'`,
    `WHEN (SELECT f.dome FROM f) THEN 'target_dome'`,
    `WHEN (SELECT f.building FROM f) THEN 'target_building'`,
    `WHEN (SELECT f.obj FROM f) OR (SELECT ld.obj FROM ld) THEN 'target_object'`,
    ...(busy
      ? [
          `WHEN (SELECT fx.runner FROM fx) THEN 'target_runner'`,
          `WHEN (SELECT fx.player FROM fx) THEN 'target_player'`,
        ]
      : []),
    `WHEN (SELECT f.chest FROM f) OR (SELECT ld.chest FROM ld) THEN 'target_chest'`,
    `WHEN (SELECT bd.bag FROM bd) THEN 'target_bag'`,
    `WHEN (SELECT f.guard FROM f) OR (SELECT ld.guard FROM ld) THEN 'target_guard'`,
    `WHEN (SELECT ex.decor FROM ex)${decorish ? " OR (SELECT fx.any_decor FROM fx)" : ""}
       THEN 'target_decor'`,
    `WHEN (SELECT ex.ship FROM ex) THEN 'target_ship'`,
    `WHEN (SELECT lo.market OR lo.town OR lo.warehouse OR lo.field OR lo.mine FROM lo)
       THEN 'target_leftovers'`,
  ];
  return `SELECT CASE
     ${lines.join("\n     ")}
     ELSE 'ok' END AS reason`;
}

/**
 * Подзапросы решения: lead/goal — ведущая клетка и её цель, drift — разошёлся
 * ли состав, src — старые клетки единицы (из них пишет перенос), ground — новые
 * клетки без земли, f/ex/fx — новые клетки «держит», ld — свои старые клетки,
 * куда встают постройка и декор, bd — мешочки под встающим декором, lo —
 * остатки снесённой постройки, chk —
 * причина, go — строка «можно». Без ведущего WITH и без хвостовой запятой.
 */
export function checkCtes(o: UnitAt): string {
  const m = o.mapId;
  const fresh = freshCells(o);
  const land = landingCells(o);
  const src = `SELECT c.q, c.r, c.building_id, c.building_skin_id, c.building_config,
                      c.decoration_id, c.group_id, c.icon_scale
                 FROM yuplink.raid_map_cells c
                WHERE c.map_id = ${sqlStr(m)} AND ${inCells("c", o.unit.cells)}`;
  const flags = ["building", "obj", "water", "dome", "chest", "guard"];
  const ld = land.length
    ? anyOf(
        land.map((c) => cellFlagsSql(m, c.q, c.r)),
        ["obj", "chest", "guard"],
      )
    : "SELECT NULL::boolean AS obj, NULL::boolean AS chest, NULL::boolean AS guard";
  return `lead AS (SELECT c.building_id, c.decoration_id FROM yuplink.raid_map_cells c
                 WHERE ${atCell("c", m, o.from)}),
     goal AS (SELECT c.building_id, c.decoration_id, c.group_id FROM yuplink.raid_map_cells c
                 WHERE ${atCell("c", m, o.to)}),
     drift AS (${driftSql(o)}),
     src AS (${src}),
     ground AS (${groundSql(o)}),
     f AS (${anyOf(
       fresh.map((c) => cellFlagsSql(m, c.q, c.r)),
       flags,
     )}),
     ex AS (${anyOf(
       fresh.map((c) => cellExtraSql(m, c.q, c.r)),
       ["decor", "ship"],
     )}),
     fx AS (${freshExtraSql(o)}),
     ld AS (${ld}),
     bd AS (${bagsUnderSql(o)}),
     lo AS (${leftoversSql(o)}),
     chk AS (${reasonSql(o)}),
     go AS (SELECT 1 AS ok FROM chk WHERE chk.reason = 'ok')`;
}
