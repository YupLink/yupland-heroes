// Обряд шамана (владелец, 28.10.2026): +3 % выбранному на ближайшую смену, голос за
// другое забирает обратно, потолок 90 %, голосовать — только за то, что может выпасть.
import { describe, expect, it } from "vitest";
import { WEATHER_ODDS_DEFAULT, nextLevelOdds, type Chance } from "@/lib/raid/weatherOdds";
import {
  applyVotes,
  forecastWithVotes,
  levelVotes,
  ritualTargets,
  tempVotes,
} from "@/lib/raid/weatherRitual";

const D = WEATHER_ODDS_DEFAULT;
const pct = <T>(list: Chance<T>[]) => list.map((c) => [c.value, Math.round(c.p * 100) / 100]);
const votes = (o: Record<string, number>) => new Map(Object.entries(o));

describe("голоса поверх шансов", () => {
  it("без голосов — как было", () => {
    expect(applyVotes(nextLevelOdds("clear", D), votes({}))).toEqual(nextLevelOdds("clear", D));
  });

  it("два исхода: каждый голос ±3 % (10 за ясно и 4 против — +18)", () => {
    expect(pct(applyVotes(nextLevelOdds("clear", D), votes({ clear: 10 })))).toEqual([
      ["overcast", 20],
      ["clear", 80],
    ]);
    expect(pct(applyVotes(nextLevelOdds("clear", D), votes({ clear: 10, overcast: 4 })))).toEqual([
      ["overcast", 32],
      ["clear", 68],
    ]);
  });

  it("три исхода: свои 3 % берутся у остальных пропорционально", () => {
    expect(pct(applyVotes(nextLevelOdds("overcast", D), votes({ storm: 5 })))).toEqual([
      ["clear", 20],
      ["storm", 40],
      ["overcast", 40],
    ]);
  });

  it("потолок 90 %: 30 голосов за ясно — 90, не 100", () => {
    expect(pct(applyVotes(nextLevelOdds("clear", D), votes({ clear: 30 })))).toEqual([
      ["overcast", 10],
      ["clear", 90],
    ]);
  });

  it("голос за то, чего не будет, не считается", () => {
    expect(applyVotes(nextLevelOdds("clear", D), votes({ storm: 7 }))).toEqual(
      nextLevelOdds("clear", D),
    );
  });

  it("шанс админа выше 90 голоса не опускают", () => {
    const sure = nextLevelOdds("storm", { ...D, stormToOvercast: 0 });
    expect(pct(applyVotes(sure, votes({ storm: 5 })))).toEqual([
      ["overcast", 0],
      ["storm", 100],
    ]);
  });

  it("сумма всегда 100", () => {
    for (const v of <Record<string, number>[]>[
      { clear: 3 },
      { clear: 40, storm: 2 },
      { overcast: 9, storm: 9, clear: 9 },
    ]) {
      const sum = applyVotes(nextLevelOdds("overcast", D), votes(v)).reduce((s, c) => s + c.p, 0);
      expect(sum).toBeCloseTo(100, 9);
    }
  });
});

describe("температура и прогноз", () => {
  it("«теплее» — +10 от точки сетки, «холоднее» — −10", () => {
    expect([...tempVotes(17, { warmer: 2, colder: 1 })]).toEqual([
      ["30", 2],
      ["10", 1],
    ]);
    expect([...levelVotes({ clear: 1, warmer: 4 })]).toEqual([["clear", 1]]);
  });

  it("прогноз с голосами: +20 и 10 голосов «теплее» — +30 становится 60 %", () => {
    const f = forecastWithVotes({ level: "clear", temperatureC: 20 }, D, { warmer: 10 });
    expect(pct(f.temps)).toEqual([
      [10, 17.14],
      [20, 22.86],
      [30, 60],
    ]);
  });

  it("за что можно голосовать: соседние уровни, шаг не за край", () => {
    expect(ritualTargets({ level: "clear", temperatureC: 0 })).toEqual([
      "clear",
      "overcast",
      "warmer",
      "colder",
    ]);
    expect(ritualTargets({ level: "overcast", temperatureC: 40 })).toEqual([
      "clear",
      "overcast",
      "storm",
      "colder",
    ]);
    expect(ritualTargets({ level: "storm", temperatureC: -38 })).toEqual([
      "overcast",
      "storm",
      "warmer",
    ]);
  });
});
