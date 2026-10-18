// Лицензии банка: фиксированные цены (владелец + Архан, 17.10.2026), покупка и
// лицензия по подписке на энергию.
import { describe, expect, it } from "vitest";
import {
  LICENSE_TIERS,
  effectiveLicense,
  licenseActive,
  licensePrice,
  licenseTier,
  purchaseKind,
} from "./bankLicense";

describe("цены лицензий — фиксированные", () => {
  it("DARAI 1 / 5 / 18 млн, алмазы 5 / 22 / 80, доллары — прежние $3 / $13 / $32 ÷ 5", () => {
    expect(
      LICENSE_TIERS.map((t) => [t.id, t.dailyGold, t.price.Darai, t.price.diamonds, t.price.USDT]),
    ).toEqual([
      ["small", 5_000, 1_000_000, 5, 0.6],
      ["medium", 25_000, 5_000_000, 22, 2.6],
      ["large", 100_000, 18_000_000, 80, 6.4],
    ]);
  });

  it("цена берётся только из ступени; алмазы — целые", () => {
    const large = licenseTier("large")!;
    expect(licensePrice(large, "Darai")).toBe(18_000_000);
    expect(licensePrice(large, "USDT")).toBe(6.4);
    expect(licensePrice(large, "diamonds")).toBe(80);
    for (const t of LICENSE_TIERS) expect(Number.isInteger(t.price.diamonds)).toBe(true);
    expect(licenseTier("huge")).toBeUndefined();
    expect(licenseTier(null)).toBeUndefined();
  });
});

describe("покупка и действие", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  const live = { tier: "medium" as const, dailyLimit: 25_000, endsAt: "2026-11-01T00:00:00Z" };
  const gone = { ...live, endsAt: "2026-10-01T00:00:00Z" };

  it("нет или истекла — новая; та же — продление; другая — замена", () => {
    expect(purchaseKind(null, "small", now)).toBe("new");
    expect(purchaseKind(gone, "medium", now)).toBe("new");
    expect(purchaseKind(live, "medium", now)).toBe("extend");
    expect(purchaseKind(live, "large", now)).toBe("replace");
    expect(licenseActive(live, now)).toBe(true);
    expect(licenseActive(gone, now)).toBe(false);
  });

  it("купленная и по подписке: действует старшая, лимиты не складываются", () => {
    const subLarge = {
      tier: "large" as const,
      dailyLimit: 100_000,
      endsAt: "2026-11-03T00:00:00Z",
    };
    const subSmall = { tier: "small" as const, dailyLimit: 5_000, endsAt: "2026-11-03T00:00:00Z" };
    expect(effectiveLicense(live, subLarge, now)).toEqual(subLarge);
    expect(effectiveLicense(live, subSmall, now)).toEqual(live);
    expect(effectiveLicense(gone, subSmall, now)).toEqual(subSmall);
    expect(effectiveLicense(null, null, now)).toBeNull();
    // ступени равны — действует та, что дольше
    const subMedium = {
      tier: "medium" as const,
      dailyLimit: 25_000,
      endsAt: "2026-11-20T00:00:00Z",
    };
    expect(effectiveLicense(live, subMedium, now)).toEqual(subMedium);
    expect(
      effectiveLicense({ ...live, endsAt: "2026-12-01T00:00:00Z" }, subMedium, now)?.endsAt,
    ).toBe("2026-12-01T00:00:00Z");
    expect(effectiveLicense(gone, { ...subLarge, endsAt: "2026-10-02T00:00:00Z" }, now)).toBeNull();
  });
});
