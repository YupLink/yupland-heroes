// Усиление чертежа шахты (владелец 31.10 и 06.11.2026): цены 2/8/15/25 💎,
// захват ×2/×3/×5/×8; постановка стоит столько же, сколько захват.
import { describe, expect, it } from "vitest";
import {
  MINE_BOOST_LEVELS,
  MINE_BOOST_MAX,
  boostedCaptureCost,
  mineBoostClamp,
  mineBoostMult,
  mineBoostNext,
  mineBoostRef,
} from "./mineBoost";

describe("усиление чертежа", () => {
  it("уровни и цены — как сказал владелец; «+800 %» — ×8", () => {
    expect(MINE_BOOST_LEVELS.map((l) => l.diamonds)).toEqual([2, 8, 15, 25]);
    expect(MINE_BOOST_LEVELS.map((l) => l.mult)).toEqual([2, 3, 5, 8]);
    expect(MINE_BOOST_MAX).toBe(4);
  });

  it("алмазная 20 ⚡ → 160 ⚡ на последнем уровне; без усиления — как было", () => {
    expect(boostedCaptureCost("diamonds", 0)).toBe(20);
    expect(boostedCaptureCost("diamonds", 4)).toBe(160);
    expect(boostedCaptureCost("wood", 1)).toBe(20);
    expect(boostedCaptureCost("gold", 3)).toBe(50);
  });

  it("следующий уровень, потолок и мусор из базы", () => {
    expect(mineBoostNext(0)).toEqual({ diamonds: 2, mult: 2 });
    expect(mineBoostNext(3)).toEqual({ diamonds: 25, mult: 8 });
    expect(mineBoostNext(4)).toBeNull();
    expect(mineBoostClamp("7")).toBe(4);
    expect(mineBoostClamp(-1)).toBe(0);
    expect(mineBoostMult(0)).toBe(1);
  });

  it("ключ оплаты — свой у аккаунта, вида и уровня", () => {
    expect(mineBoostRef("acc", "gold", 2)).toBe("mboost:acc:gold:2");
  });
});
