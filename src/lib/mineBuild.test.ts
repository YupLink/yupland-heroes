// Арифметика режима стройки (§8.59 п. 8): круг из 19 клеток, призрак под
// пальцем не выходит за круг, первая позиция — зелёная клетка рядом с героем.
import { describe, expect, it } from "vitest";
import { candidateAt, firstGhost, hexDisk, hexDist, snapToDisk } from "@/lib/mineBuild";

const c = { q: 10, r: 5 };

describe("круг кандидатов", () => {
  it("радиус 2 — 19 клеток без повторов, центр первым, дальше кольцами", () => {
    const disk = hexDisk(c);
    expect(disk).toHaveLength(19);
    expect(new Set(disk.map((h) => `${h.q},${h.r}`)).size).toBe(19);
    expect(disk[0]).toEqual(c);
    expect(disk.slice(1, 7).every((h) => hexDist(h, c) === 1)).toBe(true);
    expect(disk.slice(7).every((h) => hexDist(h, c) === 2)).toBe(true);
    expect(hexDisk(c, 1)).toHaveLength(7);
  });

  it("палец в круге — та же клетка; за кругом — ближайшая клетка края", () => {
    expect(snapToDisk(c, 11, 6)).toEqual({ q: 11, r: 6 });
    expect(snapToDisk(c, 20, 5)).toEqual({ q: 12, r: 5 });
    expect(snapToDisk(c, 10, -3)).toEqual({ q: 10, r: 3 }); // палец выше и левее
    const far = snapToDisk(c, 4, 5);
    expect(hexDist(far, c)).toBe(2);
    expect(far).toEqual({ q: 8, r: 5 });
  });

  it("первая позиция — зелёная рядом (не под героем), иначе любая зелёная, иначе сосед", () => {
    const cells = [
      { q: 10, r: 5, ok: true, reason: null },
      { q: 11, r: 5, ok: false, reason: "mineplace.road" },
      { q: 12, r: 4, ok: true, reason: null },
    ];
    expect(firstGhost(c, cells)).toEqual({ q: 12, r: 4 });
    expect(firstGhost(c, cells.slice(0, 2))).toEqual({ q: 10, r: 5 });
    expect(firstGhost(c, [cells[1]])).toEqual({ q: 11, r: 5 });
    expect(firstGhost(c, null)).toEqual({ q: 11, r: 5 });
  });

  it("клетка под призраком", () => {
    const cells = [{ q: 11, r: 5, ok: false, reason: "mineplace.road" }];
    expect(candidateAt(cells, { q: 11, r: 5 })?.reason).toBe("mineplace.road");
    expect(candidateAt(cells, { q: 9, r: 5 })).toBeNull();
    expect(candidateAt(null, { q: 11, r: 5 })).toBeNull();
  });
});
