// Шахта не перекрывает проход: соседи цели должны сообщаться в обход неё.
import { describe, expect, it } from "vitest";
import { mineCellSql } from "@/server/api/beta-raid/mine-cell-sql";
import { blocksPath, chokeCellsSql, chokeMinesKeySql } from "./mine-place-choke";

const set = (cells: Array<[number, number]>) => new Set(cells.map(([q, r]) => `${q},${r}`));

describe("перекроет ли шахта проход", () => {
  it("коридор шириной в клетку: шахта в середине его режет", () => {
    // (0,0) — цель; слева (-1,0) и справа (1,0) — единственный путь через цель
    const walk = set([
      [-2, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(blocksPath(walk, 0, 0)).toBe(true);
  });

  it("открытое поле: соседи связаны вокруг — ставить можно", () => {
    const walk = new Set<string>();
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) walk.add(`${q},${r}`);
    expect(blocksPath(walk, 0, 0)).toBe(false);
  });

  it("тупик в одну клетку за целью — отрезает, отказ", () => {
    // проход (-2,0)→(-1,0)→цель(0,0)→(1,0) тупик
    const walk = set([
      [-2, 0],
      [-1, 0],
      [0, 0],
      [1, 0],
    ]);
    expect(blocksPath(walk, 0, 0)).toBe(true);
  });

  it("у цели один проходимый сосед — ничего не режет", () => {
    expect(
      blocksPath(
        set([
          [-1, 0],
          [0, 0],
        ]),
        0,
        0,
      ),
    ).toBe(false);
  });

  it("запрос клеток — шахты, стены-декор и будущий декор не проход; босс и объект — проход", () => {
    const sql = chokeCellsSql("rmap_x", 5, -3);
    expect(sql).toContain("NOT COALESCE(c.void_fog, false)");
    expect(sql).toContain(`AND NOT ${mineCellSql("c")}`);
    // босс и объект стеной не считаются (владелец 20.10)
    expect(sql).not.toContain("object_id");
    // срубленное дерево вырастет — клетка уже стена
    expect(sql).toMatch(/raid_decor_respawn d[\s\S]*d\.placed_at IS NULL/);
    // радиус 8 — рамкой по индексу клетки и гекс-условием
    expect(sql).toContain("c.q BETWEEN -3 AND 13 AND c.r BETWEEN -11 AND 5");
    expect(sql).toContain("abs((c.q + c.r) - (2)) <= 8");
  });

  it("отпечаток шахт в радиусе — для сверки под локом", () => {
    const sql = chokeMinesKeySql("rmap_x", 5, -3);
    expect(sql).toContain(
      "md5(COALESCE(string_agg(c.q || ',' || c.r, ';' ORDER BY c.q, c.r), ''))",
    );
    expect(sql).toContain(mineCellSql("c"));
    expect(sql).toContain("abs((c.q + c.r) - (2)) <= 8");
  });
});
