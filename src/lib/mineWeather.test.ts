// Погода у шахт v2 (weather-02): каждый полный час × коэффициент слота, где он
// начался; доли не теряются; без погоды — счёт прежний до цифры.
import { describe, expect, it } from "vitest";
import { mineCoefAt, mineWeatherDelta, mineWeatherOf, type MineWeather } from "./mineWeather";
import { livePendingAmount } from "./minePending";
import { mineRowReady } from "./mineLost";

const H = 3_600_000;
const SLOT = 3 * H;
const T0 = Date.UTC(2026, 9, 26, 0, 0, 0); // начало слота 00:00 UTC

describe("mineWeatherOf — слоты из ответа базы", () => {
  it("jsonb и его текст, по возрастанию; все 1 — null (погода не влияет)", () => {
    expect(
      mineWeatherOf([
        [T0 + SLOT, 2],
        [T0, 0.5],
      ]),
    ).toEqual([
      [T0, 0.5],
      [T0 + SLOT, 2],
    ]);
    expect(mineWeatherOf(JSON.stringify([[T0, 0.055]]))).toEqual([[T0, 0.055]]);
    expect(
      mineWeatherOf([
        [T0, 1],
        [T0 + SLOT, 1],
      ]),
    ).toBeNull();
    expect(mineWeatherOf(null)).toBeNull();
    expect(mineWeatherOf("мусор")).toBeNull();
    expect(
      mineWeatherOf([
        ["x", 2],
        [T0, -1],
      ]),
    ).toBeNull();
  });
});

describe("mineCoefAt — слот, где час начался", () => {
  const w: MineWeather = [
    [T0, 0.5],
    [T0 + SLOT, 2],
  ];
  it("внутри слота — его коэффициент, граница — уже следующий", () => {
    expect(mineCoefAt(w, T0 + 2.5 * H)).toBe(0.5); // час 02:30–03:30 начался в 00–03
    expect(mineCoefAt(w, T0 + SLOT)).toBe(2);
    expect(mineCoefAt(w, T0 - 1)).toBe(1);
  });
  it("позже известных слотов — последний (погода следующего ещё не выпала)", () => {
    expect(mineCoefAt(w, T0 + 10 * H)).toBe(2);
  });
});

describe("livePendingAmount с погодой", () => {
  it("без слотов — ровно прежнее число (и при коэффициентах 1)", () => {
    const now = T0 + 7.4 * H;
    for (const [claimed, y] of [
      [0, 10],
      [2, 10 / 3],
      [3, 0.0417],
      [1, 15],
    ] as const) {
      const old = livePendingAmount(T0, claimed, y, now, 168, 1);
      expect(livePendingAmount(T0, claimed, y, now, 168, 1, null)).toBe(old);
      expect(livePendingAmount(T0, claimed, y, now, 168, 1, undefined)).toBe(old);
    }
  });

  it("каждый час × коэффициент слота, где он начался (стык слотов)", () => {
    // Отрезок с 01:30: часы начались в 01:30, 02:30 (слот 00–03, ×0,5), 03:30, 04:30 (03–06, ×2).
    const from = T0 + 1.5 * H;
    const w: MineWeather = [
      [T0, 0.5],
      [T0 + SLOT, 2],
    ];
    const now = from + 4 * H + 60_000;
    // 10 в час: 5 + 5 + 20 + 20 = 50.
    expect(livePendingAmount(from, 0, 10, now, null, 1, w)).toBe(50);
    expect(mineWeatherDelta(w, from, 0, 4)).toBeCloseTo(-0.5 - 0.5 + 1 + 1, 12);
    // Собраны 2 часа — остались часы 03:30 и 04:30.
    expect(livePendingAmount(from, 2, 10, now, null, 1, w)).toBe(40);
  });

  it("доли не теряются: 1 золото/ч × 0,85, сбор каждый час — 0,85 каждый раз", () => {
    const w: MineWeather = [[T0, 0.85]];
    let paid = 0;
    for (let h = 1; h <= 6; h++) {
      const got = livePendingAmount(T0, h - 1, 1, T0 + h * H + 1, null, 1, w);
      expect(got).toBe(0.85);
      paid += got;
    }
    // Сбор раз в 6 часов — столько же.
    expect(livePendingAmount(T0, 0, 1, T0 + 6 * H + 1, null, 1, w)).toBeCloseTo(paid, 10);
  });

  it("предел часов (поломка) и шаг суток — по тем же часам", () => {
    const w: MineWeather = [[T0, 0.1]];
    // Сломалась через 3 часа: дальше не копит.
    expect(livePendingAmount(T0, 0, 10, T0 + 9 * H, 3, 1, w)).toBe(3);
  });

  it("mineRowReady: строка «Добычи» с погодой; отнятая — сумма журнала", () => {
    const row = { capturedAt: T0, claimedHours: 0, yield: 10, maxHours: null };
    const now = T0 + 2 * H + 5;
    expect(mineRowReady(row, now)).toBe(20);
    expect(mineRowReady({ ...row, weather: [[T0, 0.055]] }, now)).toBe(1.1);
    expect(mineRowReady({ ...row, weather: [[T0, 0.5]], lost: { id: "l", amount: 7 } }, now)).toBe(
      7,
    );
  });
});
