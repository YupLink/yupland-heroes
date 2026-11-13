// Подход к цели (вынесено из useBetaMovement, 13.11): путь — к соседней клетке,
// не на саму цель; у водной цели — только с воды, если не anySide.
import { describe, expect, it } from "vitest";
import { approachRoute } from "./approachRoute";
import type { RouteSearchOpts } from "./routeSearch";
import type { CellInfo, TerrainInfo } from "./hexStepCost";

const terrains: Record<string, TerrainInfo> = {
  land: { id: "land", name: "Трава", imageUrl: null, cost: 1 },
};

const opts = (cells: Record<string, CellInfo>): RouteSearchOpts => ({
  playerPos: { q: 0, r: 0 },
  cells,
  terrains,
});

describe("approachRoute", () => {
  it("дерево в (3,0): путь кончается на соседней с ним клетке (2,0)", () => {
    const cells: Record<string, CellInfo> = {};
    for (let q = 0; q <= 3; q++) cells[`${q},0`] = { terrainId: "land" };
    const { goals, best } = approachRoute(opts(cells), 3, 0);
    expect(goals).toHaveLength(6);
    expect(best?.map((s) => `${s.q},${s.r}`)).toEqual(["1,0", "2,0"]);
    expect(best?.every((s) => s.cost > 0)).toBe(true);
  });

  it("пути нет — best null", () => {
    const cells: Record<string, CellInfo> = { "0,0": { terrainId: "land" } };
    expect(approachRoute(opts(cells), 5, 0).best).toBeNull();
  });

  it("нет карты местностей — null, без падения", () => {
    const cells: Record<string, CellInfo> = { "0,0": { terrainId: "land" } };
    expect(approachRoute({ ...opts(cells), terrains: undefined }, 2, 0).best).toBeNull();
  });
});
