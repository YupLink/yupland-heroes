// Перенос здания, блока или декора: клетки карты и отрастание декора.
//
// Клетки — одним UPDATE всех затронутых (старые ∪ новые): каждая новая берёт
// переезжающие слои у своей старой (клетка − вектор), освободившаяся — пустые.
// Строки клеток при этом не двигаются (ключ клетки — местность, дорога, объект
// и купол на месте), поэтому сдвиг «сам на себя» не упирается в ключ. Что едет
// (unitParts): постройка с обликом и конфигом, декор, блок с масштабом.
//
// Отрастание декора (raid_decor_respawn, §8.19) — по клетке, со снимком клетки
// на момент рубки: сборщик снимает возврат, если клетку с тех пор поменяли. Едет
// декор — его строка едет на новую клетку, и снимок ставится тот, какой будет
// клетка после переноса (иначе сборщик принял бы перенос за правку и снял
// возврат). Едет только постройка — строка остаётся, а в снимке клетка уже без
// постройки: срубленный декор под ушедшим домом отрастёт как отрос бы. Возврат,
// который сборщик уже снял бы (клетку правили после рубки), перенос не оживляет:
// он снимается сразу.
import { sqlStr } from "@/server/api/raid-shared";
import {
  cellKey,
  decorCell,
  shifted,
  unitParts,
  type UnitAt,
} from "@/server/api/beta-raid/god-move/move-unit";
import { atCell } from "@/server/api/beta-raid/god-move/move-where";
import type { GodCell } from "@/lib/godMove";

/**
 * Затронутые клетки и откуда каждая берёт слои: новая — у своей старой
 * (клетка − вектор), освободившаяся старая — null (слои снимаются).
 */
export function cellMap(o: UnitAt): Array<{ at: GodCell; from: GodCell | null }> {
  const out = new Map<string, { at: GodCell; from: GodCell | null }>();
  for (const c of o.unit.cells) {
    const n = shifted(o, c);
    out.set(cellKey(n), { at: n, from: { q: c.q, r: c.r } });
  }
  for (const c of o.unit.cells) {
    if (!out.has(cellKey(c))) out.set(cellKey(c), { at: { q: c.q, r: c.r }, from: null });
  }
  return [...out.values()];
}

/** Колонки, которые едут, — по частям единицы. */
function sets(o: UnitAt): string[] {
  const p = unitParts(o);
  return [
    ...(p.building
      ? [
          "building_id = s.building_id",
          "building_skin_id = s.building_skin_id",
          "building_config = s.building_config",
        ]
      : []),
    ...(p.decor ? ["decoration_id = s.decoration_id"] : []),
    ...(p.group ? ["group_id = s.group_id", "icon_scale = s.icon_scale"] : []),
  ];
}

/** Клетки карты: все затронутые одним UPDATE; RETURNING — как стали. */
export function unitCellsSql(o: UnitAt): string {
  const rows = cellMap(o)
    .map(({ at, from }) =>
      from
        ? `(${at.q}, ${at.r}, ${from.q}, ${from.r})`
        : `(${at.q}, ${at.r}, NULL::int, NULL::int)`,
    )
    .join(", ");
  return `cells AS (
       UPDATE yuplink.raid_map_cells c
          SET ${sets(o).join(", ")}, saved_at = now()
         FROM (VALUES ${rows}) AS m(q, r, sq, sr)
              LEFT JOIN src s ON s.q = m.sq AND s.r = m.sr
              CROSS JOIN go
        WHERE c.map_id = ${sqlStr(o.mapId)} AND c.q = m.q AND c.r = m.r
       RETURNING c.q, c.r, c.building_id, c.building_skin_id, c.decoration_id,
                 c.group_id, c.icon_scale
     )`;
}

/**
 * Возврат уже снят бы сборщиком: клетку поменяли после рубки (то же правило,
 * что CHANGED у decor-respawn-sql; `d` — строка возврата, `c` — клетка сейчас).
 * Такой перенос не оживляет: строка снимается, как снял бы её сборщик.
 */
const staleSql = (d: string, c: string): string =>
  `(${c}.terrain_id IS NULL OR ${c}.decoration_id IS NOT NULL
         OR ${c}.terrain_id IS DISTINCT FROM ${d}.terrain_id
         OR ${c}.road_id IS DISTINCT FROM ${d}.road_id
         OR ${c}.building_id IS DISTINCT FROM ${d}.building_id
         OR ${c}.group_id IS DISTINCT FROM ${d}.group_id
         OR (${c}.object_id IS NOT NULL AND ${c}.object_id IS DISTINCT FROM ${d}.object_id))`;

/**
 * На клетке до переноса стоит посаженное игроком дерево (decor-05): ожидание под
 * ним — декор карты, срубленный до посадки. Едет посаженное — ожидание остаётся
 * на клетке и будится (таймер «Респавн, мин» — с переноса), а не снимается.
 */
const plantedOn = (m: string, c: GodCell): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_cells pc
            WHERE ${atCell("pc", m, c)} AND pc.decoration_id IS NOT NULL
              AND pc.planted_decor = pc.decoration_id)`;

/**
 * Отрастание — только ждущие строки (placed_at IS NULL; вставшие разошлёт и
 * снимет сборщик). Едет декор — живая строка его клетки едет на новую (снимок —
 * клетка после переноса; своя строка цели заменяется: декор туда встаёт, и её
 * возврат снялся бы и так), снятая бы — снимается. Едет только постройка —
 * живая строка ведущей клетки остаётся, а снимок теряет постройку; снятая бы —
 * снимается (иначе уход дома «оживил» бы её).
 */
export function regrowCtes(o: UnitAt): string[] {
  const p = unitParts(o);
  const m = o.mapId;
  const pending = "d.placed_at IS NULL";
  if (!p.decor) {
    const here = `${atCell("d", m, o.from)} AND ${pending} AND ${atCell("sc", m, o.from)}`;
    return [
      `regrow_keep AS (
       UPDATE yuplink.raid_decor_respawn d SET building_id = NULL
         FROM go, yuplink.raid_map_cells sc
        WHERE ${here} AND NOT ${staleSql("d", "sc")}
       RETURNING 1
     )`,
      `regrow_drop AS (
       DELETE FROM yuplink.raid_decor_respawn d USING go, yuplink.raid_map_cells sc
        WHERE ${here} AND ${staleSql("d", "sc")}
       RETURNING 1
     )`,
    ];
  }
  const c = decorCell(o);
  if (!c) return [];
  const t = shifted(o, c);
  const bld = p.building ? "s.building_id" : "t.building_id";
  const grp = p.group ? "s.group_id" : "t.group_id";
  return [
    `regrow_put AS (
       INSERT INTO yuplink.raid_decor_respawn AS x
              (map_id, q, r, decor_id, due_at, terrain_id, road_id, building_id,
               object_id, group_id, placed_at, created_at)
       SELECT d.map_id, ${t.q}, ${t.r}, d.decor_id, d.due_at, t.terrain_id, t.road_id,
              ${bld}, t.object_id, ${grp}, NULL, d.created_at
         FROM yuplink.raid_decor_respawn d
         JOIN yuplink.raid_map_cells sc ON ${atCell("sc", m, c)}
         JOIN yuplink.raid_map_cells t ON ${atCell("t", m, t)}
         LEFT JOIN src s ON s.q = ${c.q} AND s.r = ${c.r}
         CROSS JOIN go
        WHERE ${atCell("d", m, c)} AND ${pending} AND NOT ${staleSql("d", "sc")}
       ON CONFLICT (map_id, q, r) DO UPDATE
          SET decor_id = EXCLUDED.decor_id, due_at = EXCLUDED.due_at,
              terrain_id = EXCLUDED.terrain_id, road_id = EXCLUDED.road_id,
              building_id = EXCLUDED.building_id, object_id = EXCLUDED.object_id,
              group_id = EXCLUDED.group_id, placed_at = NULL,
              created_at = EXCLUDED.created_at
       RETURNING 1
     )`,
    `regrow_del AS (
       DELETE FROM yuplink.raid_decor_respawn d USING go
        WHERE ${atCell("d", m, c)} AND ${pending} AND NOT ${plantedOn(m, c)}
       RETURNING 1
     )`,
    `regrow_wake AS (
       UPDATE yuplink.raid_decor_respawn d SET due_at = now() FROM go
        WHERE ${atCell("d", m, c)} AND ${pending} AND d.held_at IS NOT NULL AND ${plantedOn(m, c)}
       RETURNING 1
     )`,
  ];
}

/** Имена подзапросов записи клеток — для ответа (сколько строк переехало). */
export function cellWriteNames(o: UnitAt): string[] {
  const p = unitParts(o);
  if (!p.decor) return ["cells", "regrow_keep", "regrow_drop"];
  return decorCell(o) ? ["cells", "regrow_put", "regrow_del", "regrow_wake"] : ["cells"];
}
