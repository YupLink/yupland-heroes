// Порядок шахт в «Управлении шахтами»: после починки шахта не уезжает в конец
// группы, смена сортировки пересчитывает, новые — в конец, отнятые пропадают.
import { describe, expect, it } from "vitest";
import type { OfficeMine } from "@/server/api/mine-office/mine-office-list";
import { nextMineOrder } from "./useStableMineOrder";

const mine = (q: number, breakAt: number, level = 1): OfficeMine =>
  ({ mapId: "m", q, r: 0, level, view: { breakAt } }) as unknown as OfficeMine;

describe("nextMineOrder", () => {
  it("первый раз — по сроку поломки", () => {
    expect(nextMineOrder(null, [mine(1, 30), mine(2, 10), mine(3, 20)], "soon", 0)).toEqual([
      "m:2,0",
      "m:3,0",
      "m:1,0",
    ]);
  });

  it("починили первую — она остаётся первой", () => {
    const prev = { sort: "soon", keys: ["m:2,0", "m:3,0", "m:1,0"] };
    const after = [mine(1, 30), mine(2, 999), mine(3, 20)];
    expect(nextMineOrder(prev, after, "soon", 0)).toEqual(["m:2,0", "m:3,0", "m:1,0"]);
  });

  it("смена сортировки — заново", () => {
    const prev = { sort: "soon", keys: ["m:2,0", "m:3,0", "m:1,0"] };
    const list = [mine(1, 30, 3), mine(2, 10, 1), mine(3, 20, 2)];
    expect(nextMineOrder(prev, list, "level", 0)).toEqual(["m:1,0", "m:3,0", "m:2,0"]);
  });

  it("новая — в конец, отнятая — пропадает", () => {
    const prev = { sort: "soon", keys: ["m:2,0", "m:3,0", "m:1,0"] };
    const list = [mine(1, 30), mine(2, 10), mine(4, 5)];
    expect(nextMineOrder(prev, list, "soon", 0)).toEqual(["m:2,0", "m:1,0", "m:4,0"]);
  });
});
