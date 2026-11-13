// Смена погоды в мире с климатом (владелец, 05.11.2026): температура не выходит из диапазона
// (шаг за край выброшен, остальные делят долю), уровни — только отмеченные, вход в аномалию
// с края мира и выход обратно, аномалия — шторм с метелью / огненным дождём, сузили диапазон —
// следующая смена ставит ближайшее. Без климата — всё как было до цифры.
import { describe, expect, it } from "vitest";
import {
  WEATHER_ODDS_DEFAULT,
  nextLevelOdds,
  nextTempOdds,
  weatherTempBase,
  type Chance,
  type WeatherOdds,
} from "@/lib/raid/weatherOdds";
import {
  WEATHER_CLIMATE_DEFAULT,
  weatherTempLadder,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";
import { rollFirstWeather, rollNextWeather, type WeatherSlot } from "@/lib/raid/weatherRoll";
import { WEATHER_LEVELS, weatherAnomalyOf } from "@/lib/raid/weather";

const D: WeatherOdds = { ...WEATHER_ODDS_DEFAULT };
const C = (o: Partial<WeatherClimate> = {}): WeatherClimate => ({
  ...WEATHER_CLIMATE_DEFAULT,
  ...o,
});
const map = <T>(list: Chance<T>[]) =>
  Object.fromEntries(list.map((c) => [String(c.value), Math.round(c.p * 100) / 100]));

/** Прежняя формула (до климата) — для сверки «как всегда». */
function oldTemp(prev: number, o: WeatherOdds): Chance<number>[] {
  const base = weatherTempBase(prev);
  const all = [
    { value: base - 10, w: o.tempDown },
    { value: base, w: 100 - o.tempDown - o.tempUp },
    { value: base + 10, w: o.tempUp },
  ].filter((x) => x.value >= -40 && x.value <= 40);
  const sum = all.reduce((s, x) => s + x.w, 0);
  if (sum <= 0) return [{ value: base, p: 100 }];
  return all.map((x) => ({ value: x.value, p: (x.w / sum) * 100 }));
}

describe("без климата — как было до цифры", () => {
  const odds: WeatherOdds[] = [
    D,
    { ...D, tempDown: 0, tempUp: 100 },
    { ...D, tempDown: 20, tempUp: 40, overcastToStorm: 50 },
    { ...D, tempDown: 0, tempUp: 0 },
  ];
  it("температура на всём −40…+40 (и не на сетке)", () => {
    for (const o of odds)
      for (let t = -40; t <= 40; t++) expect(nextTempOdds(t, o)).toEqual(oldTemp(t, o));
  });
  it("уровень: тот же список (тот же объект шансов)", () => {
    for (const o of odds)
      for (const l of WEATHER_LEVELS)
        expect(nextLevelOdds(l, o, WEATHER_CLIMATE_DEFAULT)).toEqual(nextLevelOdds(l, o));
  });
});

describe("температура в диапазоне мира", () => {
  const c = C({ tempMin: -20, tempMax: 20 });
  it("внутри — как всегда; у края шаг за край выброшен, доли поделены", () => {
    expect(map(nextTempOdds(0, D, c))).toEqual({ "-10": 30, 0: 40, 10: 30 });
    expect(map(nextTempOdds(-20, D, c))).toEqual({ "-20": 57.14, "-10": 42.86 });
    expect(map(nextTempOdds(20, D, c))).toEqual({ 10: 42.86, 20: 57.14 });
  });
  it("одна точка — стоит на месте", () => {
    expect(nextTempOdds(10, D, C({ tempMin: 10, tempMax: 10 }))).toEqual([{ value: 10, p: 100 }]);
  });
  it("сейчас вне диапазона (сузили) — следующая смена ставит ближайшую точку", () => {
    expect(nextTempOdds(-40, D, c)).toEqual([{ value: -20, p: 100 }]);
    expect(nextTempOdds(37, D, c)).toEqual([{ value: 20, p: 100 }]);
  });
});

describe("аномалия холода: вход с края мира и выход", () => {
  const c = C({ tempMin: -20, tempMax: 20, anomaly: "cold" });
  it("у нижнего края «холоднее» — сразу −50", () => {
    expect(map(nextTempOdds(-20, D, c))).toEqual({ "-50": 30, "-20": 40, "-10": 30 });
  });
  it("из −50 холоднее −60, теплее — край мира; из −60 — только −50 или та же", () => {
    expect(map(nextTempOdds(-50, D, c))).toEqual({ "-60": 30, "-50": 40, "-20": 30 });
    expect(map(nextTempOdds(-60, D, c))).toEqual({ "-60": 57.14, "-50": 42.86 });
  });
  it("аномалию сняли — из −50/−60 сразу на край мира", () => {
    expect(nextTempOdds(-60, D, C({ tempMin: -20, tempMax: 20 }))).toEqual([
      { value: -20, p: 100 },
    ]);
    expect(nextTempOdds(-50, D, C({ tempMin: -20, anomaly: "heat" }))).toEqual([
      { value: -20, p: 100 },
    ]);
  });
});

describe("аномалия жары — зеркально", () => {
  const c = C({ tempMin: -10, tempMax: 30, anomaly: "heat" });
  it("+30 → +50, +50 → +60 / +30, +60 → +50", () => {
    expect(map(nextTempOdds(30, D, c))).toEqual({ 20: 30, 30: 40, 50: 30 });
    expect(map(nextTempOdds(50, D, c))).toEqual({ 30: 30, 50: 40, 60: 30 });
    expect(map(nextTempOdds(60, D, c))).toEqual({ 50: 42.86, 60: 57.14 });
  });
  it("нижний край без холода — как всегда (за край нельзя)", () => {
    expect(map(nextTempOdds(-10, D, c))).toEqual({ "-10": 57.14, 0: 42.86 });
  });
});

describe("уровни мира", () => {
  it("переход в чужой уровень выброшен, доли поделены", () => {
    const c = C({ levels: ["clear", "overcast"] });
    expect(map(nextLevelOdds("overcast", D, c))).toEqual({ clear: 33.33, overcast: 66.67 });
    expect(map(nextLevelOdds("clear", D, c))).toEqual({ overcast: 50, clear: 50 });
  });
  it("сейчас чужой — ближайший отмеченный", () => {
    expect(nextLevelOdds("storm", D, C({ levels: ["clear"] }))).toEqual([
      { value: "clear", p: 100 },
    ]);
    expect(nextLevelOdds("clear", D, C({ levels: ["overcast", "storm"] }))).toEqual([
      { value: "overcast", p: 100 },
    ]);
  });
  it("остались одни нули — уровень тот же", () => {
    const o = { ...D, overcastToClear: 0, overcastToStorm: 100 };
    expect(nextLevelOdds("overcast", o, C({ levels: ["clear", "overcast"] }))).toEqual([
      { value: "overcast", p: 100 },
    ]);
  });
});

describe("бросок слота (зеркало raid_weather_ensure)", () => {
  /** Простой воспроизводимый генератор случайных чисел. */
  const rng = (seed: number) => () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  it("аномалия — всегда шторм; холод — метель, жара — огненный дождь", () => {
    const prev: WeatherSlot = { temperatureC: -20, level: "clear", kind: "clear" };
    const c = C({ tempMin: -20, tempMax: 20, anomaly: "cold" });
    // rnd температуры 0 — первый исход (холоднее = −50); уровень — «ясно» остаётся.
    expect(rollNextWeather(prev, D, c, {}, [0, 0.99, 0])).toEqual({
      temperatureC: -50,
      level: "storm",
      kind: "blizzard",
    });
    const hot: WeatherSlot = { temperatureC: 40, level: "storm", kind: "thunderstorm" };
    expect(
      rollNextWeather(
        hot,
        { ...D, tempDown: 0, tempUp: 100 },
        C({ anomaly: "heat" }),
        {},
        [0.5, 0.99, 0],
      ),
    ).toEqual({
      temperatureC: 50,
      level: "storm",
      kind: "fire_rain",
    });
  });

  it("после аномалии огненный дождь не держится", () => {
    const prev: WeatherSlot = { temperatureC: 50, level: "storm", kind: "fire_rain" };
    const next = rollNextWeather(
      prev,
      { ...D, tempDown: 100, tempUp: 0 },
      C({ anomaly: "heat" }),
      {},
      [0.5, 0.99, 0],
    );
    expect(next.temperatureC).toBe(40);
    expect(next.level).toBe("storm");
    expect(["storm", "thunderstorm"]).toContain(next.kind);
  });

  it("цепочка 20 000 смен: в лестнице и уровнях мира, аномалия — шторм, огненный дождь — только при жаре", () => {
    const worlds: Array<[WeatherClimate, WeatherOdds]> = [
      [C({ tempMin: -20, tempMax: 10, levels: ["clear", "overcast"], anomaly: "cold" }), D],
      [
        C({ tempMin: 10, tempMax: 40, levels: ["overcast"], anomaly: "heat" }),
        { ...D, tempUp: 50 },
      ],
      [C({ tempMin: -40, tempMax: -40, levels: ["storm"], anomaly: "cold" }), D],
      [C({ tempMin: 0, tempMax: 20 }), D],
    ];
    for (const [c, o] of worlds) {
      const r = rng(7);
      const ladder = weatherTempLadder(c);
      let w = rollFirstWeather(c, [r(), r(), r()]);
      let anomalies = 0;
      for (let i = 0; i < 20_000; i++) {
        w = rollNextWeather(w, o, c, {}, [r(), r(), r()]);
        expect(ladder).toContain(w.temperatureC);
        const a = weatherAnomalyOf(w.temperatureC);
        if (a) {
          anomalies++;
          expect(w.level).toBe("storm");
          expect(w.kind).toBe(a === "cold" ? "blizzard" : "fire_rain");
        } else {
          expect(c.levels).toContain(w.level);
          expect(w.kind).not.toBe("fire_rain");
        }
      }
      expect(anomalies > 0).toBe(c.anomaly !== null);
    }
  });
});
