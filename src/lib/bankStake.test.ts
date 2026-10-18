import { describe, expect, it } from "vitest";
import {
  STAKE_PLANS,
  earlyBack,
  goldPerDay,
  holderNft,
  holderWithdrawSplit,
  stakeLocked,
} from "./bankStake";
import { splitHolderFee } from "@/server/api/bank/stake-ticker";

describe("ставки стейкинга (владелец + Архан 16.10)", () => {
  it("без лока 30 %, за лок +5/+10/+15/+20", () => {
    expect(STAKE_PLANS.map((p) => [p.id, p.days, p.pct])).toEqual([
      ["free", 0, 30],
      ["m1", 30, 35],
      ["m3", 90, 40],
      ["m6", 180, 45],
      ["m12", 365, 50],
    ]);
  });

  it("фикс: 1 млн при 30 % — 1 500 золота в год, 4,11 в сутки", () => {
    expect(goldPerDay(1e6, 30)).toBe(4.1095);
    expect(goldPerDay(1e6, 30) * 365).toBeCloseTo(1500, 0);
  });

  it("пример Архана: 100 млн на 6 мес (45 %) — 18 493 в месяц, вернуть за месяц 9 247", () => {
    const day = goldPerDay(1e8, 45);
    expect(day).toBe(616.4383);
    expect(Math.round(day * 30)).toBe(18493);
    expect(Math.round(earlyBack(day * 30))).toBe(9247);
  });

  it("лок — пока срок не вышел", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(stakeLocked({ lockUntil: null }, now)).toBe(false);
    expect(stakeLocked({ lockUntil: "2026-11-15T12:00:00Z" }, now)).toBe(true);
    expect(stakeLocked({ lockUntil: "2026-10-01T12:00:00Z" }, now)).toBe(false);
  });
});

describe("NFT холдеров", () => {
  it("номинал и срок вывода из названия", () => {
    expect(holderNft("Yupik holder (100 million darai)")).toEqual({
      millions: 100,
      darai: 1e8,
      unlockDays: 7,
    });
    expect(holderNft("Yupik holder+ (100 million darai)")).toEqual({
      millions: 100,
      darai: 1e8,
      unlockDays: 30,
    });
    expect(holderNft("Yupik holder (1 million DarAi)")?.darai).toBe(1e6);
    expect(holderNft("Yupik holder (60 million darai)")?.unlockDays).toBe(30);
    expect(holderNft("Yupik holder (500 million darai)")?.unlockDays).toBe(7);
  });

  it("чужие и выдуманные номиналы — не холдеры", () => {
    expect(holderNft("Yupik holder house (epic)")).toBeNull();
    expect(holderNft("Yupik holder (1000 million darai)")).toBeNull();
    expect(holderNft("Yupik holder+ (500 million darai)")).toBeNull();
    expect(holderNft("Holders of Hope (uncommon)")).toBeNull();
    expect(holderNft(null)).toBeNull();
  });
});

describe("вывод DARAI с меткой холдеров", () => {
  it("обычные — сразу и без комиссии", () => {
    expect(holderWithdrawSplit(50, 200, 100, 0)).toEqual({ plain: 50, parts: [] });
  });

  it("холдерские — последними: 7 дней раньше 30, комиссия 5 %", () => {
    const s = holderWithdrawSplit(180, 200, 100, 50);
    expect(s.plain).toBe(50);
    expect(s.parts).toEqual([
      { days: 7, holder: 100, gross: 100, fee: 5, payout: 95 },
      { days: 30, holder: 30, gross: 30, fee: 2, payout: 28 },
    ]);
    expect(s.parts[1].fee + s.parts[1].payout).toBe(30);
  });

  it("дробный хвост обычных едет с первой частью; выплата целыми, остаток — в комиссию", () => {
    const s = holderWithdrawSplit(20, 20.5, 10, 0);
    expect(s.plain).toBe(10);
    expect(s.parts).toEqual([{ days: 7, holder: 9.5, gross: 10, fee: 1, payout: 9 }]);
  });
});

describe("комиссия вывода холдеров: 30 % как подписка, 70 % на откуп", () => {
  it("сумма долей — ровно комиссия", () => {
    expect(splitHolderFee(5_000_000)).toEqual({ sub: 1_500_000, buyback: 3_500_000 });
    const s = splitHolderFee(1.5);
    expect(s.sub + s.buyback).toBe(1.5);
  });
});

describe("золото — в 00:00 UTC", () => {
  it("обход ждёт ближайшие 00:00:05 UTC", async () => {
    const { msToUtcMidnight } = await import("@/server/api/bank/stake-ticker");
    expect(msToUtcMidnight(Date.parse("2026-10-16T23:59:00Z"))).toBe(65_000);
    expect(msToUtcMidnight(Date.parse("2026-10-17T00:00:10Z"))).toBe(24 * 3600_000 - 5_000);
  });
});
