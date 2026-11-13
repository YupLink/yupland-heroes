// Сетка пути по колонкам снимка совпадает с прежней (через объект клетки)
// клетка в клетку: проходимость, вода, океан, цена, нижняя граница.
import { describe, expect, it } from "vitest";
import { MapStore } from "./mapStore";
import { gridOrigin } from "./hexGeometry";
import { pathGrid } from "./pathGrid";
import type { PackedCells } from "./unpackMap";
import type { CellInfo, TerrainInfo } from "./hexStepCost";

function synth(size: number): PackedCells {
  const q: number[] = [];
  const r: number[] = [];
  const t: number[] = [];
  const road: number[] = [];
  const obj: number[] = [];
  const dec: number[] = [];
  const bld: number[] = [];
  let k = 0;
  for (let rr = 0; rr < size; rr++)
    for (let qq = 0; qq < size; qq++) {
      if ((qq * 7 + rr * 3) % 23 === 0) continue; // дыры в карте
      q.push(qq);
      r.push(rr);
      t.push(k % 11 === 0 ? -1 : k % 5);
      road.push(k % 9 === 0 ? k % 3 : -1);
      obj.push(k % 6 === 0 ? k % 2 : -1);
      dec.push(k % 13 === 0 ? 0 : k % 17 === 0 ? 1 : -1);
      bld.push(-1);
      k++;
    }
  const n = q.length;
  const pick = (m: number) => Array.from({ length: n }, (_, i) => i).filter((i) => i % m === 0);
  return {
    terrainIds: ["grass", "water", "ocean", "swamp", ""],
    roadIds: ["dirt", "", "stone"],
    objectIds: ["wolf", ""],
    decorationIds: ["fir", ""],
    buildingIds: [],
    q,
    r,
    t,
    road,
    obj,
    dec,
    bld,
    defeated: pick(12),
    runners: pick(18),
    voidFog: pick(29),
    mines: pick(31),
  } as PackedCells;
}

const terrains: Record<string, TerrainInfo> = {
  grass: { name: "Трава", cost: 2 },
  water: { name: "Вода", cost: 5 },
  ocean: { name: "Океан", cost: 7 },
  swamp: { name: "Болото", cost: 10 },
} as unknown as Record<string, TerrainInfo>;
const roads = {
  dirt: { name: "Тропа", cost: 1 },
  stone: { name: "Камень", cost: 0 },
} as unknown as Record<string, TerrainInfo>;

describe("pathGrid by columns", () => {
  it("matches the cell-object path cell by cell", () => {
    const { centerQ, c0q } = gridOrigin(60);
    for (const bypass of [false, true]) {
      const store = new MapStore(synth(60), centerQ, c0q, bypass);
      const plain: Record<string, CellInfo> = {};
      for (let i = 0; i < store.n; i++) plain[store.key(i)] = store.cellAt(i);
      const fast = pathGrid(store.cells, terrains, roads);
      const slow = pathGrid(plain, terrains, roads);
      expect(fast.cols).toBe(slow.cols);
      expect(fast.rows).toBe(slow.rows);
      expect(fast.minQ).toBe(slow.minQ);
      expect(fast.minR).toBe(slow.minR);
      expect(fast.minBase).toBe(slow.minBase);
      expect(Array.from(fast.walk)).toEqual(Array.from(slow.walk));
      expect(Array.from(fast.water)).toEqual(Array.from(slow.water));
      expect(Array.from(fast.ocean)).toEqual(Array.from(slow.ocean));
      expect(Array.from(fast.base)).toEqual(Array.from(slow.base));
      expect(fast.slot(10, 12)).toBe(slow.slot(10, 12));
      expect(fast.q(fast.slot(10, 12))).toBe(10);
      expect(fast.walk.some((v) => v === 1) && fast.walk.some((v) => v === 0)).toBe(true);
    }
  });
  it("is several times faster on a world-sized map", () => {
    const { centerQ, c0q } = gridOrigin(290);
    const store = new MapStore(synth(290), centerQ, c0q, false);
    const plain: Record<string, CellInfo> = {};
    for (let i = 0; i < store.n; i++) plain[store.key(i)] = store.cellAt(i);
    const time = (cells: Record<string, CellInfo>) => {
      let best = Infinity;
      for (let k = 0; k < 5; k++) {
        // Новый объект клеток — мимо кэша сетки (как новое событие карты).
        const fresh =
          cells === store.cells
            ? new MapStore(store.packed, centerQ, c0q, false).cells
            : { ...cells };
        const t0 = performance.now();
        pathGrid(fresh, terrains, roads);
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    const fast = time(store.cells);
    // Прежний путь шёл через cellInto — меряем его же на объекте-снимке.
    console.log(`pathGrid ${store.n} cells: columns ${fast.toFixed(1)} ms`);
    expect(fast).toBeLessThan(50);
  });
});
