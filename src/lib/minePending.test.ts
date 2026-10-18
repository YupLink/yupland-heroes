// Арифметика шахты: та же формула floor(часов − собранных) × выход стоит в
// SQL raid_mine_claim и raid_mine_capture (migrations/acc-48). Здесь она
// зафиксирована на сценарии владельца: «захватил в 10:00, отбили в 12:00,
// открыл в 12:30 — должен получить минимум 2 часа».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { livePendingAmount, livePendingHours } from "./minePending";

const H = 3_600_000;
const T10 = Date.UTC(2026, 8, 21, 10, 0, 0); // захват в 10:00
const YIELD = 10_000;

const at = (ms: number) => vi.setSystemTime(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("что причитается прежнему хозяину в момент перехвата", () => {
  it("10:00 → 12:00: ровно 2 часа × выход", () => {
    at(T10 + 2 * H);
    expect(livePendingHours(T10, 0)).toBe(2);
    expect(livePendingAmount(T10, 0, YIELD)).toBe(20_000);
  });

  it("10:00 → 12:30: 2 целых часа; полчаса хвоста сгорают (правило целых часов)", () => {
    at(T10 + 2.5 * H);
    expect(livePendingHours(T10, 0)).toBe(2);
    expect(livePendingAmount(T10, 0, YIELD)).toBe(20_000);
  });

  it("10:00 → 10:59: ничего — держал меньше часа", () => {
    at(T10 + 59 * 60_000);
    expect(livePendingHours(T10, 0)).toBe(0);
    expect(livePendingAmount(T10, 0, YIELD)).toBe(0);
  });

  it("уже собрал 1 час, перехват в 12:59: доплата 1 час, не 2", () => {
    at(T10 + 2 * H + 59 * 60_000);
    expect(livePendingHours(T10, 1)).toBe(1);
    expect(livePendingAmount(T10, 1, YIELD)).toBe(10_000);
  });

  it("собрано всё — ноль, никогда не в минус", () => {
    at(T10 + 2 * H);
    expect(livePendingHours(T10, 2)).toBe(0);
    expect(livePendingHours(T10, 3)).toBe(0);
    expect(livePendingAmount(T10, 3, YIELD)).toBe(0);
  });

  it("дробный claimed: floor(ОСТАТКА), а не floor(всего) − round(claimed)", () => {
    // 1 ч 40 мин при claimed 0.5: остаток 1.17 → 1 час. Прод-версия etap4
    // с ::int округляла 0.5 → 1 и давала 0 (или 1 → 1 при 0.4).
    at(T10 + 100 * 60_000);
    expect(livePendingHours(T10, 0.5)).toBe(1);
    expect(livePendingAmount(T10, 0.5, YIELD)).toBe(10_000);
  });

  it("Darai-шахта 800 000/ч, 3 ч 17 мин: 2.4M целыми, хвост 17 мин сгорает", () => {
    at(T10 + 3 * H + 17 * 60_000);
    expect(livePendingAmount(T10, 0, 800_000)).toBe(2_400_000);
  });

  it("без секундомера (захвата не было) — ноль", () => {
    at(T10 + 5 * H);
    expect(livePendingHours(null, 0)).toBe(0);
    expect(livePendingAmount(0, 0, YIELD)).toBe(0);
  });
});

describe("предел добычи (лесопилка острова — неделя)", () => {
  it("после недели часы не растут, без предела — растут", async () => {
    const { livePendingAmount } = await import("./minePending");
    const cap = Date.UTC(2026, 9, 1);
    const tenDays = cap + 10 * 24 * 3_600_000;
    expect(livePendingAmount(cap, 0, 1, tenDays, 168)).toBe(168);
    expect(livePendingAmount(cap, 160, 1, tenDays, 168)).toBe(8);
    expect(livePendingAmount(cap, 168, 1, tenDays, 168)).toBe(0);
    expect(livePendingAmount(cap, 0, 1, tenDays)).toBe(240);
  });
});
