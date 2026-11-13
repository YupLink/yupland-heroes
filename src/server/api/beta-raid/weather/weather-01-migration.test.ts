// weather-01: формулы базы и TS совпадают — таблицы коэффициентов из SQL
// пересчитываются по правилу базы (первая строка «до °C» не меньше температуры;
// «стандарт» 1 в среднем не участвует, иначе (t + w) / 2, round 4) и сверяются с
// weatherCoefs на всём −40…+40 и всех видах;
// значки, шаг ±20, слот 3 ч, флаг влияния, конкурентная вставка.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WEATHER_COEF_KEYS,
  WEATHER_KINDS,
  WEATHER_LEVELS,
  WEATHER_LEVEL_COEFS,
  WEATHER_LEVEL_KINDS,
  WEATHER_SLOT_MS,
  WEATHER_TEMP_BANDS,
  WEATHER_TEMP_MAX,
  WEATHER_TEMP_MIN,
  WEATHER_TEMP_STEP,
  weatherCoefs,
  weatherKindChoices,
  weatherLevelOf,
} from "@/lib/raid/weather";

const raw = readFileSync(
  new URL("../../../../../migrations/weather-01.sql", import.meta.url),
  "utf8",
);
const flat = raw.replace(/\s+/g, " ");

const between = (from: string, to: string): string => {
  const a = raw.indexOf(from);
  const b = raw.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`нет блока ${from}`);
  return raw.slice(a + from.length, b);
};
const fnBody = (name: string): string => {
  const at = flat.indexOf(`CREATE OR REPLACE FUNCTION yuplink.${name}(`);
  if (at < 0) throw new Error(`нет функции ${name}`);
  return flat.slice(at, flat.indexOf("$fn$;", at));
};
const nums = (s: string): number[] => s.split(",").map((x) => Number(x.trim()));

/** Строки VALUES температуры: [до °C, рыба, шахты, фермы, ход, корабль]. */
const tempRows = [...between("-- weather-temp:", "-- /weather-temp").matchAll(/\(([^()]*)\)/g)].map(
  (m) => nums(m[1]),
);
/** Строки VALUES уровня: уровень → [рыба, шахты, фермы, ход, корабль]. */
const levelRows = new Map(
  [...between("-- weather-level:", "-- /weather-level").matchAll(/\('(\w+)',([^()]*)\)/g)].map(
    (m) => [m[1], nums(m[2])],
  ),
);

/** Коэффициент по правилу базы (raid_weather_coef_of). */
function sqlCoef(temp: number, level: string, what: number): number | null {
  const t = [...tempRows].sort((a, b) => a[0] - b[0]).find((r) => temp <= r[0]);
  const w = levelRows.get(level);
  if (!t || !w) return null;
  const tc = t[1 + what];
  const wc = w[what];
  if (tc === 1) return wc;
  if (wc === 1) return tc;
  return Math.round(((tc + wc) / 2) * 10_000) / 10_000;
}

describe("weather-01: таблицы коэффициентов — как в TS", () => {
  it("температура: пять строк, границы и числа — WEATHER_TEMP_BANDS", () => {
    expect(tempRows).toEqual(
      WEATHER_TEMP_BANDS.map((b) => [b.upTo, ...WEATHER_COEF_KEYS.map((k) => b.coefs[k])]),
    );
  });

  it("уровень: три строки — WEATHER_LEVEL_COEFS", () => {
    expect([...levelRows.keys()]).toEqual([...WEATHER_LEVELS]);
    for (const level of WEATHER_LEVELS)
      expect(levelRows.get(level)).toEqual(
        WEATHER_COEF_KEYS.map((k) => WEATHER_LEVEL_COEFS[level][k]),
      );
  });

  it("итог базы = weatherCoefs на всём −40…+40 и всех семи видах", () => {
    for (let t = WEATHER_TEMP_MIN; t <= WEATHER_TEMP_MAX; t++)
      for (const kind of WEATHER_KINDS) {
        const ts = weatherCoefs(t, kind);
        WEATHER_COEF_KEYS.forEach((k, i) =>
          expect(sqlCoef(t, weatherLevelOf(kind), i)).toBe(ts[k]),
        );
      }
  });

  it("столбцы CASE — в порядке fish, mine, farm, step, ship; стандарт 1 не в среднем", () => {
    const body = fnBody("raid_weather_coef_of");
    expect(body).toContain(
      "SELECT CASE WHEN t.c = 1 THEN w.c WHEN w.c = 1 THEN t.c ELSE round((t.c + w.c) / 2, 4) END",
    );
    for (const alias of ["b", "l"])
      expect(body).toContain(
        WEATHER_COEF_KEYS.map((k) => `WHEN '${k}' THEN ${alias}.${k}`).join(" "),
      );
    expect(body).toContain("AS b(upto, fish, mine, farm, step, ship)");
    expect(body).toContain("AS l(level, fish, mine, farm, step, ship)");
    expect(body).toContain("WHERE p_temp <= b.upto ORDER BY b.upto LIMIT 1");
  });
});

describe("weather-01: значок и уровень", () => {
  it("raid_weather_kind_for — те же списки, что weatherKindChoices", () => {
    const body = fnBody("raid_weather_kind_for");
    const arr = (level: (typeof WEATHER_LEVELS)[number], t: number) =>
      `ARRAY[${weatherKindChoices(level, t)
        .map((k) => `'${k}'`)
        .join(", ")}]`;
    expect(body).toContain(`WHEN p_level = 'clear' THEN ${arr("clear", 0)}`);
    expect(body).toContain(`WHEN p_level = 'overcast' AND p_temp < 0 THEN ${arr("overcast", -1)}`);
    expect(body).toContain(`WHEN p_level = 'overcast' THEN ${arr("overcast", 0)}`);
    expect(body).toContain(`WHEN p_temp < 0 THEN ${arr("storm", -1)} ELSE ${arr("storm", 0)}`);
    // Поровну, rnd = 1 не выходит за край — как pick в TS.
    expect(body).toContain(
      "x.k[1 + least(cardinality(x.k) - 1, greatest(0, floor(p_rnd * cardinality(x.k))::int))]",
    );
  });

  it("проверка строки: виды уровня и знак температуры — как в TS", () => {
    expect(flat).toContain("(level = 'clear' AND kind = 'clear')");
    expect(flat).toContain(
      "(level = 'overcast' AND (kind IN ('overcast', 'fog') OR (kind = 'rain' AND temp_c >= 0)))",
    );
    expect(flat).toContain(
      "(level = 'storm' AND ((kind = 'blizzard' AND temp_c < 0) OR (kind IN ('storm', 'thunderstorm') AND temp_c >= 0)))",
    );
    // + снег при −10 °C и ниже (weather-09-snow, проверка строки пересоздана там).
    expect(WEATHER_LEVEL_KINDS.overcast).toEqual(["overcast", "fog", "rain", "snow"]);
    expect(WEATHER_LEVEL_KINDS.storm).toEqual(["storm", "thunderstorm", "blizzard"]);
    expect(flat).toContain(
      `temp_c int NOT NULL CHECK (temp_c BETWEEN ${WEATHER_TEMP_MIN} AND ${WEATHER_TEMP_MAX})`,
    );
  });

  it("уровень — три поровну", () => {
    expect(fnBody("raid_weather_ensure")).toContain(
      "v_lvl := (ARRAY['clear', 'overcast', 'storm'])[1 + least(2, floor(random() * 3)::int)];",
    );
    expect([...WEATHER_LEVELS]).toEqual(["clear", "overcast", "storm"]);
  });
});

describe("weather-01: генератор и слот", () => {
  const ensure = fnBody("raid_weather_ensure");

  it("слот — 3 часа от полуночи UTC", () => {
    expect(WEATHER_SLOT_MS).toBe(3 * 3600_000);
    expect(fnBody("raid_weather_slot")).toContain(
      "date_bin(interval '3 hours', p_at, timestamptz '2000-01-01 00:00:00+00')",
    );
    expect(ensure).toContain("v_at := v_at + interval '3 hours';");
  });

  it("температура: первый слот −40…+40, дальше ±20 с обрезкой, поровну", () => {
    expect(ensure).toContain(`v_lo := ${WEATHER_TEMP_MIN}; v_hi := ${WEATHER_TEMP_MAX};`);
    expect(ensure).toContain(
      `v_lo := greatest(${WEATHER_TEMP_MIN}, v_row.temp_c - ${WEATHER_TEMP_STEP});`,
    );
    expect(ensure).toContain(
      `v_hi := least(${WEATHER_TEMP_MAX}, v_row.temp_c + ${WEATHER_TEMP_STEP});`,
    );
    expect(ensure).toContain(
      "v_t := v_lo + least(v_hi - v_lo, floor(random() * (v_hi - v_lo + 1))::int);",
    );
  });

  it("конкурентно: ON CONFLICT DO NOTHING, потом цепочка дальше от записанного", () => {
    const ins = ensure.indexOf("ON CONFLICT (map_id, slot_at) DO NOTHING;");
    const read = ensure.indexOf(
      "SELECT * INTO v_row FROM yuplink.raid_weather w WHERE w.map_id = p_map AND w.slot_at = v_at;",
    );
    expect(ins).toBeGreaterThan(0);
    expect(read).toBeGreaterThan(ins);
  });

  it("остров и неизвестная карта — без погоды; прошлое не дописывается", () => {
    expect(ensure).toContain("left(p_map, 5) = 'isle_'");
    expect(ensure).toContain("EXISTS (SELECT 1 FROM yuplink.raid_island i WHERE i.map_id = p_map)");
    expect(ensure).toContain("NOT EXISTS (SELECT 1 FROM yuplink.raid_maps m WHERE m.id = p_map)");
    expect(ensure).toContain("w.slot_at > v_slot) THEN RETURN NULL;");
  });

  it("fx нового слота — флаг сейчас; кончившийся слот (задним числом) — false", () => {
    expect(flat).toContain("fx boolean NOT NULL DEFAULT false,");
    expect(flat).toContain(
      "ALTER TABLE yuplink.raid_weather ADD COLUMN IF NOT EXISTS fx boolean NOT NULL DEFAULT false;",
    );
    expect(ensure).toContain(
      "v_fx := EXISTS (SELECT 1 FROM yuplink.settings s WHERE s.key = 'weather_effects' AND btrim(s.value, ' \"') = 'on');",
    );
    expect(ensure).toContain(
      "INSERT INTO yuplink.raid_weather (map_id, slot_at, temp_c, level, kind, fx)",
    );
    expect(ensure).toContain("v_fx AND v_at + interval '3 hours' > now())");
    // Существующий слот возвращается как есть — fx не переписывается.
    expect(ensure).not.toMatch(/UPDATE yuplink\.raid_weather/);
  });

  it("обход: открытые карты и главный мир, без островов, один порядок", () => {
    const tick = fnBody("raid_weather_tick");
    expect(tick).toContain("rm.active OR rm.id = (SELECT (s.value::jsonb)->>'mapId'");
    expect(tick).toContain("left(rm.id, 5) <> 'isle_'");
    expect(tick).toContain("ORDER BY rm.id");
  });
});

describe("weather-01: raid_weather_coef", () => {
  const coef = fnBody("raid_weather_coef");

  it("STABLE, по ключу слота, 1 — остров, нет строки, у слота fx false; settings не читает", () => {
    expect(coef).toContain("RETURNS numeric LANGUAGE sql STABLE");
    expect(coef).toContain("w.slot_at = yuplink.raid_weather_slot(COALESCE(p_at, now()))");
    expect(coef).toContain("left(p_map, 5) <> 'isle_'");
    expect(coef).toContain("AND w.fx ), 1::numeric)");
    expect(coef).not.toContain("settings");
  });

  it("транзакция и повтор безвреден", () => {
    expect(flat.trim().startsWith("--")).toBe(true);
    expect(flat).toContain("BEGIN;");
    expect(flat.trim().endsWith("COMMIT;")).toBe(true);
    expect(flat).toContain("CREATE TABLE IF NOT EXISTS yuplink.raid_weather (");
    expect(flat).toContain("PRIMARY KEY (map_id, slot_at)");
    expect(flat.match(/CREATE FUNCTION/g)).toBeNull();
  });
});
