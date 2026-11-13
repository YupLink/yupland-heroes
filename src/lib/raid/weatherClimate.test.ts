// Климат мира (владелец, 05.11.2026): проверка ввода (сервер и база — та же), разбор настройки
// (чего нет — как всегда, битое — весь климат как всегда), лестница температур с аномалией,
// соседние ступени, ближайшая точка, первый слот мира.
import { describe, expect, it } from "vitest";
import {
  WEATHER_CLIMATE_DEFAULT,
  WEATHER_CLIMATE_TEMPS,
  climateSnapLevel,
  climateSnapTemp,
  isDefaultClimate,
  weatherClimateError,
  weatherClimateOf,
  weatherFirstLevelIn,
  weatherFirstTempIn,
  weatherTempLadder,
  weatherTempStep,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";
import type { WeatherLevel } from "@/lib/raid/weather";

const C = (o: Partial<WeatherClimate> = {}): WeatherClimate => ({
  ...WEATHER_CLIMATE_DEFAULT,
  ...o,
});

describe("проверка климата", () => {
  it("как всегда — верно; точки −40…+40 через 10", () => {
    expect(weatherClimateError(WEATHER_CLIMATE_DEFAULT)).toBeNull();
    expect(WEATHER_CLIMATE_TEMPS).toEqual([-40, -30, -20, -10, 0, 10, 20, 30, 40]);
    expect(
      weatherClimateError(C({ tempMin: 0, tempMax: 0, levels: ["storm"], anomaly: "heat" })),
    ).toBeNull();
  });

  it("температура: только сетка внутри −40…+40, минимум не выше максимума", () => {
    expect(weatherClimateError(C({ tempMin: -50 }))).toMatch(/−40 до \+40/);
    expect(weatherClimateError(C({ tempMax: 45 }))).toMatch(/−40 до \+40/);
    expect(weatherClimateError(C({ tempMin: -15 }))).toMatch(/через 10/);
    expect(weatherClimateError(C({ tempMin: 0.5 }))).toMatch(/через 10/);
    expect(weatherClimateError(C({ tempMin: 20, tempMax: 10 }))).toMatch(/минимум не выше/);
  });

  it("погода — непустой ряд подряд, без повторов и чужих", () => {
    expect(weatherClimateError(C({ levels: [] }))).toMatch(/подряд/);
    expect(weatherClimateError(C({ levels: ["clear", "storm"] }))).toMatch(/подряд/);
    expect(weatherClimateError(C({ levels: ["overcast", "clear"] }))).toMatch(/подряд/);
    expect(weatherClimateError(C({ levels: ["clear", "clear"] }))).toMatch(/подряд/);
    expect(weatherClimateError(C({ levels: ["snow" as WeatherLevel] }))).toMatch(/подряд/);
    expect(weatherClimateError(C({ levels: ["overcast", "storm"] }))).toBeNull();
  });

  it("аномалия — нет, холод или жара", () => {
    expect(weatherClimateError(C({ anomaly: "cold" }))).toBeNull();
    expect(weatherClimateError(C({ anomaly: "heat" }))).toBeNull();
    expect(weatherClimateError(C({ anomaly: "wind" as "cold" }))).toMatch(/Аномалия/);
  });
});

describe("климат из настройки", () => {
  it("нет записи или не объект — как всегда", () => {
    for (const raw of [null, undefined, 5, "x", [], [1]])
      expect(weatherClimateOf(raw)).toEqual(WEATHER_CLIMATE_DEFAULT);
  });

  it("заданное — поверх «как всегда», уровни по порядку и без повторов", () => {
    expect(weatherClimateOf({ tempMin: -20 })).toEqual(C({ tempMin: -20 }));
    expect(weatherClimateOf({ levels: ["storm", "overcast", "storm"], anomaly: "heat" })).toEqual(
      C({ levels: ["overcast", "storm"], anomaly: "heat" }),
    );
    expect(weatherClimateOf({ anomaly: null, tempMax: 10 })).toEqual(C({ tempMax: 10 }));
  });

  it("битое — весь климат как всегда (как raid_weather_climate)", () => {
    for (const raw of [
      { tempMin: -20, tempMax: -30 },
      { tempMin: -35 },
      { levels: ["clear", "storm"] },
      { levels: ["clear", 3] },
      { levels: [] },
      { anomaly: "wind" },
      { anomaly: 1 },
    ])
      expect(weatherClimateOf(raw)).toEqual(WEATHER_CLIMATE_DEFAULT);
    // Не число и не массив — ключ не берётся (как jsonb_typeof в базе).
    expect(weatherClimateOf({ tempMin: "-20", levels: "storm" })).toEqual(WEATHER_CLIMATE_DEFAULT);
  });

  it("как всегда — узнаётся", () => {
    expect(isDefaultClimate(WEATHER_CLIMATE_DEFAULT)).toBe(true);
    expect(isDefaultClimate(C({ anomaly: "cold" }))).toBe(false);
    expect(isDefaultClimate(C({ levels: ["clear"] }))).toBe(false);
    expect(isDefaultClimate(C({ tempMax: 30 }))).toBe(false);
  });
});

describe("лестница температур", () => {
  it("как всегда −40…+40; холод снизу −60, −50; жара сверху +50, +60", () => {
    expect(weatherTempLadder(WEATHER_CLIMATE_DEFAULT)).toEqual(WEATHER_CLIMATE_TEMPS);
    expect(weatherTempLadder(C({ tempMin: -10, tempMax: 10, anomaly: "cold" }))).toEqual([
      -60, -50, -10, 0, 10,
    ]);
    expect(weatherTempLadder(C({ tempMin: 20, tempMax: 30, anomaly: "heat" }))).toEqual([
      20, 30, 50, 60,
    ]);
    expect(weatherTempLadder(C({ tempMin: 0, tempMax: 0 }))).toEqual([0]);
  });

  it("соседние ступени: у края мира холоднее — сразу −50; из −60 теплее −50, из −50 — край", () => {
    const cold = C({ tempMin: -20, tempMax: 20, anomaly: "cold" });
    expect(weatherTempStep(-20, cold, -1)).toBe(-50);
    expect(weatherTempStep(-50, cold, -1)).toBe(-60);
    expect(weatherTempStep(-60, cold, -1)).toBeNull();
    expect(weatherTempStep(-60, cold, 1)).toBe(-50);
    expect(weatherTempStep(-50, cold, 1)).toBe(-20);
    expect(weatherTempStep(20, cold, 1)).toBeNull();
    const heat = C({ tempMin: -20, tempMax: 20, anomaly: "heat" });
    expect(weatherTempStep(20, heat, 1)).toBe(50);
    expect(weatherTempStep(60, heat, 1)).toBeNull();
    expect(weatherTempStep(50, heat, -1)).toBe(20);
    // Не на лестнице (сузили диапазон) — шагов нет.
    expect(weatherTempStep(-40, cold, 1)).toBeNull();
    // Как всегда: ±10, за ±40 — нет; точка сетки — половина вверх.
    expect(weatherTempStep(17, WEATHER_CLIMATE_DEFAULT, 1)).toBe(30);
    expect(weatherTempStep(40, WEATHER_CLIMATE_DEFAULT, 1)).toBeNull();
  });

  it("ближайшая точка диапазона и ближайший уровень", () => {
    const c = C({ tempMin: -20, tempMax: 10, levels: ["overcast"] });
    expect(climateSnapTemp(-40, c)).toBe(-20);
    expect(climateSnapTemp(-60, c)).toBe(-20);
    expect(climateSnapTemp(37, c)).toBe(10);
    expect(climateSnapTemp(0, c)).toBe(0);
    expect(climateSnapLevel("clear", c)).toBe("overcast");
    expect(climateSnapLevel("storm", c)).toBe("overcast");
    expect(climateSnapLevel("storm", C({ levels: ["clear", "overcast"] }))).toBe("overcast");
    expect(climateSnapLevel("clear", C({ levels: ["overcast", "storm"] }))).toBe("overcast");
  });
});

describe("первый слот мира", () => {
  it("точка диапазона и отмеченный уровень поровну; rnd у края не выходит", () => {
    const c = C({ tempMin: -20, tempMax: 10, levels: ["overcast", "storm"] });
    expect([0, 0.24, 0.25, 0.5, 0.75, 0.9999999].map((r) => weatherFirstTempIn(c, r))).toEqual([
      -20, -20, -10, 0, 10, 10,
    ]);
    expect(weatherFirstTempIn(c, 1)).toBe(10);
    expect([0, 0.49, 0.5, 1].map((r) => weatherFirstLevelIn(c, r))).toEqual([
      "overcast",
      "overcast",
      "storm",
      "storm",
    ]);
  });

  it("как всегда — как прежний бросок базы: (least(8, floor(rnd·9)) − 4)·10 и три уровня", () => {
    for (let i = 0; i < 1000; i++) {
      const r = i / 1000;
      expect(weatherFirstTempIn(WEATHER_CLIMATE_DEFAULT, r)).toBe(
        (Math.min(8, Math.floor(r * 9)) - 4) * 10,
      );
      expect(weatherFirstLevelIn(WEATHER_CLIMATE_DEFAULT, r)).toBe(
        (["clear", "overcast", "storm"] as const)[1 + Math.min(2, Math.floor(r * 3)) - 1],
      );
    }
  });
});
