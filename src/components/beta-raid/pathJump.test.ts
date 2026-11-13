// Пегас в поиске маршрута (§8.84): прыжок через клетку за 10 энергии + клетка — через дыру и
// преграду; на воду не прыгает; если обход дешевле прыжка — идёт в обход.
import { describe, expect, it } from "vitest";
import { findWalkablePath } from "./usePathfinding";
import type { CellInfo, TerrainInfo } from "./hexStepCost";
import { JUMP_ENERGY } from "@/lib/hero/mount";

const terrains: Record<string, TerrainInfo> = {
  land: { id: "land", name: "Трава", imageUrl: null, cost: 1 },
  water: { id: "water", name: "Вода", imageUrl: null, cost: 1 },
};
const run = (cells: Record<string, CellInfo>, toQ: number, toR: number, jump: boolean) =>
  findWalkablePath(
    0,
    0,
    toQ,
    toR,
    cells,
    terrains,
    undefined,
    false,
    undefined,
    0,
    0,
    undefined,
    false,
    1,
    jump,
  );

describe("прыжок пегаса в маршруте", () => {
  it("через дыру — прыжок одним шагом за 10 + клетку; без пегаса пути нет", () => {
    const cells = { "0,0": { terrainId: "land" }, "2,0": { terrainId: "land" } };
    expect(run(cells, 2, 0, false)).toBeNull();
    expect(run(cells, 2, 0, true)).toEqual([{ q: 2, r: 0, cost: JUMP_ENERGY + 1 }]);
  });

  it("на воду не прыгает", () => {
    const cells = { "0,0": { terrainId: "land" }, "2,0": { terrainId: "water" } };
    expect(run(cells, 2, 0, true)).toBeNull();
  });

  it("обход дешевле прыжка — идёт в обход; дорогой обход — прыгает", () => {
    // Дыра в (1,0); обход сверху (1,-1) → (2,-1)? нет: соседи (0,0) и (2,0) — (1,-1) и (2,-1).
    const cheap = {
      "0,0": { terrainId: "land" },
      "1,-1": { terrainId: "land" },
      "2,-1": { terrainId: "land" },
      "2,0": { terrainId: "land" },
    };
    const around = run(cheap, 2, 0, true)!;
    expect(around.map((s) => `${s.q},${s.r}`)).toEqual(["1,-1", "2,-1", "2,0"]);
    const pricey: Record<string, TerrainInfo> = {
      ...terrains,
      mud: { id: "mud", name: "Болото", imageUrl: null, cost: 6 },
    };
    const muddy = { ...cheap, "1,-1": { terrainId: "mud" }, "2,-1": { terrainId: "mud" } };
    const jumped = findWalkablePath(
      0,
      0,
      2,
      0,
      muddy,
      pricey,
      undefined,
      false,
      undefined,
      0,
      0,
      undefined,
      false,
      1,
      true,
    );
    expect(jumped).toEqual([{ q: 2, r: 0, cost: JUMP_ENERGY + 1 }]);
  });
});
