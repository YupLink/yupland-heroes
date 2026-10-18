// Ачивки: пороги, редкости и проход портала острова (17.10.2026).
import { describe, expect, it } from "vitest";
import {
  ACH_TRACK_IDS,
  ACH_TRACKS,
  MAX_STEP,
  islandGateDone,
  islandGateOk,
  parseAchCounts,
  rarityOf,
  stepOf,
  stepTarget,
  trackBonus,
} from "./tracks";
import { veteranNext, veteranOf } from "./veteran";

describe("редкости ачивок", () => {
  it("числа владельца: пороги шести редкостей", () => {
    expect(MAX_STEP).toBe(6);
    const row = (id: (typeof ACH_TRACK_IDS)[number]) =>
      [1, 2, 3, 4, 5, 6].map((s) => stepTarget(id, s));
    expect(row("lumber")).toEqual([60, 200, 500, 1500, 4000, 10000]);
    expect(row("miner")).toEqual([60, 200, 500, 1500, 4000, 10000]);
    for (const id of ["hunter", "digger", "fisher"] as const)
      expect(row(id)).toEqual([30, 100, 250, 750, 2000, 5000]);
    for (const id of ["sailor", "explorer"] as const)
      expect(row(id)).toEqual([300, 600, 1500, 4500, 10000, 20000]);
    expect(row("minelord")).toEqual([100, 1000, 2500, 6000, 14000, 30000]);
  });

  it("счёт → редкость → награда: +1/+3/+6/+9/+12/+24, итог, не сумма", () => {
    expect(stepOf("hunter", 29)).toBe(0);
    expect(stepOf("hunter", 30)).toBe(1);
    expect(stepOf("hunter", 100)).toBe(2);
    expect(stepOf("hunter", 1_000_000)).toBe(6);
    expect(rarityOf(0)).toBeNull();
    expect(rarityOf(1)).toBe("common");
    expect(rarityOf(6)).toBe("mythic");
    expect([0, 1, 2, 3, 4, 5, 6].map(trackBonus)).toEqual([0, 1, 3, 6, 9, 12, 24]);
    expect(ACH_TRACKS.fisher.stat).toBe("alchemy");
    expect(ACH_TRACKS.minelord.stat).toBe("trade");
  });

  it("счётчики из базы: мусор и минус — ноль", () => {
    const counts = parseAchCounts({ hunter: 3, lumber: "6", junk: 9, fisher: -1 });
    expect(counts).toEqual({ hunter: 3, lumber: 6 });
    expect(parseAchCounts(null)).toEqual({});
  });
});

describe("портал острова", () => {
  const firstRarity = Object.fromEntries(ACH_TRACK_IDS.map((id) => [id, stepTarget(id, 1)]));

  it("пускает только когда все 8 взяли обычную", () => {
    expect(islandGateOk(firstRarity)).toBe(true);
    expect(islandGateDone(firstRarity)).toBe(8);
    const short = { ...firstRarity, sailor: stepTarget("sailor", 1) - 1 };
    expect(islandGateOk(short)).toBe(false);
    expect(islandGateDone(short)).toBe(7);
    expect(islandGateOk({})).toBe(false);
  });
});

describe("ветеран портала", () => {
  it("редкость по очкам, без прибавок", () => {
    expect(veteranOf(0)).toEqual({ rarity: null });
    expect(veteranOf(20)).toEqual({ rarity: "common" });
    expect(veteranOf(1060)).toEqual({ rarity: "uncommon" });
    expect(veteranOf(16970)).toEqual({ rarity: "epic" });
    expect(veteranOf(62970)).toEqual({ rarity: "mythic" });
    expect(veteranNext(1060)).toBe(5000);
    expect(veteranNext(62970)).toBeNull();
  });
});
