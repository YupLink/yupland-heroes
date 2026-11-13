// weather-09: снег — значок пасмурного уровня при −10 °C и ниже; база и TS совпадают.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WEATHER_SNOW_MAX_C,
  weatherCoefs,
  weatherKindChoices,
  weatherKindFor,
  weatherLevelOf,
} from "@/lib/raid/weather";
import { SPAWN_WEATHER } from "@/lib/raid/mobSpawn";

const flat = readFileSync(
  new URL("../../../../../migrations/weather-09-snow.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");
const arr = (list: readonly string[]) => `ARRAY[${list.map((k) => `'${k}'`).join(", ")}]`;

describe("снег (weather-09)", () => {
  it("«Холодно» и «Очень холодно» (−10 °C и ниже), пасмурно — поровну пасмурно / туман / снег", () => {
    expect(WEATHER_SNOW_MAX_C).toBe(-10);
    expect(weatherKindChoices("overcast", -10)).toEqual(["overcast", "fog", "snow"]);
    expect(weatherKindChoices("overcast", -40)).toEqual(["overcast", "fog", "snow"]);
    expect(weatherKindChoices("overcast", -9)).toEqual(["overcast", "fog"]);
    expect(weatherKindChoices("overcast", 5)).toEqual(["overcast", "fog", "rain"]);
    expect(weatherKindFor("overcast", -20, 0.9999)).toBe("snow");
    expect(weatherKindChoices("storm", -20)).toEqual(["blizzard"]);
  });

  it("снег — пасмурный уровень, коэффициенты как у пасмурно", () => {
    expect(weatherLevelOf("snow")).toBe("overcast");
    expect(weatherCoefs(-20, "snow")).toEqual(weatherCoefs(-20, "overcast"));
  });

  it("база: те же списки значков, снег держится только до −10 °C, проверка строки", () => {
    expect(flat).toContain(
      `WHEN p_level = 'overcast' AND p_temp <= -10 THEN ${arr(weatherKindChoices("overcast", -10))}`,
    );
    expect(flat).toContain(
      `WHEN p_level = 'overcast' AND p_temp < 0 THEN ${arr(weatherKindChoices("overcast", -1))}`,
    );
    expect(flat).toContain(
      `WHEN p_level = 'overcast' THEN ${arr(weatherKindChoices("overcast", 0))}`,
    );
    expect(flat).toContain("AND NOT (p_temp > -10 AND p_prev_kind = 'snow')");
    expect(flat).toContain("OR (kind = 'snow' AND temp_c <= -10)");
  });

  it("точки спавна: «снег» в списке и в проверках базы", () => {
    expect(SPAWN_WEATHER).toContain("snow");
    for (const name of [
      "raid_mob_spawn_weather_check",
      "raid_mob_spawn_weathers_check",
      "raid_loot_spawn_weather_check",
    ])
      expect(flat).toContain(`ADD CONSTRAINT ${name}`);
    expect(flat.match(/'heat', 'snow'/g)?.length).toBe(3);
  });
});
