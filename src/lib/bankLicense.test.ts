// Лицензии банка: фиксированные цены (владелец + Архан, 17.10.2026), покупка и
// лицензия по подписке на энергию.
import { describe, expect, it } from "vitest";
import {
  LICENSE_SELF_MULT,
  LICENSE_TIERS,
  effectiveLicense,
  licenseActive,
  licensePrice,
  licenseTier,
  purchaseKind,
} from "./bankLicense";
import { pricesFromDarai } from "./usdTariff";

describe("цены лицензий — фиксированные", () => {
  it("таблица: DARAI 1 / 5 / 18 млн, доллары — прежние $3 / $13 / $32 ÷ 5", () => {
    expect(LICENSE_TIERS.map((t) => [t.id, t.dailyGold, t.price.Darai, t.price.USDT])).toEqual([
      ["small", 5_000, 1_000_000, 0.6],
      ["medium", 25_000, 5_000_000, 2.6],
      ["large", 100_000, 18_000_000, 6.4],
    ]);
  });

  it("алмазы вернулись (владелец 01.11): в банке 50 / 200 / 800 — таблица ×2", () => {
    expect(LICENSE_TIERS.map((t) => licensePrice(t, "diamonds"))).toEqual(
      LICENSE_TIERS.map((t) => t.price.diamonds * LICENSE_SELF_MULT),
    );
    expect(LICENSE_TIERS.map((t) => licensePrice(t, "diamonds"))).toEqual([50, 200, 800]);
  });

  it("цена берётся только из ступени; покупка самому — ×LICENSE_SELF_MULT", () => {
    const large = licenseTier("large")!;
    expect(licensePrice(large, "Darai")).toBe(large.price.Darai * LICENSE_SELF_MULT);
    expect(licensePrice(large, "USDT")).toBeCloseTo(large.price.USDT * LICENSE_SELF_MULT, 2);
    expect(licenseTier("huge")).toBeUndefined();
    expect(licenseTier(null)).toBeUndefined();
  });

  it("звёзды — от цены в DARAI по курсу, +10 % (как у билетов); без курса — нет", () => {
    const rate = 1_000_000; // DARAI за $
    for (const t of LICENSE_TIERS) {
      const darai = t.price.Darai * LICENSE_SELF_MULT;
      expect(licensePrice(t, "STARS", rate)).toBe(pricesFromDarai(darai, rate)!.STARS);
      expect(licensePrice(t, "STARS", null)).toBeNull();
    }
    // 2 млн DARAI при курсе 1 млн за $: $2 ÷ 0,9 × 1,1 ÷ 0,013 ≈ 189 ⭐.
    expect(licensePrice(LICENSE_TIERS[0], "STARS", rate)).toBe(189);
  });
});

describe("покупка и действие", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  const live = { tier: "medium" as const, dailyLimit: 25_000, endsAt: "2026-11-01T00:00:00Z" };
  const gone = { ...live, endsAt: "2026-10-01T00:00:00Z" };

  it("по одной каждого вида: та же действует — продление, иначе новая рядом (не замена)", () => {
    expect(purchaseKind([], "small", now)).toBe("new");
    expect(purchaseKind([gone], "medium", now)).toBe("new");
    expect(purchaseKind([live], "medium", now)).toBe("extend");
    expect(purchaseKind([live], "large", now)).toBe("new");
    expect(purchaseKind([live, { ...live, tier: "large" }], "large", now)).toBe("extend");
    expect(licenseActive(live, now)).toBe(true);
    expect(licenseActive(gone, now)).toBe(false);
  });

  it("лимиты разных видов складываются, одинаковые — один раз (владелец 30.10)", () => {
    const subLarge = {
      tier: "large" as const,
      dailyLimit: 100_000,
      endsAt: "2026-11-03T00:00:00Z",
    };
    const subSmall = { tier: "small" as const, dailyLimit: 5_000, endsAt: "2026-11-20T00:00:00Z" };
    // купленная Средняя + Большая и Малая по подпискам = 25 000 + 100 000 + 5 000
    expect(effectiveLicense([live, subLarge, subSmall], now)).toEqual({
      tier: "large",
      dailyLimit: 130_000,
      endsAt: "2026-11-20T00:00:00Z",
      kinds: ["small", "medium", "large"],
    });
    // купленная Средняя и Средняя по подписке — один раз, срок поздний
    const subMedium = {
      tier: "medium" as const,
      dailyLimit: 25_000,
      endsAt: "2026-12-01T00:00:00Z",
    };
    expect(effectiveLicense([live, subMedium], now)).toMatchObject({
      dailyLimit: 25_000,
      endsAt: "2026-12-01T00:00:00Z",
      kinds: ["medium"],
    });
    // истёкшие не в счёт
    expect(effectiveLicense([gone, subSmall], now)).toMatchObject({
      dailyLimit: 5_000,
      kinds: ["small"],
    });
    expect(
      effectiveLicense([gone, { ...subLarge, endsAt: "2026-10-02T00:00:00Z" }], now),
    ).toBeNull();
    expect(effectiveLicense([null], now)).toBeNull();
  });
});
