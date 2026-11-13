// Лестница (§8.121): куда перелезть — через одну клетку над непроходимым на свободную сушу.
import { describe, expect, it } from "vitest";
import { ladderTargets } from "./ladderTargets";
import type { Cell } from "../unpackMap";

const terrains = {
  g: { id: "g", name: "Трава", imageUrl: null, cost: 1 },
  w: { id: "w", name: "Вода", imageUrl: null, cost: 1 },
};
const cell = (over: Partial<Cell> = {}): Cell => ({ q: 0, r: 0, terrainId: "g", ...over }) as Cell;
const at = (q: number, r: number, c: Cell) => ({ [`${q},${r}`]: { ...c, q, r } });

describe("ladderTargets", () => {
  it("через воду и через преграду — да, на свободную сушу", () => {
    const cells = {
      ...at(1, 0, cell({ terrainId: "w" })),
      ...at(2, 0, cell()),
      ...at(0, 1, cell({ decorationId: "d" })),
      ...at(0, 2, cell()),
    };
    expect(ladderTargets({ q: 0, r: 0 }, cells, terrains)).toEqual([
      { q: 2, r: 0 },
      { q: 0, r: 2 },
    ]);
  });
  it("через проходимое, моба, постройку и шахту — нет", () => {
    const cells = {
      ...at(1, 0, cell()),
      ...at(2, 0, cell()),
      ...at(0, 1, cell({ objectId: "boss:x" })),
      ...at(0, 2, cell()),
      ...at(-1, 1, cell({ buildingId: "b" })),
      ...at(-2, 2, cell()),
      ...at(-1, 0, cell({ mine: true, decorationId: "d" })),
      ...at(-2, 0, cell()),
    };
    expect(ladderTargets({ q: 0, r: 0 }, cells, terrains)).toEqual([]);
  });
  it("на воду, моба, постройку, декор и купол не ставит", () => {
    const wall = cell({ decorationId: "d" });
    const cells = {
      ...at(1, 0, wall),
      ...at(2, 0, cell({ terrainId: "w" })),
      ...at(0, 1, wall),
      ...at(0, 2, cell({ objectId: "chest:x" })),
      ...at(-1, 1, wall),
      ...at(-2, 2, cell({ buildingId: "b" })),
      ...at(-1, 0, wall),
      ...at(-2, 0, cell({ decorationId: "d2" })),
      ...at(0, -1, wall),
      ...at(0, -2, cell({ voidFog: true })),
      ...at(1, -1, wall),
      ...at(2, -2, cell({ objectId: "boss:x", objectDefeated: true })),
    };
    expect(ladderTargets({ q: 0, r: 0 }, cells, terrains)).toEqual([{ q: 2, r: -2 }]);
  });
  it("без позиции — пусто", () => {
    expect(ladderTargets(null, {}, terrains)).toEqual([]);
  });
});
