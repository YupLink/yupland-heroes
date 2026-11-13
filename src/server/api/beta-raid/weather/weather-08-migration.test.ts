// weather-08: климат мира. Числа и списки базы = кода (климат «как всегда», аномальные точки,
// коэффициенты аномалии и таблицы weather-01), генератор слота отличается от weather-07 ровно
// бросками с климатом и штормом аномалии, обряд — от weather-06 ровно проверкой «можно ли».
// Совпадение бросков базы и кода (распределения, голоса, первый слот, значок, 4 000 полных
// бросков с климатами и аномалиями) и неизменность мира без климата (те же списки, что у
// функций прода) сверены на проде только чтением: тела SQL-функций файла — как SELECT.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WEATHER_ANOMALY_COEFS,
  WEATHER_ANOMALY_TEMPS,
  WEATHER_COEF_KEYS,
  WEATHER_LEVELS,
  WEATHER_TEMP_BANDS,
} from "@/lib/raid/weather";
import { WEATHER_CLIMATE_DEFAULT, WEATHER_CLIMATE_TEMPS } from "@/lib/raid/weatherClimate";

const read = (f: string) =>
  readFileSync(new URL(`../../../../../migrations/${f}`, import.meta.url), "utf8");
const raw = read("weather-08-climate.sql");
const flat = raw.replace(/\s+/g, " ");
const fnBody = (src: string, name: string, end = "$fn$;"): string => {
  const f = src.replace(/\s+/g, " ");
  const at = f.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  if (at < 0) throw new Error(`нет функции ${name}`);
  return f.slice(at, f.indexOf(end, at));
};
const between = (from: string, to: string) =>
  raw.slice(raw.indexOf(from) + from.length, raw.indexOf(to));
/** Строки тела функции без комментариев и пустых. */
const lines = (src: string, name: string): string[] => {
  const at = src.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  return src
    .slice(src.indexOf("BEGIN", at), src.indexOf("END $function$", at))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--"));
};
const diff = (a: string[], b: string[]) => a.filter((l) => !b.includes(l));

describe("weather-08: климат и аномалия — те же числа, что в коде", () => {
  it("климат «как всегда» и сетка границ", () => {
    const block = between("-- weather-climate-default:", "-- /weather-climate-default");
    const json = JSON.parse(block.slice(block.indexOf("'") + 1, block.lastIndexOf("'")));
    expect(json).toEqual({ ...WEATHER_CLIMATE_DEFAULT, levels: [...WEATHER_LEVELS] });
    const grid = `(${WEATHER_CLIMATE_TEMPS.join(", ")})`;
    expect(flat).toContain(`v_min NOT IN ${grid}`);
    expect(flat).toContain(`v_max NOT IN ${grid}`);
    expect(flat).toContain(`c_lv CONSTANT text[] := ARRAY['clear', 'overcast', 'storm'];`);
  });

  it("лестница: холод снизу, жара сверху — те же точки", () => {
    const ladder = fnBody(raw, "raid_weather_temp_ladder");
    expect(ladder).toContain(
      `unnest(ARRAY[${WEATHER_ANOMALY_TEMPS.cold.join(", ")}]) AS a(t) WHERE p_climate ->> 'anomaly' = 'cold'`,
    );
    expect(ladder).toContain(
      `unnest(ARRAY[${WEATHER_ANOMALY_TEMPS.heat.join(", ")}]) AS a(t) WHERE p_climate ->> 'anomaly' = 'heat'`,
    );
    expect(ladder).toContain("ORDER BY 1)");
  });

  it("коэффициенты аномалии — WEATHER_ANOMALY_COEFS; таблицы смеси — как weather-01 и TS", () => {
    const anomaly = between("-- weather-anomaly:", "-- /weather-anomaly");
    for (const k of WEATHER_COEF_KEYS)
      expect(anomaly.replace(/\s+/g, " ")).toContain(
        `WHEN '${k}' THEN ${WEATHER_ANOMALY_COEFS[k]}`,
      );
    expect(fnBody(raw, "raid_weather_coef_of")).toContain(
      "SELECT CASE WHEN p_temp <= -50 OR p_temp >= 50 THEN (",
    );
    const table = (src: string) =>
      src.slice(src.indexOf("-- weather-temp:"), src.indexOf("-- /weather-level"));
    expect(table(raw)).toBe(table(read("weather-01.sql")));
    const rows = [...between("-- weather-temp:", "-- /weather-temp").matchAll(/\(([^()]*)\)/g)].map(
      (m) => m[1].split(",").map(Number),
    );
    expect(rows).toEqual(
      WEATHER_TEMP_BANDS.map((b) => [b.upTo, ...WEATHER_COEF_KEYS.map((k) => b.coefs[k])]),
    );
  });

  it("строки погоды: −60…+60, огненный дождь — только при +50 и выше, метель-аномалия — шторм", () => {
    expect(flat).toContain("CHECK (temp_c BETWEEN -60 AND 60)");
    expect(flat).toContain("OR (temp_c <= -50 AND level = 'storm' AND kind = 'blizzard')");
    expect(flat).toContain("OR (temp_c >= 50 AND level = 'storm' AND kind = 'fire_rain'));");
    expect(flat).toContain("(temp_c BETWEEN -40 AND 40 AND ( (level = 'clear' AND kind = 'clear')");
  });

  it("значок: аномалия первой, огненный дождь вне аномалии не держится", () => {
    const kind = fnBody(raw, "raid_weather_next_kind");
    expect(kind).toContain("WHEN p_temp <= -50 THEN 'blizzard' WHEN p_temp >= 50 THEN 'fire_rain'");
    expect(kind).toContain("AND p_prev_kind <> 'fire_rain'");
  });
});

describe("weather-08: генератор слота = weather-07 + климат", () => {
  const was = lines(read("weather-07-schedule.sql"), "raid_weather_ensure");
  const now = lines(raw, "raid_weather_ensure");

  it("убраны ровно прежние броски, добавлены — с климатом и штормом аномалии", () => {
    expect(diff(was, now)).toEqual([
      "v_t := (least(8, floor(random() * 9)::int) - 4) * 10;",
      "v_lvl := (ARRAY['clear', 'overcast', 'storm'])[1 + least(2, floor(random() * 3)::int)];",
      "yuplink.raid_weather_temp_dist(v_row.temp_c, v_odds),",
      "yuplink.raid_weather_temp_votes(v_row.temp_c, v_votes)), random()) #>> '{}')::int;",
      "yuplink.raid_weather_level_dist(v_row.level, v_odds), v_votes), random()) #>> '{}';",
    ]);
    expect(diff(now, was)).toEqual([
      "v_cl := yuplink.raid_weather_climate(p_map);",
      "v_t := yuplink.raid_weather_first_temp(v_cl, random());",
      "v_lvl := yuplink.raid_weather_first_level(v_cl, random());",
      "yuplink.raid_weather_temp_dist_in(v_row.temp_c, v_odds, v_cl),",
      "yuplink.raid_weather_temp_votes_in(v_row.temp_c, v_votes, v_cl)), random()) #>> '{}')::int;",
      "yuplink.raid_weather_level_dist_in(v_row.level, v_odds, v_cl), v_votes), random()) #>> '{}';",
      "IF v_t <= -50 OR v_t >= 50 THEN",
      "v_lvl := 'storm';",
    ]);
  });

  it("порядок случайных чисел прежний: температура, уровень, значок", () => {
    const body = fnBody(raw, "raid_weather_ensure", "$function$;");
    const at = (s: string) => body.indexOf(s);
    expect(at("raid_weather_first_temp")).toBeLessThan(at("raid_weather_first_level"));
    expect(at("raid_weather_first_level")).toBeLessThan(
      at("raid_weather_kind_for(v_lvl, v_t, random())"),
    );
    expect(at("raid_weather_temp_dist_in")).toBeLessThan(at("raid_weather_level_dist_in"));
    expect(at("v_lvl := 'storm';")).toBeLessThan(at("raid_weather_next_kind("));
  });
});

describe("weather-08: обряд = weather-06 + климат", () => {
  const was = lines(read("weather-06-odds-per-world.sql"), "raid_weather_ritual");
  const now = lines(raw, "raid_weather_ritual");
  it("«можно ли» — ступени лестницы и уровни мира; остальное как было", () => {
    expect(diff(was, now)).toEqual([
      "v_base := yuplink.raid_weather_temp_base(v_row.temp_c);",
      "IF (p_target = 'warmer' AND v_base + 10 > 40)",
      "OR (p_target = 'colder' AND v_base - 10 < -40)",
      "AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(",
      "WHERE x ->> 'v' = p_target)) THEN",
    ]);
    const body = fnBody(raw, "raid_weather_ritual", "$function$;");
    expect(body).toContain("yuplink.raid_weather_temp_step(v_row.temp_c, v_cl, 1) IS NULL");
    expect(body).toContain("yuplink.raid_weather_temp_step(v_row.temp_c, v_cl, -1) IS NULL");
    expect(body).toContain("(v_cl -> 'levels') ? v_row.level AND (v_cl -> 'levels') ? p_target");
  });
});

describe("weather-08: файл", () => {
  it("одной транзакцией, функции — CREATE OR REPLACE, ограничения пересоздаются", () => {
    expect(flat.trim().startsWith("--")).toBe(true);
    expect(flat).toContain("BEGIN; SET LOCAL lock_timeout = '5s';");
    expect(flat.trim().endsWith("COMMIT;")).toBe(true);
    expect(flat.match(/CREATE FUNCTION/g)).toBeNull();
    expect(flat.match(/ADD CONSTRAINT (\w+)/g)?.length).toBe(
      flat.match(/DROP CONSTRAINT IF EXISTS/g)?.length,
    );
    // Данные не трогает: ни настроек, ни строк погоды.
    expect(flat).not.toMatch(/UPDATE yuplink\.|DELETE FROM|INSERT INTO yuplink\.settings/);
  });
});
