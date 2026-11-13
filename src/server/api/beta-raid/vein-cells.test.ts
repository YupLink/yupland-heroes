// Жилы в снимке карты: разбор строк таблицы, тройки lists.veins в packCells,
// купол прячет жилу от игрока, но не от админа.
import { describe, expect, it } from "vitest";
import { veinCellsFrom, veinKey, veinLookup } from "./vein-cells";
import { packCells, type RawCell } from "./packCells";
import { sanitizeVoidCells } from "./voidSanitize";

const roadOf = (raw: string | null) => raw;

function cell(q: number, r: number, extra: Partial<RawCell> = {}): RawCell {
  return {
    q,
    r,
    terrain_id: "terrain_grass",
    road_id: null,
    object_id: null,
    decoration_id: null,
    building_id: null,
    ...extra,
  };
}

describe("veinCellsFrom", () => {
  it("вид → код, градусы → номер поворота", () => {
    const v = veinCellsFrom([
      { q: 3, r: -2, kind: "gold", rot: 0 },
      { q: "4", r: "5", kind: "diamonds", rot: "300" },
      { q: -1, r: 7, kind: "gold", rot: 120 },
    ]);
    expect(v.get(veinKey(3, -2))).toEqual([1, 0]);
    expect(v.get(veinKey(4, 5))).toEqual([2, 5]);
    expect(v.get(veinKey(-1, 7))).toEqual([1, 2]);
    expect(v.size).toBe(3);
  });

  it("чужой вид и поворот не по сетке 60° — пропуск", () => {
    const v = veinCellsFrom([
      { q: 0, r: 0, kind: "silver", rot: 0 },
      { q: 1, r: 0, kind: "constructor", rot: 0 },
      { q: 2, r: 0, kind: "gold", rot: 45 },
      { q: 3, r: 0, kind: "gold", rot: null },
    ]);
    expect(v.size).toBe(0);
  });

  it("ключ клетки различает соседей и отрицательные координаты", () => {
    const keys = new Set<number>();
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) keys.add(veinKey(q, r));
    expect(keys.size).toBe(49);
  });
});

describe("packCells: список жил", () => {
  const rows = [cell(0, 0), cell(1, 0), cell(2, 0, { road_id: "road_x" }), cell(0, 1)];
  const veins = veinCellsFrom([
    { q: 1, r: 0, kind: "gold", rot: 60 },
    { q: 0, r: 1, kind: "diamonds", rot: 240 },
    { q: 9, r: 9, kind: "gold", rot: 0 }, // клетки нет в карте — не уедет
  ]);

  it("тройки (индекс клетки, вид, поворот) в порядке клеток", () => {
    const p = packCells(
      rows,
      roadOf,
      () => false,
      undefined,
      undefined,
      undefined,
      veinLookup(veins, new Set()),
    );
    expect(p.veins).toEqual([1, 1, 1, 3, 2, 4]);
  });

  it("таблицы нет — поля нет (клиент не кладёт такой снимок в кэш)", () => {
    const p = packCells(
      rows,
      roadOf,
      () => false,
      undefined,
      undefined,
      undefined,
      veinLookup(null, new Set()),
    );
    expect("veins" in p).toBe(false);
  });

  it("жил нет — пустой список, но поле есть", () => {
    const p = packCells(
      rows,
      roadOf,
      () => false,
      undefined,
      undefined,
      undefined,
      veinLookup(new Map(), new Set()),
    );
    expect(p.veins).toEqual([]);
  });
});

describe("купол: жила игроку не уезжает", () => {
  const rows = [cell(0, 0), cell(1, 0, { void_fog: true }), cell(2, 0)];
  const veins = veinCellsFrom([
    { q: 1, r: 0, kind: "gold", rot: 0 },
    { q: 2, r: 0, kind: "diamonds", rot: 180 },
  ]);

  const pack = (seesVoid: boolean) => {
    const { cells, hiddenKeys } = sanitizeVoidCells(rows, seesVoid);
    return packCells(
      cells,
      roadOf,
      () => false,
      undefined,
      undefined,
      undefined,
      veinLookup(veins, hiddenKeys),
    );
  };

  it("игрок: жила под куполом вырезана, открытая — на месте", () => {
    expect(pack(false).veins).toEqual([2, 2, 3]);
  });

  it("админ видит купол целиком — и жилу под ним", () => {
    expect(pack(true).veins).toEqual([1, 1, 0, 2, 2, 3]);
  });
});
