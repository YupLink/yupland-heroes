import { describe, expect, it } from "vitest";
import { findWalkablePath } from "./usePathfinding";
import { pathGrid } from "./pathGrid";
import { pathCosts } from "./pathCosts";
import type { CellInfo, TerrainInfo } from "./hexStepCost";

const terrains: Record<string, TerrainInfo> = {
  land: { id: "land", name: "Трава", imageUrl: null, cost: 1 },
  water: { id: "water", name: "Вода", imageUrl: null, cost: 1 },
};
const decorations = { deck: { bridge: { deckAxis: 1, channelAxis: 0 } } };
const bridge: CellInfo = { terrainId: "water", decorationId: "deck" };

const path = (
  cells: Record<string, CellInfo>,
  from: [number, number],
  to: [number, number],
  onShip = false,
) => findWalkablePath(
  from[0], from[1], to[0], to[1], cells, terrains,
  undefined, onShip, undefined, 0, 0, undefined, false, 1, false, decorations,
);

describe("bridge routes", () => {
  it("walks onto the deck and leaves on the opposite bank", () => {
    const cells = {
      "0,-1": { terrainId: "land" },
      "0,0": bridge,
      "0,1": { terrainId: "land" },
    };
    expect(path(cells, [0, -1], [0, 1])?.map(({ q, r }) => [q, r])).toEqual([[0, 0], [0, 1]]);
  });

  it("does not let a walker enter from the shipping channel", () => {
    const cells = {
      "-1,0": { terrainId: "land" },
      "0,0": bridge,
      "1,0": { terrainId: "land" },
    };
    expect(path(cells, [-1, 0], [1, 0])).toBeNull();
  });

  it("sails under a bridge without a stopping point beneath it", () => {
    const cells = {
      "-1,0": { terrainId: "water" },
      "0,0": bridge,
      "1,0": { terrainId: "water" },
    };
    const route = path(cells, [-1, 0], [1, 0], true);
    expect(route?.map(({ q, r }) => [q, r])).toEqual([[1, 0]]);
    expect(route?.[0].cost).toBe(6);
    expect(path(cells, [-1, 0], [0, 0], true)).toBeNull();
  });

  it("keeps the route estimate below a cheap pedestrian bridge", () => {
    const cells = {
      "0,-1": { terrainId: "land" },
      "0,0": bridge,
      "0,1": { terrainId: "land" },
    };
    const cheap = { ...terrains, water: { ...terrains.water, cost: 0.1 } };
    const grid = pathGrid(cells, cheap, undefined, decorations);
    const prices = pathCosts(grid, 0, 0);
    const estimate = prices.rest(0, -1, prices.goalBound(0, 1));
    const actual = prices.land[grid.slot(0, 0)] + prices.land[grid.slot(0, 1)];
    expect(estimate).toBeLessThanOrEqual(actual);
  });
});
