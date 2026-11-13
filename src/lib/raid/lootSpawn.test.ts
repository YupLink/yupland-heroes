import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  LOOT_SPAWN_ART_MAX,
  LOOT_SPAWN_MAX,
  amountRangeText,
  parseAmountRange,
} from "./lootSpawn";
import { SPAWN_FROST_C, SPAWN_HEAT_C, SPAWN_WEATHER } from "./mobSpawn";

describe("добыча по погоде", () => {
  it("количество — одно поле «1-10» или число", () => {
    expect(parseAmountRange("1-10")).toEqual({ min: 1, max: 10 });
    expect(parseAmountRange(" 5 ")).toEqual({ min: 5, max: 5 });
    expect(parseAmountRange("3 – 7")).toEqual({ min: 3, max: 7 });
    expect(parseAmountRange("10-1")).toBeNull();
    expect(parseAmountRange("0")).toBeNull();
    expect(parseAmountRange("abc")).toBeNull();
    expect(parseAmountRange(`1-${LOOT_SPAWN_MAX + 1}`)).toBeNull();
    expect(amountRangeText(2, 2)).toBe("2");
    expect(amountRangeText(1, 10)).toBe("1-10");
  });

  it("база — те же погоды, пороги и предел артефактов (loot-spawn-01)", () => {
    // Снег добавлен позже (weather-09-snow) — CHECK пересоздан там.
    const sql =
      readFileSync("migrations/loot-spawn-01.sql", "utf8") +
      readFileSync("migrations/weather-09-snow.sql", "utf8");
    for (const w of SPAWN_WEATHER) expect(sql).toContain(`'${w}'`);
    expect(sql).toContain(`w.temp_c <= ${SPAWN_FROST_C}`);
    expect(sql).toContain(`w.temp_c >= ${SPAWN_HEAT_C}`);
    expect(sql).toContain(`LEAST(v_n, ${LOOT_SPAWN_ART_MAX})`);
  });
});
