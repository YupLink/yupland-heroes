// Прогрессия цены генерации (11.11.2026): +0/25/50/100/200 %, пять подряд,
// сутки — от последнего заказа.
import { describe, expect, it } from "vitest";
import { nextStep, stepPrice, STEP_WINDOW_MS } from "./artGenStep";

const H = 60 * 60 * 1000;
const now = 1_000 * STEP_WINDOW_MS;

describe("nextStep", () => {
  it("заказов нет или сутки после последнего прошли — первый, по обычной цене", () => {
    expect(nextStep([], now)).toEqual({ step: 1, resetAt: null });
    expect(nextStep([now - 24 * H], now).step).toBe(1);
  });

  it("цепочка — пока между соседними меньше суток", () => {
    expect(nextStep([now - H], now)).toEqual({ step: 2, resetAt: now - H + 24 * H });
    // Три заказа с перерывами по 20 ч — цепочка не рвётся, хоть первый был 40 ч назад.
    expect(nextStep([now - 40 * H, now - 20 * H, now - H], now).step).toBe(4);
    // Перерыв в сутки рвёт цепочку: старые не в счёт.
    expect(nextStep([now - 30 * H, now - 5 * H], now).step).toBe(2);
  });

  it("пять подряд — предел до суток после пятого", () => {
    const five = [5, 4, 3, 2, 1].map((h) => now - h * H);
    expect(nextStep(five, now)).toEqual({ step: null, resetAt: now - H + 24 * H });
    expect(nextStep(five, now - H + 24 * H).step).toBe(1);
    // Шестой и дальше в старой цепочке не мешают: смотрим только последних пять.
    expect(nextStep([...five, now - 6 * H, now - 7 * H], now).step).toBeNull();
  });
});

describe("stepPrice", () => {
  const base = [
    { resource: "gold" as const, amount: 250 },
    { resource: "diamonds" as const, amount: 1 },
  ];
  it("250 золота + 1 алмаз: 250+1, 313+1, 375+2, 500+2, 750+3", () => {
    const rows = [1, 2, 3, 4, 5].map((s) => stepPrice(base, s).map((p) => p.amount));
    expect(rows).toEqual([
      [250, 1],
      [313, 1],
      [375, 2],
      [500, 2],
      [750, 3],
    ]);
  });
  it("дробная цена (токен) не теряет дробь", () => {
    expect(stepPrice([{ resource: "token", token: "X", amount: 0.5 }], 2)[0].amount).toBe(0.625);
  });
});

describe("stepPrice: края", () => {
  it("первый — цена как есть; крошечная дробь не обнуляется", () => {
    const tiny = [{ resource: "token" as const, token: "X", amount: 1e-7 }];
    expect(stepPrice(tiny, 1)[0].amount).toBe(1e-7);
    expect(stepPrice(tiny, 2)[0].amount).toBeGreaterThanOrEqual(1e-7);
  });
});
