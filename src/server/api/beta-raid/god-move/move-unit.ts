// Единица переноса здания и декора: одна клетка или весь блок (group_id).
//
// Блок — одна картинка на 2–10 клеток (здание и/или декор поверх всех), поэтому
// здание или декор в блоке едут ВСЕМ блоком: каждая клетка сдвигается на один
// и тот же вектор «ведущая клетка → цель», с формой, group_id и icon_scale.
// Вне блока едет только свой слой клетки: здание без декора, декор без здания.
//
// Состав единицы читается заранее (unitReadSql) — по нему строятся локи и
// проверки целевых клеток; сам перенос сверяет состав в том же операторе,
// что пишет (move-check-sql, `drift`): разошлось — «changed», ничего не тронуто.
import { sqlStr } from "@/server/api/raid-shared";
import { godMoveParts, type GodCell, type GodMoveKind, type GodMoveParts } from "@/lib/godMove";

export type UnitKind = Extract<GodMoveKind, "building" | "decor">;

/** Клетка единицы по снимку: есть ли постройка и декор (или его отрастание). */
export type UnitCell = GodCell & { building: boolean; decor: boolean };

/** Единица: блок (gid) или одна клетка; cells — старые клетки (r ↑, q ↑). */
export type MoveUnit = { gid: string | null; cells: UnitCell[] };

/** Перенос единицы: карта, ведущая клетка, цель, что везём и что видел админ. */
export type UnitAt = {
  mapId: string;
  from: GodCell;
  to: GodCell;
  kind: UnitKind;
  /** Постройка (без облика) или декор ведущей клетки, которые видел админ. */
  ref: string;
  unit: MoveUnit;
};

/** Что едет: блок — всё сразу; одна клетка — только её слой (godMoveParts). */
export function unitParts(o: Pick<UnitAt, "kind" | "unit">): GodMoveParts {
  return godMoveParts(o.kind, o.unit.gid !== null);
}

export const cellKey = (c: GodCell): string => `${c.q},${c.r}`;

/** Сдвиг клетки на вектор переноса. */
export const shifted = (o: Pick<UnitAt, "from" | "to">, c: GodCell): GodCell => ({
  q: c.q + o.to.q - o.from.q,
  r: c.r + o.to.r - o.from.r,
});

/** Новые клетки единицы — старые, сдвинутые на вектор. */
export const newCells = (o: UnitAt): GodCell[] => o.unit.cells.map((c) => shifted(o, c));

/** Новые клетки, которых в единице не было: только их и проверяем как цель. */
export function freshCells(o: UnitAt): GodCell[] {
  const old = new Set(o.unit.cells.map(cellKey));
  return newCells(o).filter((c) => !old.has(cellKey(c)));
}

/** Клетка единицы с переезжающей постройкой (одна на единицу) или null. */
export function buildingCell(o: UnitAt): GodCell | null {
  if (!unitParts(o).building) return null;
  const c = o.unit.cells.find((x) => x.building);
  return c ? { q: c.q, r: c.r } : null;
}

/** Клетка единицы с переезжающим декором или его отрастанием — или null. */
export function decorCell(o: UnitAt): GodCell | null {
  if (!unitParts(o).decor) return null;
  const c = o.unit.cells.find((x) => x.decor);
  return c ? { q: c.q, r: c.r } : null;
}

/**
 * В блоке больше одной постройки или больше одного декора (с отрастанием) —
 * переносить нельзя: картинка блока одна, а строки разных клеток при сдвиге
 * «сам на себя» наехали бы друг на друга по ключу клетки. Кисть и «Объединить»
 * такого не допускают; так может оставить только редактор карт.
 */
export function unitTooMany(u: MoveUnit): boolean {
  if (u.gid === null) return false;
  const b = u.cells.filter((c) => c.building).length;
  const d = u.cells.filter((c) => c.decor).length;
  return b > 1 || d > 1;
}

/** На клетке `c` декор — стоит или срублен и ждёт отрастания (§8.19). */
export const decorHereSql = (c: string): string =>
  `(${c}.decoration_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn rd
                 WHERE rd.map_id = ${c}.map_id AND rd.q = ${c}.q AND rd.r = ${c}.r))`;

/** Снимок единицы: клетки блока ведущей клетки, а вне блока — она одна. */
export function unitReadSql(mapId: string, from: GodCell): string {
  const m = sqlStr(mapId);
  return `SELECT c.q, c.r, c.group_id,
            c.building_id IS NOT NULL AS building,
            ${decorHereSql("c")} AS decor
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${m}
        AND ((c.q = ${from.q} AND c.r = ${from.r})
             OR c.group_id = (SELECT l.group_id FROM yuplink.raid_map_cells l
                               WHERE l.map_id = ${m} AND l.q = ${from.q} AND l.r = ${from.r}))
      ORDER BY c.r, c.q`;
}

type UnitRow = {
  q: number | string;
  r: number | string;
  group_id: string | null;
  building: boolean | null;
  decor: boolean | null;
};

/** Ответ снимка → единица. Ведущей клетки нет — null (на карте её нет). */
export function parseUnit(rows: unknown[] | null | undefined, from: GodCell): MoveUnit | null {
  const list = ((rows ?? []) as UnitRow[]).map((x) => ({
    q: Math.trunc(Number(x.q)),
    r: Math.trunc(Number(x.r)),
    gid: x.group_id ? String(x.group_id) : null,
    building: x.building === true,
    decor: x.decor === true,
  }));
  const lead = list.find((c) => c.q === from.q && c.r === from.r);
  if (!lead) return null;
  const pick = lead.gid ? list.filter((c) => c.gid === lead.gid) : [lead];
  return {
    gid: lead.gid,
    cells: pick.map(({ q, r, building, decor }) => ({ q, r, building, decor })),
  };
}
