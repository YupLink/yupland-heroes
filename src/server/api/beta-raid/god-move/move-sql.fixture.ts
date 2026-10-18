// Общее для тестов переноса: запросы на эталонных клетках и разбор подзапросов.
// Базы нет — тесты читают текст операторов.
import { moveUnitSql } from "@/server/api/beta-raid/god-move/move-sql";
import type { MoveUnit, UnitAt } from "@/server/api/beta-raid/god-move/move-unit";

export const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** Одиночное здание: с (4, -2) на (7, 1) карты rmap_x. */
export const single: MoveUnit = {
  gid: null,
  cells: [{ q: 4, r: -2, building: true, decor: false }],
};

export const at: UnitAt = {
  mapId: "rmap_x",
  from: { q: 4, r: -2 },
  to: { q: 7, r: 1 },
  kind: "building",
  ref: "bld_1",
  unit: single,
};

/**
 * Блок g_1 из трёх клеток в ряд: (0,0) с постройкой — ведущая, (1,0) с декором,
 * (2,0) пустая. Сдвиг на одну клетку вправо — «сам на себя»: (1,0) и (2,0)
 * остаются клетками блока, новая — только (3,0).
 */
export const block: MoveUnit = {
  gid: "g_1",
  cells: [
    { q: 0, r: 0, building: true, decor: false },
    { q: 1, r: 0, building: false, decor: true },
    { q: 2, r: 0, building: false, decor: false },
  ],
};

export const blockAt: UnitAt = {
  mapId: "rmap_x",
  from: { q: 0, r: 0 },
  to: { q: 1, r: 0 },
  kind: "building",
  ref: "bld_1",
  unit: block,
};

/** Одиночный декор: с (4, -2) на (7, 1). */
export const decorAt: UnitAt = {
  ...at,
  kind: "decor",
  ref: "dec_oak",
  unit: { gid: null, cells: [{ q: 4, r: -2, building: false, decor: true }] },
};

export const sql = flat(moveUnitSql(at));

/** «Строка на прежней клетке» / «на целевой» для алиаса a. */
export const SRC = (a: string) => `${a}.map_id = 'rmap_x' AND ${a}.q = 4 AND ${a}.r = -2`;
export const DST = (a: string) => `${a}.map_id = 'rmap_x' AND ${a}.q = 7 AND ${a}.r = 1`;

/** Любая запись в таблицу: имя таблицы — первая группа. */
export const WRITE_RE = /\b(?:UPDATE|DELETE FROM|INSERT INTO) yuplink\.(\w+)/g;

/** Тело подзапроса WITH по имени: скобки считаем, строки в кавычках пропускаем. */
export function cteOf(text: string, name: string): string {
  const start = text.indexOf(` ${name} AS (`);
  if (start < 0) throw new Error(`нет подзапроса ${name}`);
  let i = text.indexOf("(", start);
  const from = i;
  let depth = 0;
  let quoted = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") quoted = !quoted;
    else if (!quoted && ch === "(") depth++;
    else if (!quoted && ch === ")" && --depth === 0) break;
  }
  return text.slice(from + 1, i).trim();
}

/** Подзапрос эталонного одиночного переноса здания. */
export const cte = (name: string): string => cteOf(sql, name);

/** Все записи запроса: таблицы. */
export const writtenTables = (text: string): Set<string> =>
  new Set([...text.matchAll(WRITE_RE)].map((m) => m[1]));
