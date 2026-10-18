// Слияние флажков карты: забранный столб получает знак «tree» (как дерево и
// статуя), чужие флаги клетки важнее, пустой ответ не будит перерисовку.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({ getSpellPillarMarks: async () => ({ heroId: null, cells: [] }) }));
vi.mock("@/server/api/beta-raid/mine-flags", () => ({ getMineFlags: async () => ({ flags: {} }) }));

import { withTakenPillars } from "./useMapFlags";

describe("withTakenPillars", () => {
  it("столб без своего флага — знак «tree»", () => {
    expect(withTakenPillars({ "0,0": "own" }, ["5,5"])).toEqual({ "0,0": "own", "5,5": "tree" });
  });

  it("шахта или поле на той же клетке важнее значка столба", () => {
    const flags = { "5,5": "enemy" as const, "6,6": "own" as const };
    expect(withTakenPillars(flags, ["5,5", "6,6"])).toEqual(flags);
  });

  it("флагов ещё нет — значки всё равно видны", () => {
    expect(withTakenPillars(undefined, ["1,2"])).toEqual({ "1,2": "tree" });
  });

  it("нечего добавить — та же ссылка: кадр и туман не пересчитываются зря", () => {
    const flags = { "0,0": "tree" as const };
    expect(withTakenPillars(flags, [])).toBe(flags);
    expect(withTakenPillars(flags, undefined)).toBe(flags);
  });

  it("ответ чужой формы из суточного кэша не роняет карту", () => {
    const flags = { "0,0": "own" as const };
    expect(withTakenPillars(flags, "1,1")).toBe(flags);
    expect(withTakenPillars(flags, [null, 3, "2,2"])).toEqual({ "0,0": "own", "2,2": "tree" });
  });
});
