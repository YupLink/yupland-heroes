// Плавная смена погоды (владелец, 28.10.2026): уровень — только на соседний и чаще
// тот же, температура — −10 / та же / +10 на сетке, значок держится, шансы админа.
import { describe, expect, it } from "vitest";
import { WEATHER_LEVELS, weatherKindChoices, type WeatherLevel } from "@/lib/raid/weather";
import {
  WEATHER_ODDS_DEFAULT,
  nextLevelOdds,
  nextTempOdds,
  nextWeatherKind,
  pickChance,
  weatherLevelHours,
  weatherLevelShare,
  weatherOddsError,
  weatherOddsOf,
  weatherTempBase,
  type WeatherOdds,
} from "@/lib/raid/weatherOdds";

const D = WEATHER_ODDS_DEFAULT;
const map = <T extends string | number>(list: { value: T; p: number }[]) =>
  Object.fromEntries(list.map((x) => [x.value, Math.round(x.p * 100) / 100]));

describe("уровень следующей смены", () => {
  it("по умолчанию тот же — 50 %, иначе соседний", () => {
    expect(map(nextLevelOdds("clear", D))).toEqual({ clear: 50, overcast: 50 });
    expect(map(nextLevelOdds("overcast", D))).toEqual({ clear: 25, storm: 25, overcast: 50 });
    expect(map(nextLevelOdds("storm", D))).toEqual({ storm: 50, overcast: 50 });
  });

  it("через уровень не прыгает: из ясно нет шторма, из шторма нет ясно", () => {
    expect(nextLevelOdds("clear", D).map((x) => x.value)).not.toContain("storm");
    expect(nextLevelOdds("storm", D).map((x) => x.value)).not.toContain("clear");
  });

  it("сумма — 100 при любых верных шансах", () => {
    const o: WeatherOdds = { ...D, overcastToClear: 70, overcastToStorm: 30, clearToOvercast: 0 };
    for (const lvl of WEATHER_LEVELS)
      expect(nextLevelOdds(lvl, o).reduce((s, x) => s + x.p, 0)).toBe(100);
  });

  it("бросок идёт по порядку исходов, ноль не выпадает", () => {
    const list = nextLevelOdds("overcast", D);
    expect(pickChance(list, 0)).toBe("clear");
    expect(pickChance(list, 0.2499)).toBe("clear");
    expect(pickChance(list, 0.25)).toBe("storm");
    expect(pickChance(list, 0.5)).toBe("overcast");
    expect(pickChance(list, 0.99999)).toBe("overcast");
    const never = nextLevelOdds("clear", { ...D, clearToOvercast: 0 });
    expect(pickChance(never, 0)).toBe("clear");
  });
});

describe("температура следующей смены", () => {
  it("сетка через 10: половина — вверх", () => {
    expect(weatherTempBase(17)).toBe(20);
    expect(weatherTempBase(15)).toBe(20);
    expect(weatherTempBase(14)).toBe(10);
    expect(weatherTempBase(-15)).toBe(-10);
    expect(weatherTempBase(-16)).toBe(-20);
    expect(weatherTempBase(40)).toBe(40);
    expect(weatherTempBase(-40)).toBe(-40);
  });

  it("+20: +10 — 30 %, +20 — 40 %, +30 — 30 %", () => {
    expect(map(nextTempOdds(20, D))).toEqual({ 10: 30, 20: 40, 30: 30 });
  });

  it("у края шаг за край выброшен, остальное делится пропорционально", () => {
    expect(map(nextTempOdds(-40, D))).toEqual({ "-40": 57.14, "-30": 42.86 });
    expect(map(nextTempOdds(40, D))).toEqual({ 30: 42.86, 40: 57.14 });
  });

  it("вверх и вниз — порознь", () => {
    expect(map(nextTempOdds(0, { ...D, tempDown: 10, tempUp: 50 }))).toEqual({
      "-10": 10,
      0: 40,
      10: 50,
    });
  });

  it("всё на краю и только за край — остаётся на месте", () => {
    expect(nextTempOdds(40, { ...D, tempDown: 0, tempUp: 100 })).toEqual([{ value: 40, p: 100 }]);
  });
});

describe("значок держится, пока возможен", () => {
  it("тот же уровень — прежний значок", () => {
    expect(nextWeatherKind({ level: "overcast", kind: "rain" }, "overcast", 10, 0)).toBe("rain");
    expect(nextWeatherKind({ level: "storm", kind: "thunderstorm" }, "storm", 20, 0)).toBe(
      "thunderstorm",
    );
  });

  it("дождь в минус и метель в плюс — заново из возможных", () => {
    expect(nextWeatherKind({ level: "overcast", kind: "rain" }, "overcast", -10, 0)).toBe(
      "overcast",
    );
    expect(nextWeatherKind({ level: "storm", kind: "blizzard" }, "storm", 0, 0.99)).toBe(
      "thunderstorm",
    );
  });

  it("сменился уровень — значок из нового, всегда возможный", () => {
    for (const level of WEATHER_LEVELS as readonly WeatherLevel[])
      for (const t of [-40, -10, 0, 30])
        for (const rnd of [0, 0.5, 0.99999])
          expect(weatherKindChoices(level, t)).toContain(
            nextWeatherKind({ level: "clear", kind: "clear" }, level, t, rnd),
          );
  });
});

describe("шансы админа", () => {
  it("проверка ввода", () => {
    expect(weatherOddsError(D)).toBeNull();
    expect(weatherOddsError({ ...D, overcastToClear: 60, overcastToStorm: 50 })).toMatch(
      /пасмурно/,
    );
    expect(weatherOddsError({ ...D, tempDown: 60, tempUp: 50 })).toMatch(/Температура/);
    expect(weatherOddsError({ ...D, clearToOvercast: 12.5 })).toMatch(/целые/);
    expect(weatherOddsError({ ...D, stormToOvercast: 101 })).toMatch(/целые/);
  });

  it("из настройки: нет ключа — по умолчанию, битое целиком — по умолчанию", () => {
    expect(weatherOddsOf({ tempUp: 10 })).toEqual({ ...D, tempUp: 10 });
    expect(weatherOddsOf({ tempUp: "10" })).toEqual(D);
    expect(weatherOddsOf({ tempDown: 90, tempUp: 90 })).toEqual(D);
    expect(weatherOddsOf(null)).toEqual(D);
  });

  it("по умолчанию: доля времени 25 / 50 / 25, держится в среднем 6 часов", () => {
    expect(map(Object.entries(weatherLevelShare(D)).map(([value, p]) => ({ value, p })))).toEqual({
      clear: 25,
      overcast: 50,
      storm: 25,
    });
    for (const lvl of WEATHER_LEVELS) expect(weatherLevelHours(lvl, D)).toBe(6);
    expect(weatherLevelHours("clear", { ...D, clearToOvercast: 0 })).toBe(Infinity);
  });
});
