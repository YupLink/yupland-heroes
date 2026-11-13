// Рефка золотом (§8.101): доля по сумме покупок друзей, подписка по лавке
// ($1 = 1 000 золота), золото пригласившему и доля фонда выкупа в монете оплаты.
import { describe, expect, it } from "vitest";
import { refBuybackShare, refGoldEq, refPctFor, refReward } from "./referralGold";

describe("доля с покупок друзей", () => {
  it("10 % без ачивки; 11/12/14/16/18/20 % с порогов 1 тыс./10 тыс./100 тыс./500 тыс./1 млн/10 млн", () => {
    expect(refPctFor(0)).toBe(10);
    expect(refPctFor(999)).toBe(10);
    expect([1_000, 10_000, 100_000, 500_000, 1_000_000, 10_000_000].map(refPctFor)).toEqual([
      11, 12, 14, 16, 18, 20,
    ]);
    expect(refPctFor(99_999)).toBe(12);
    expect(refPctFor(50_000_000)).toBe(20);
  });

  it("подписка — по лавке: $140 = 140 000 золота; золото — как куплено", () => {
    expect(refGoldEq("sub", 140)).toBe(140_000);
    expect(refGoldEq("sub", 7.5)).toBe(7_500);
    expect(refGoldEq("gold", 150, 150_000)).toBe(150_000);
    expect(refGoldEq("gold", 1, 100)).toBe(100);
  });

  it("пример: подписка $140 при 14 % — 19 600 золота", () => {
    expect(refReward(refGoldEq("sub", 140), refPctFor(140_000))).toBe(19_600);
    expect(refReward(1_234, 11)).toBe(135.74);
  });
});

describe("доля фонда выкупа", () => {
  it("USDT — до 6 знаков, DARAI и звёзды — целыми; доля + остаток ровно оплата", () => {
    expect(refBuybackShare("USDT", 7, 10)).toEqual({ share: 0.7, rest: 6.3 });
    expect(refBuybackShare("Darai", 1_000_001, 14)).toEqual({ share: 140_000, rest: 860_001 });
    // звёзды — нам на счёт целиком, в фонд выкупа не идут (02.11)
    expect(refBuybackShare("STARS", 593, 10)).toEqual({ share: 0, rest: 593 });
    const u = refBuybackShare("USDT", 1.23, 17);
    expect(Math.round((u.share + u.rest) * 1e6)).toBe(1_230_000);
  });
});
