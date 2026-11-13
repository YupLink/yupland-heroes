// Аномалия (владелец, 05.11.2026): −50/−60 или +50/+60 — рыба не клюёт, шахты и фермы не
// работают, ход и ход на воде ×20 (вместо смеси); значок — метель / огненный дождь; обряд —
// только за возможное в мире; прогноз уровня учитывает шторм аномалии; доля времени в админке.
import { describe, expect, it } from "vitest";
import {
  WEATHER_ANOMALY_COEFS,
  WEATHER_KIND_NAMES,
  weatherAnomalyOf,
  weatherCoefs,
  weatherLevelOf,
} from "@/lib/raid/weather";
import { WEATHER_ODDS_DEFAULT, nextWeatherKind, type WeatherOdds } from "@/lib/raid/weatherOdds";
import { WEATHER_CLIMATE_DEFAULT, type WeatherClimate } from "@/lib/raid/weatherClimate";
import {
  forecastWithVotes,
  ritualTargets,
  tempVotes,
  withAnomalyLevels,
} from "@/lib/raid/weatherRitual";
import { weatherClimateStats } from "@/lib/raid/weatherClimateStats";
import { weatherLevelHours, weatherLevelShare } from "@/lib/raid/weatherOdds";
import { rollFirstWeather, rollNextWeather } from "@/lib/raid/weatherRoll";
import { weatherChancePlan } from "@/lib/raid/fishWeather";
import { weatherShown } from "@/lib/raid/weatherYield";
import { moveMultOf } from "@/lib/shipRules";

const D: WeatherOdds = { ...WEATHER_ODDS_DEFAULT };
const C = (o: Partial<WeatherClimate> = {}): WeatherClimate => ({
  ...WEATHER_CLIMATE_DEFAULT,
  ...o,
});

describe("коэффициенты аномалии", () => {
  it("−50 и ниже, +50 и выше — 0 / 0 / 0 / ×20 / ×20 при любом значке", () => {
    expect(WEATHER_ANOMALY_COEFS).toEqual({ fish: 0, mine: 0, farm: 0, step: 20, ship: 20 });
    for (const t of [-60, -50, 50, 60])
      for (const kind of ["blizzard", "fire_rain", "storm", "clear"] as const)
        expect(weatherCoefs(t, kind)).toEqual(WEATHER_ANOMALY_COEFS);
    expect(weatherAnomalyOf(-49)).toBeNull();
    expect(weatherAnomalyOf(49)).toBeNull();
    expect(weatherCoefs(-40, "blizzard")).toEqual(weatherCoefs(-40, "storm"));
  });

  it("потребители: рыба не клюёт, добыча 0, ход ×20", () => {
    const c = weatherCoefs(-50, "blizzard");
    expect(weatherChancePlan({ chancePct: 40, steps: [{ at: 1, pct: 20 }] }, c.fish)).toEqual({
      chancePct: 0,
      steps: [],
    });
    expect(weatherShown(12, c.mine, "blizzard")).toEqual({ value: 0, kind: "blizzard" });
    expect(weatherShown(3, c.farm, "fire_rain")).toEqual({ value: 0, kind: "fire_rain" });
    expect(moveMultOf(1, c)).toEqual({ step: 20, ship: 20 });
  });
});

describe("значок аномалии", () => {
  it("огненный дождь — шторм, названия ru+en", () => {
    expect(weatherLevelOf("fire_rain")).toBe("storm");
    expect(WEATHER_KIND_NAMES.fire_rain).toEqual({ ru: "Огненный дождь", en: "Fire rain" });
  });
  it("в аномалии — метель / огненный дождь, вне её огненный дождь не держится", () => {
    const prev = { level: "storm" as const, kind: "thunderstorm" as const };
    expect(nextWeatherKind(prev, "storm", 50, 0)).toBe("fire_rain");
    expect(nextWeatherKind(prev, "storm", -60, 0)).toBe("blizzard");
    expect(nextWeatherKind({ level: "storm", kind: "fire_rain" }, "storm", 40, 0.9)).toBe(
      "thunderstorm",
    );
    expect(nextWeatherKind({ level: "storm", kind: "blizzard" }, "storm", -40, 0.5)).toBe(
      "blizzard",
    );
  });
  it("первый слот мира в аномалию не попадает", () => {
    const c = C({ tempMin: 40, tempMax: 40, anomaly: "heat" });
    for (const r of [0, 0.5, 0.99]) expect(rollFirstWeather(c, [r, r, r]).temperatureC).toBe(40);
  });
});

describe("обряд в мире с климатом", () => {
  const cold = C({ tempMin: -20, tempMax: 20, levels: ["clear", "overcast"], anomaly: "cold" });
  it("цели — уровни мира и ступени лестницы (аномалия — только с галкой)", () => {
    expect(ritualTargets({ level: "overcast", temperatureC: -20 }, cold)).toEqual([
      "clear",
      "overcast",
      "warmer",
      "colder",
    ]);
    expect(ritualTargets({ level: "overcast", temperatureC: -20 }, C({ tempMin: -20 }))).toEqual([
      "clear",
      "overcast",
      "storm",
      "warmer",
    ]);
    // Сейчас шторм аномалии (уровень не из мира) и −60 — только «теплее».
    expect(ritualTargets({ level: "storm", temperatureC: -60 }, cold)).toEqual(["warmer"]);
    // Без климата — как раньше.
    expect(ritualTargets({ level: "clear", temperatureC: 40 })).toEqual([
      "clear",
      "overcast",
      "colder",
    ]);
  });
  it("голоса «холоднее» у края мира — за −50", () => {
    expect([...tempVotes(-20, { colder: 2, warmer: 1 }, cold)]).toEqual([
      ["-10", 1],
      ["-50", 2],
    ]);
    expect([...tempVotes(-60, { colder: 2 }, cold)]).toEqual([]);
  });
  it("прогноз: шанс аномалии — шторм в уровнях", () => {
    const f = forecastWithVotes({ level: "clear", temperatureC: -20 }, D, {}, cold);
    const p = Object.fromEntries(f.levels.map((x) => [x.value, Math.round(x.p * 100) / 100]));
    // Аномалия 30 %: ясно/пасмурно по 50 % от остальных 70 %, шторм — 30 %.
    expect(p).toEqual({ overcast: 35, clear: 35, storm: 30 });
    expect(withAnomalyLevels(f.levels, [{ value: 0, p: 100 }])).toEqual(f.levels);
  });
});

describe("доля времени в админке", () => {
  it("без климата — прежние формулы", () => {
    const s = weatherClimateStats(D, WEATHER_CLIMATE_DEFAULT);
    expect(s.share).toEqual(weatherLevelShare(D));
    expect(s.hours.clear).toBe(weatherLevelHours("clear", D));
    expect(s.anomaly).toBe(0);
  });

  it("с климатом — как долгая цепочка бросков", () => {
    const c = C({ tempMin: -10, tempMax: 10, levels: ["clear", "overcast"], anomaly: "cold" });
    const s = weatherClimateStats(D, c);
    // mulberry32: простой генератор без заметной связи соседних чисел.
    let a = 3;
    const r = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let w = rollFirstWeather(c, [r(), r(), r()]);
    const n = 200_000;
    const hits = { clear: 0, overcast: 0, storm: 0 };
    let odd = 0;
    for (let i = 0; i < n; i++) {
      w = rollNextWeather(w, D, c, {}, [r(), r(), r()]);
      hits[w.level]++;
      if (weatherAnomalyOf(w.temperatureC)) odd++;
    }
    expect(Math.abs(s.share.clear - (hits.clear / n) * 100)).toBeLessThan(1);
    expect(Math.abs(s.share.storm - (hits.storm / n) * 100)).toBeLessThan(1);
    expect(Math.abs(s.anomaly - (odd / n) * 100)).toBeLessThan(1);
    expect(s.share.storm).toBeCloseTo(s.anomaly, 6);
    expect(s.hours.clear).toBeGreaterThan(0);
  });
});
