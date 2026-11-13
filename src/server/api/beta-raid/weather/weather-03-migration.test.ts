// weather-03: значения по умолчанию в базе = в коде; генератор слота зовёт новые
// функции (уровень, температура, значок), а не старый бросок «поровну». Совпадение
// бросков базы и кода сверено на проде в откатываемой транзакции (3 621 случай).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WEATHER_ODDS_DEFAULT, WEATHER_ODDS_KEYS } from "@/lib/raid/weatherOdds";

const raw = readFileSync(
  new URL("../../../../../migrations/weather-03-odds.sql", import.meta.url),
  "utf8",
);
const flat = raw.replace(/\s+/g, " ");
const fnBody = (name: string): string => {
  const at = flat.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  if (at < 0) throw new Error(`нет функции ${name}`);
  return flat.slice(at, flat.indexOf("$fn$;", at));
};

describe("weather-03: шансы смены погоды", () => {
  it("значения по умолчанию — те же, что в коде", () => {
    const block = raw.slice(
      raw.indexOf("-- weather-odds-default:"),
      raw.indexOf("-- /weather-odds-default"),
    );
    const json = JSON.parse(block.slice(block.indexOf("'") + 1, block.lastIndexOf("'")));
    expect(json).toEqual(WEATHER_ODDS_DEFAULT);
    expect(Object.keys(json).sort()).toEqual([...WEATHER_ODDS_KEYS].sort());
  });

  it("следующий слот — по шансам, первый — поровну", () => {
    const ensure = fnBody("raid_weather_ensure");
    expect(ensure).toContain("v_odds := yuplink.raid_weather_odds();");
    expect(ensure).toContain("yuplink.raid_weather_next_temp(v_row.temp_c, v_odds, random())");
    expect(ensure).toContain("yuplink.raid_weather_next_level(v_row.level, v_odds, random())");
    expect(ensure).toContain(
      "yuplink.raid_weather_next_kind(v_row.level, v_row.kind, v_lvl, v_t, random())",
    );
    expect(ensure).toContain("(least(8, floor(random() * 9)::int) - 4) * 10");
  });

  it("температура: −10 / та же / +10, только внутри −40…+40", () => {
    const temp = fnBody("raid_weather_next_temp");
    expect(temp).toContain("ARRAY[-10, 0, 10]");
    expect(temp).toContain("BETWEEN -40 AND 40");
    expect(temp).toContain("floor((p_prev + 5) / 10.0)");
  });

  it("битая настройка — значения по умолчанию, погода не встаёт", () => {
    const odds = fnBody("raid_weather_odds");
    expect(odds).toContain("EXCEPTION WHEN others THEN RETURN v_def;");
    expect(odds).toMatch(/NOT BETWEEN 0 AND 100 THEN RETURN v_def;/);
  });
});
