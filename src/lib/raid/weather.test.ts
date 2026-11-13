// Погода рейда (владелец, 26.10.2026): категории температур, семь видов, итог
// (стандарт 1 не в среднем, иначе (t + w) / 2), правила значка, первый слот,
// слоты по 3 часа UTC. Смена слота по шансам — weatherOdds.test.ts.
import { describe, expect, it } from "vitest";
import {
  WEATHER_SLOT_HOURS,
  NO_WEATHER,
  WEATHER_KINDS,
  WEATHER_KIND_NAMES,
  WEATHER_LEVEL_KINDS,
  isWeatherKind,
  weatherBandOf,
  weatherCoefs,
  weatherFirstTemp,
  weatherKindChoices,
  weatherKindFor,
  weatherLevelOf,
  weatherMix,
  weatherNextAt,
  weatherSlotStart,
  type WeatherCoefs,
  type WeatherKind,
} from "@/lib/raid/weather";

const c = (fish: number, mine: number, farm: number, step: number, ship: number): WeatherCoefs => ({
  fish,
  mine,
  farm,
  step,
  ship,
});

describe("категории температуры — границы", () => {
  const cases: Array<[number, string]> = [
    [-40, "very_cold"],
    [-30, "very_cold"],
    [-29, "cold"],
    [-10, "cold"],
    [-9, "cool"],
    [0, "cool"],
    [10, "cool"],
    [11, "warm"],
    [30, "warm"],
    [31, "hot"],
    [40, "hot"],
  ];
  for (const [t, band] of cases)
    it(`${t} °C → ${band}`, () => expect(weatherBandOf(t).band).toBe(band));

  it("при ясной погоде итог на границах (стандарт 1 не в среднем)", () => {
    // ясно: 1 / 1 / 2 / 1 / 1 — в среднем только фермы (2)
    expect(weatherCoefs(-40, "clear")).toEqual(c(0, 0.1, 1.05, 2, 10));
    expect(weatherCoefs(-30, "clear")).toEqual(c(0, 0.1, 1.05, 2, 10));
    expect(weatherCoefs(-29, "clear")).toEqual(c(0.5, 0.4, 1.2, 1.5, 4));
    expect(weatherCoefs(-10, "clear")).toEqual(c(0.5, 0.4, 1.2, 1.5, 4));
    expect(weatherCoefs(-9, "clear")).toEqual(c(1, 0.7, 1.35, 1, 2));
    expect(weatherCoefs(0, "clear")).toEqual(c(1, 0.7, 1.35, 1, 2));
    expect(weatherCoefs(10, "clear")).toEqual(c(1, 0.7, 1.35, 1, 2));
    expect(weatherCoefs(11, "clear")).toEqual(c(2, 1, 2, 1, 1));
    expect(weatherCoefs(30, "clear")).toEqual(c(2, 1, 2, 1, 1));
    expect(weatherCoefs(31, "clear")).toEqual(c(4, 1, 2, 1, 1));
    expect(weatherCoefs(40, "clear")).toEqual(c(4, 1, 2, 1, 1));
  });
});

describe("восемь видов и их уровни", () => {
  it("виды — контракт интерфейса (огненный дождь — 05.11.2026, только жара-аномалия)", () => {
    expect([...WEATHER_KINDS]).toEqual([
      "clear",
      "overcast",
      "rain",
      "fog",
      "storm",
      "thunderstorm",
      "blizzard",
      "fire_rain",
      "snow",
    ]);
  });

  const level: Record<WeatherKind, string> = {
    clear: "clear",
    overcast: "overcast",
    rain: "overcast",
    fog: "overcast",
    storm: "storm",
    thunderstorm: "storm",
    blizzard: "storm",
    fire_rain: "storm",
    snow: "overcast",
  };
  for (const kind of WEATHER_KINDS) {
    it(`${kind} → уровень ${level[kind]}, названия ru+en`, () => {
      expect(weatherLevelOf(kind)).toBe(level[kind]);
      // Вне аномалии огненного дождя нет — в значках уровня его нет.
      if (kind === "fire_rain") expect(WEATHER_LEVEL_KINDS.storm).not.toContain(kind);
      else expect(WEATHER_LEVEL_KINDS[weatherLevelOf(kind)]).toContain(kind);
      expect(WEATHER_KIND_NAMES[kind].ru).toBeTruthy();
      expect(WEATHER_KIND_NAMES[kind].en).toBeTruthy();
      expect(isWeatherKind(kind)).toBe(true);
    });
  }

  it("пасмурно, туман и дождь — одни коэффициенты; шторм, гроза и метель — одни", () => {
    expect(weatherCoefs(20, "fog")).toEqual(weatherCoefs(20, "overcast"));
    expect(weatherCoefs(20, "rain")).toEqual(weatherCoefs(20, "overcast"));
    expect(weatherCoefs(-20, "blizzard")).toEqual(weatherCoefs(-20, "storm"));
    expect(weatherCoefs(20, "thunderstorm")).toEqual(weatherCoefs(20, "storm"));
  });

  it("чужие строки — не вид (cloudy, thunder — прежние имена, не панели)", () => {
    for (const v of ["cloudy", "thunder", "", null, 3]) expect(isWeatherKind(v)).toBe(false);
  });
});

describe("итог: стандарт 1 не в среднем, иначе (t + w) / 2", () => {
  it("weatherMix: t = 1 → w, w = 1 → t, оба 1 → 1, иначе среднее", () => {
    expect(weatherMix(1, 4)).toBe(4);
    expect(weatherMix(0.7, 1)).toBe(0.7);
    expect(weatherMix(1, 1)).toBe(1);
    expect(weatherMix(0, 4)).toBe(2);
    expect(weatherMix(0.1, 0.01)).toBe(0.055);
  });

  it("примеры владельца (рыба): ясно +40 → 4, шторм +40 → 2, ясно −35 → 0, шторм 0° → 0, пасмурно +20 → 3", () => {
    expect(weatherCoefs(40, "clear").fish).toBe(4);
    expect(weatherCoefs(40, "storm").fish).toBe(2);
    expect(weatherCoefs(-35, "clear").fish).toBe(0);
    expect(weatherCoefs(0, "storm").fish).toBe(0);
    expect(weatherCoefs(20, "overcast").fish).toBe(3);
  });

  it("пример владельца (шахты): ясно и −5 → 0,7", () => {
    expect(weatherCoefs(-5, "clear").mine).toBe(0.7);
  });

  it("все пять: шторм и +40", () => {
    expect(weatherCoefs(40, "storm")).toEqual(c(2, 0.01, 1.005, 5, 10));
  });

  it("метель и −40: рыба не клюёт, ход корабля ×10", () => {
    expect(weatherCoefs(-40, "blizzard")).toEqual(c(0, 0.055, 0.055, 3.5, 10));
  });

  it("пасмурно и 0", () => {
    expect(weatherCoefs(0, "overcast")).toEqual(c(4, 0.6, 0.6, 2, 2));
  });

  it("холодно (−12) и туман — оба не 1, везде среднее", () => {
    expect(weatherCoefs(-12, "fog")).toEqual(c(2.25, 0.45, 0.45, 1.75, 3));
  });

  it("нет погоды — все 1", () => {
    expect(NO_WEATHER).toEqual(c(1, 1, 1, 1, 1));
  });
});

describe("правила значка", () => {
  it("ясно — всегда clear", () => {
    for (const t of [-40, 0, 40]) expect(weatherKindChoices("clear", t)).toEqual(["clear"]);
  });

  it("пасмурно: в минус — overcast или fog, дождя нет; с нуля — overcast, fog, rain поровну", () => {
    expect(weatherKindChoices("overcast", -1)).toEqual(["overcast", "fog"]);
    expect(weatherKindChoices("overcast", 0)).toEqual(["overcast", "fog", "rain"]);
    expect(weatherKindFor("overcast", -1, 0)).toBe("overcast");
    expect(weatherKindFor("overcast", -1, 0.5)).toBe("fog");
    expect(weatherKindFor("overcast", -1, 0.9999)).toBe("fog");
    expect(weatherKindFor("overcast", 5, 0.34)).toBe("fog");
    expect(weatherKindFor("overcast", 5, 0.9999)).toBe("rain");
  });

  it("шторм: метель только в минус; с нуля — шторм или гроза поровну", () => {
    expect(weatherKindChoices("storm", -1)).toEqual(["blizzard"]);
    expect(weatherKindChoices("storm", 0)).toEqual(["storm", "thunderstorm"]);
    expect(weatherKindFor("storm", -40, 0.99)).toBe("blizzard");
    expect(weatherKindFor("storm", 0, 0.49)).toBe("storm");
    expect(weatherKindFor("storm", 0, 0.5)).toBe("thunderstorm");
  });

  it("на всём диапазоне: в минус нет дождя, грозы и шторма; с нуля нет метели", () => {
    for (let t = -40; t <= 40; t++)
      for (const level of ["clear", "overcast", "storm"] as const) {
        const kinds = weatherKindChoices(level, t);
        if (t < 0)
          expect(kinds.some((k) => k === "rain" || k === "storm" || k === "thunderstorm")).toBe(
            false,
          );
        else expect(kinds).not.toContain("blizzard");
      }
  });
});

describe("температура первого слота", () => {
  it("любая точка сетки −40…+40 через 10", () => {
    expect(weatherFirstTemp(0)).toBe(-40);
    expect(weatherFirstTemp(0.5)).toBe(0);
    expect(weatherFirstTemp(0.99999)).toBe(40);
    for (let i = 0; i < 100; i++) expect(Math.abs(weatherFirstTemp(i / 100) % 10)).toBe(0);
  });
});

describe("слоты по Москве: днём 12–20 раз в 2 ч, ночью и утром — раз в 4 ч", () => {
  const msk = (iso: string) => Date.parse(`${iso}+03:00`);
  const slot = (iso: string) => {
    const at = msk(iso);
    return [weatherSlotStart(at).getTime(), weatherNextAt(at).getTime()];
  };
  it("ночь и утро — 00, 04, 08 (по 4 ч), вечер 20–24", () => {
    expect(slot("2026-10-27T02:59:59")).toEqual([
      msk("2026-10-27T00:00:00"),
      msk("2026-10-27T04:00:00"),
    ]);
    expect(slot("2026-10-27T05:30:00")).toEqual([
      msk("2026-10-27T04:00:00"),
      msk("2026-10-27T08:00:00"),
    ]);
    expect(slot("2026-10-27T11:59:00")).toEqual([
      msk("2026-10-27T08:00:00"),
      msk("2026-10-27T12:00:00"),
    ]);
    expect(slot("2026-10-27T23:00:00")).toEqual([
      msk("2026-10-27T20:00:00"),
      msk("2026-10-28T00:00:00"),
    ]);
  });
  it("день — 12, 14, 16, 18 (по 2 ч)", () => {
    expect(slot("2026-10-27T12:00:00")).toEqual([
      msk("2026-10-27T12:00:00"),
      msk("2026-10-27T14:00:00"),
    ]);
    expect(slot("2026-10-27T17:59:59")).toEqual([
      msk("2026-10-27T16:00:00"),
      msk("2026-10-27T18:00:00"),
    ]);
    expect(slot("2026-10-27T19:00:00")).toEqual([
      msk("2026-10-27T18:00:00"),
      msk("2026-10-27T20:00:00"),
    ]);
  });
  it("восемь смен в сутки — в среднем те же 3 ч", () => {
    expect(WEATHER_SLOT_HOURS).toHaveLength(8);
  });
});
