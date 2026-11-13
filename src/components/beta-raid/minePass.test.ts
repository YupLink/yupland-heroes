// Шахта — стена на клиенте (§8.59 п. 9): список шахт снимка → клетка → поиск
// пути, кружки шагов. Обход вокруг шахты есть, в саму шахту маршрута нет, а
// стоящий на шахте с неё сходит.
import { describe, expect, it } from "vitest";
import { MapStore } from "./mapStore";
import { unpackCells, type PackedCells } from "./unpackMap";
import { walkable } from "./hexPassable";
import { findWalkablePath } from "./usePathfinding";
import { computeAvailableMoves } from "./useAvailableMoves";
import { gridOrigin } from "./hexGeometry";
import type { TerrainInfo } from "./hexStepCost";

const terrains: Record<string, TerrainInfo> = {
  grass: { id: "grass", name: "Трава", imageUrl: null, cost: 1 },
};

/** Два ряда по пять клеток травы; на (2,0) — шахта. */
function twoRows(): PackedCells {
  const q: number[] = [];
  const r: number[] = [];
  for (let rr = 0; rr < 2; rr++)
    for (let qq = 0; qq < 5; qq++) {
      q.push(qq);
      r.push(rr);
    }
  const none = q.map(() => -1);
  const bld = [...none];
  bld[2] = 0;
  return {
    terrainIds: ["grass"],
    roadIds: [],
    objectIds: [],
    decorationIds: [],
    buildingIds: ["building_mill"],
    q,
    r,
    t: q.map(() => 0),
    road: none,
    obj: none,
    dec: none,
    bld,
    defeated: [],
    runners: [],
    voidFog: [],
    mines: [2],
  };
}

const storeCells = () => {
  const { centerQ, c0q } = gridOrigin(5);
  return new MapStore(twoRows(), centerQ, c0q, false).cells;
};
const keysOf = (steps: Array<{ q: number; r: number }> | null) =>
  steps?.map((s) => `${s.q},${s.r}`) ?? null;

describe("клетка знает про шахту", () => {
  it("unpackCells и MapStore ставят mine только на клетку из списка", () => {
    const cells = unpackCells(twoRows());
    expect(cells["2,0"].mine).toBe(true);
    expect(cells["1,0"].mine).toBeUndefined();
    const store = storeCells();
    expect(store["2,0"].mine).toBe(true);
    expect(store["3,0"].mine).toBeUndefined();
  });

  it("старый кэш без списка — шахт нет, а не ошибка", () => {
    const old = twoRows();
    delete old.mines;
    expect(unpackCells(old)["2,0"].mine).toBeUndefined();
  });

  it("MapStore.cellInto сбрасывает отметку на переиспользуемом объекте", () => {
    const { centerQ, c0q } = gridOrigin(5);
    const s = new MapStore(twoRows(), centerQ, c0q, false);
    const scratch = {};
    expect(s.cellInto(2, scratch).mine).toBe(true);
    expect(s.cellInto(1, scratch).mine).toBeUndefined();
  });

  it("walkable: шахта — стена", () => {
    expect(walkable({ terrainId: "grass" })).toBe(true);
    expect(walkable({ terrainId: "grass", mine: true })).toBe(false);
  });
});

describe("маршрут и кружки обходят шахту", () => {
  it("путь вдоль ряда идёт в обход шахты", () => {
    const path = keysOf(findWalkablePath(0, 0, 4, 0, storeCells(), terrains));
    expect(path).not.toBeNull();
    expect(path).not.toContain("2,0");
    expect(path?.at(-1)).toBe("4,0");
  });

  it("в саму шахту маршрута нет", () => {
    expect(findWalkablePath(0, 0, 2, 0, storeCells(), terrains)).toBeNull();
  });

  it("стоящий на шахте сходит с неё", () => {
    const path = keysOf(findWalkablePath(2, 0, 4, 0, storeCells(), terrains));
    expect(path).toEqual(["3,0", "4,0"]);
  });

  it("кружки шагов: соседняя шахта без кружка, с шахты — все соседи", () => {
    const cells = storeCells();
    const near = computeAvailableMoves({ q: 1, r: 0 }, cells, terrains).map((m) => `${m.q},${m.r}`);
    expect(near).not.toContain("2,0");
    expect(near).toContain("0,0");
    const fromMine = computeAvailableMoves({ q: 2, r: 0 }, cells, terrains).map(
      (m) => `${m.q},${m.r}`,
    );
    expect(fromMine.sort()).toEqual(["1,0", "1,1", "2,1", "3,0"]);
  });
});
