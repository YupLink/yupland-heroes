// Обмен в банке: формула пула, комиссия 80/20, наполнение в пропорции.
import { describe, expect, it } from "vitest";
import { dpOf, floorTo, fundPair, poolPrice, quote } from "./bankSwap";
import type { BankPool } from "./castleBank";

const pool = (over: Partial<BankPool> = {}): BankPool => ({
  id: "bp",
  tokenA: "gold",
  tokenB: "Darai",
  weightA: 1,
  weightB: 200,
  reserveA: 500_000,
  reserveB: 100_000_000,
  feePct: 10,
  createdAt: "",
  ...over,
});

describe("обмен в банке", () => {
  it("продал 1 000 золота: 100 комиссии (80 в пул, 20 в пул карты), по курсу 900", () => {
    const q = quote(pool(), "gold", 1000)!;
    expect(q.fee).toBe(100);
    expect(q.feePool).toBe(80);
    expect(q.feeMap).toBe(20);
    expect(q.out).toBeCloseTo((100_000_000 * 900) / 500_900, 6);
    expect(Math.floor(q.out)).toBe(179_676);
    expect(q.tokenOut).toBe("Darai");
    // В пул: 900 по курсу + 80 комиссии; цена после ≈ 199,25.
    expect(q.priceAfter).toBeCloseTo((100_000_000 - q.out) / 500_980, 6);
  });

  it("купил золото за 200 000 DARAI: комиссия 20 000 (16 000 в пул, 4 000 в пул карты)", () => {
    const q = quote(pool(), "Darai", 200_000)!;
    expect([q.fee, q.feePool, q.feeMap]).toEqual([20_000, 16_000, 4_000]);
    expect(q.out).toBe(Math.floor(((500_000 * 180_000) / 100_180_000) * 1e4) / 1e4);
    expect(q.priceAfter).toBeGreaterThan(200);
  });

  it("пул пуст — обмена нет; чужой токен — нет; вычерпать нельзя", () => {
    expect(quote(pool({ reserveA: 0, reserveB: 0 }), "gold", 10)).toBeNull();
    expect(quote(pool(), "wood", 10)).toBeNull();
    const q = quote(pool(), "gold", 1e12)!;
    expect(q.out).toBeLessThan(100_000_000);
  });

  it("наполнение: пуст — по стартовому курсу, есть запас — в пропорции запасов", () => {
    expect(fundPair(pool({ reserveA: 0, reserveB: 0 }), 500_000)).toBe(100_000_000);
    expect(fundPair(pool({ reserveA: 400_000, reserveB: 100_000_000 }), 1_000)).toBe(250_000);
    expect(poolPrice(pool({ reserveA: 0, reserveB: 0, weightB: 150 }))).toBe(150);
  });

  it("монеты счёта: знаки — как у монеты, комиссия без пула карты остаётся в пуле (bank-12)", () => {
    // USDT 6 знаков, звёзды — целые; у USDT пула карты нет — 20 % тоже в пул.
    const p = pool({
      tokenA: "USDT",
      tokenB: "STARS",
      reserveA: 100,
      reserveB: 10_000,
      dpA: 6,
      dpB: 0,
    });
    const q = quote(p, "USDT", 1)!;
    expect([q.fee, q.feeMap, q.feePool]).toEqual([0.1, 0, 0.1]);
    expect(q.out).toBe(Math.floor((10_000 * 0.9) / 100.9));
    expect(Number.isInteger(q.out)).toBe(true);
    const back = quote(p, "STARS", 50)!;
    expect(back.feeMap).toBe(0);
    expect(back.out).toBe(Math.floor(((100 * 45) / 10_045) * 1e6) / 1e6);
    expect(dpOf(p, "USDT")).toBe(6);
    expect(dpOf(pool(), "Darai")).toBe(8); // старый ответ без dp — как раньше
    expect(floorTo(12.3456789, 0)).toBe(12);
    expect(
      fundPair(
        pool({
          tokenA: "HOPE",
          tokenB: "Darai",
          weightA: 1,
          weightB: 3.33333333,
          reserveA: 0,
          reserveB: 0,
          dpB: 8,
        }),
        3,
      ),
    ).toBe(9.99999999);
  });
});
