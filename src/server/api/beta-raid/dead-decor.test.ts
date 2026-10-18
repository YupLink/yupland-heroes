// Мёртвый декор: id без шаблона в снимок игрока не уезжает; пустой словарь
// карту не трогает; порядок и число клеток неизменны (биты тумана по номерам).
import { describe, expect, it } from "vitest";
import { dropDeadDecor, dropDeadDecorSql } from "./dead-decor";
import type { RawCell } from "./packCells";

const cell = (q: number, decoration_id: string | null): RawCell => ({
  q,
  r: 0,
  terrain_id: "t",
  road_id: null,
  object_id: null,
  decoration_id,
  building_id: null,
});

describe("dead-decor.dropDeadDecor", () => {
  it("обнуляет только id, которых нет в словаре; порядок и число клеток те же", () => {
    const cells = [cell(1, "live"), cell(2, "dead"), cell(3, null)];
    const out = dropDeadDecor(cells, new Set(["live"]));
    expect(out.map((c) => [c.q, c.decoration_id])).toEqual([
      [1, "live"],
      [2, null],
      [3, null],
    ]);
    expect(cells[1].decoration_id).toBe("dead"); // исходник не мутируется
  });

  it("нечего чистить — возвращает тот же массив (кэш по ссылке цел)", () => {
    const cells = [cell(1, "live"), cell(2, null)];
    expect(dropDeadDecor(cells, new Set(["live"]))).toBe(cells);
  });

  it("пустой словарь — не трогает: иначе обнулился бы весь декор карты", () => {
    const cells = [cell(1, "x")];
    expect(dropDeadDecor(cells, new Set())).toBe(cells);
  });
});

describe("dead-decor.dropDeadDecorSql", () => {
  it("чистит только клетки этого сохранения и экранирует кавычки", () => {
    const sql = dropDeadDecorSql("rmap_a'b", "2026-09-21T00:00:00.000Z");
    expect(sql).toContain("c.map_id = 'rmap_a''b'");
    expect(sql).toContain("c.saved_at = '2026-09-21T00:00:00.000Z'");
    expect(sql).toContain("SET decoration_id = NULL");
    expect(sql).toContain("NOT EXISTS");
  });
});
