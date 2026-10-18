// Ничья: равные делят призы своих мест поровну, неделимое — как за лучшее место.
import { describe, expect, it } from "vitest";
import { fundDarai } from "@/lib/tournament/places";
import { groupByPlace, shareOf, tieShare } from "@/lib/tournament/tieShare";
import type { TourBand, TourPrize } from "@/lib/tournament/types";

const D = (amount: number): TourPrize => ({ kind: "token", amount, refId: "Darai" });
const gold = (amount: number): TourPrize => ({ kind: "resource", amount, refId: "gold" });
const art = (refId: string): TourPrize => ({ kind: "art", amount: 1, refId });

// Как у боевых турниров 05.10: 1 / 2-3 / 4-10 / 11-20.
const bands: TourBand[] = [
  { places: "1", prizes: [D(27_272_727), gold(50_000), art("artifact_crown")] },
  { places: "2-3", prizes: [D(13_636_364), gold(25_000), art("rarity:epic")] },
  { places: "4-10", prizes: [D(5_454_545), gold(10_000), art("rarity:rare")] },
  { places: "11-20", prizes: [D(2_727_273), gold(5_000), art("rarity:common")] },
];

describe("доля", () => {
  it("целым — вниз; дробью — до миллионных, без шума", () => {
    expect(shareOf(1301, 2, true)).toBe(650);
    expect(shareOf(10, 3, false)).toBe(3.333333);
    expect(shareOf(0.3, 3, false)).toBe(0.1);
    expect(shareOf(5, 0, true)).toBe(5);
  });
});

describe("ничья", () => {
  it("один на месте — призы места как есть", () => {
    expect(tieShare(bands, 2, 1)).toEqual({ prizes: bands[1].prizes, leftDarai: 0 });
  });

  it("1–2: сумма мест 1 и 2 пополам, корона каждому", () => {
    const s = tieShare(bands, 1, 2);
    expect(s.prizes).toEqual([
      D(20_454_545),
      gold(37_500),
      art("artifact_crown"),
      // Эпика места 2 нет: неделимое — только лучшего места группы.
    ]);
    // 27 272 727 + 13 636 364 = 40 909 091 → по 20 454 545, 1 DARAI — в пул.
    expect(s.leftDarai).toBe(1);
  });

  it("2–3 внутри одной полосы: каждому как за место", () => {
    expect(tieShare(bands, 2, 2)).toEqual({ prizes: bands[1].prizes, leftDarai: 0 });
  });

  it("на границе полос 10–11: доли двух полос, неделимое — места 10", () => {
    expect(tieShare(bands, 10, 2).prizes).toEqual([D(4_090_909), gold(7_500), art("rarity:rare")]);
    const three = tieShare(bands, 10, 3);
    // 5 454 545 + 2 × 2 727 273 = 10 909 091 → по 3 636 363, остаток 2.
    expect(three.prizes).toEqual([D(3_636_363), gold(6_666), art("rarity:rare")]);
    expect(three.leftDarai).toBe(2);
  });

  it("группа вылезает за призовые места — делят только призовые", () => {
    // Места 19–22: призы есть у 19 и 20.
    const s = tieShare(bands, 19, 4);
    expect(s.prizes).toEqual([D(1_363_636), gold(2_500), art("rarity:common")]);
    expect(s.leftDarai).toBe(2);
  });

  it("делимое, которого нет у лучшего места, — тоже в долю; нулевая доля не выдаётся", () => {
    const b: TourBand[] = [
      { places: "1", prizes: [art("artifact_crown"), { kind: "likes", amount: 1, refId: null }] },
      { places: "2", prizes: [{ kind: "energy", amount: 10, refId: null }] },
    ];
    expect(tieShare(b, 1, 2).prizes).toEqual([
      art("artifact_crown"),
      { kind: "energy", amount: 5, refId: null },
    ]);
  });

  it("фонд сходится: выдано + остаток = DARAI занятых мест", () => {
    const groups: Array<[number, number]> = [
      [1, 2],
      [3, 1],
      [4, 7],
      [11, 3],
      [14, 7],
    ];
    let given = 0;
    let left = 0;
    for (const [k, n] of groups) {
      const s = tieShare(bands, k, n);
      given += n * s.prizes.filter((p) => p.refId === "Darai").reduce((x, p) => x + p.amount, 0);
      left += s.leftDarai;
    }
    expect(given + left).toBe(fundDarai(bands));
  });
});

describe("группы мест", () => {
  it("по месту, внутри — по аккаунту; мусор и повторы — мимо", () => {
    expect(
      groupByPlace([
        { place: 2, account_id: "acc_c" },
        { place: 1, account_id: "acc_b" },
        { place: "2", account_id: "acc_a" },
        { place: 2, account_id: "acc_a" },
        { place: 0, account_id: "acc_x" },
      ]),
    ).toEqual([
      { place: 1, accounts: ["acc_b"] },
      { place: 2, accounts: ["acc_a", "acc_c"] },
    ]);
  });
});
