// Верфь урока «лодка» (проходка 11.11.2026): ближайшая ПЕШКОМ и с выходом к цели переправы.
import { describe, expect, it } from "vitest";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import { pickShortYard } from "./shortYard";

const W = { shallow: "sea", ocean: "ocean" };
const cell = (q: number, r: number, over: Partial<WorldCell> = {}) =>
  ({ q, r, terrainId: "grass", decorationId: null, objectId: null, buildingId: null, buildingConfig: null, ...over }) as WorldCell;
/** Полоса суши r=0 (q 0..9) и море r=1 вдоль неё; верфи на (2,0) и (8,0). */
function strip(block: (q: number) => boolean): WorldCell[] {
  const cells: WorldCell[] = [];
  for (let q = 0; q <= 9; q++) {
    cells.push(cell(q, 0, { objectId: block(q) ? "boss:hedgehog" : null, buildingId: q === 2 || q === 8 ? "yard" : null }));
    cells.push(cell(q, 1, { terrainId: "sea" }));
  }
  return cells;
}
const sail = [{ q: 9, r: 1 }];

describe("pickShortYard", () => {
  it("ближайшая по шагам, если обе доступны", () => {
    expect(pickShortYard(strip(() => false), { q: 0, r: 0 }, W, "yard", sail)).toEqual({ q: 2, r: 0 });
  });

  it("ближняя замурована боссом — дальняя", () => {
    expect(pickShortYard(strip((q) => q === 3), { q: 4, r: 0 }, W, "yard", sail)).toEqual({ q: 8, r: 0 });
  });

  it("от верфи не доплыть до цели — не она; никакой — null", () => {
    const cells = strip(() => false).map((c) => (c.q === 5 && c.r === 1 ? { ...c, terrainId: "grass" } : c));
    expect(pickShortYard(cells, { q: 0, r: 0 }, W, "yard", sail)).toEqual({ q: 8, r: 0 });
    expect(pickShortYard(cells, { q: 0, r: 0 }, W, "yard", [{ q: 3, r: 5 }])).toBeNull();
  });
});

describe("pickShortYard: водоросли", () => {
  it("вода с декором кораблю не проход — верфь за ней не годится", () => {
    const cells = strip(() => false).map((c) => (c.q === 5 && c.r === 1 ? { ...c, decorationId: "seaweed" } : c));
    expect(pickShortYard(cells, { q: 0, r: 0 }, W, "yard", sail)).toEqual({ q: 8, r: 0 });
  });
});
