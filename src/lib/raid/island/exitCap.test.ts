// Потолок выноса с острова: прибавка сверх 50 дерева, 20 камня, 100 золота, 2 алмазов — срезается.
import { describe, expect, it } from "vitest";
import { ISLAND_EXIT_CAP, islandExitCut } from "./exitCap";

describe("потолок выноса с острова", () => {
  it("обычный проход: прибавка в пределах — ничего не срезано", () => {
    expect(
      islandExitCut(
        { wood: 48, stone: 146, gold: 120 },
        { wood: 98, stone: 160, gold: 200, diamonds: 1 },
      ),
    ).toEqual({});
  });

  it("ферма: всё сверх потолка срезано, потолок остаётся", () => {
    const base = { wood: 10, stone: 0, gold: 5, diamonds: 0 };
    const now = { wood: 3010, stone: 520, gold: 905, diamonds: 7 };
    const cut = islandExitCut(base, now);
    expect(cut).toEqual({ wood: 2950, stone: 500, gold: 800, diamonds: 5 });
    for (const r of ["wood", "stone", "gold", "diamonds"] as const)
      expect(now[r] - (cut[r] ?? 0) - base[r]).toBe(ISLAND_EXIT_CAP[r]);
  });

  it("потратил больше, чем добыл — ничего не срезано; дробное — по 4 знака", () => {
    expect(islandExitCut({ gold: 500 }, { gold: 100 })).toEqual({});
    expect(islandExitCut({ gold: 0 }, { gold: 100.12345 })).toEqual({ gold: 0.1234 });
  });
});
