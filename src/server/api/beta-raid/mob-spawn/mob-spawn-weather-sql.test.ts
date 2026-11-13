// Погодные точки возрождения (§8.49б): встают в свою погоду, уходят, когда она кончилась.
import { describe, expect, it } from "vitest";
import { leaveSql, leavingSql, weatherNowSql, weatherSlotsSql } from "./mob-spawn-weather-sql";
import { dueSql } from "./mob-spawn-sql";
import {
  SPAWN_FROST_C,
  SPAWN_HEAT_C,
  SPAWN_WEATHER,
  isSpawnWeather,
  spawnWeathers,
  spawnWeathersText,
} from "@/lib/raid/mobSpawn";

describe("погода точки", () => {
  it("встаёт в любую из отмеченных погод или в любую, если не отмечено", () => {
    const sql = dueSql().replace(/\s+/g, " ");
    expect(sql).toContain(
      "NOT COALESCE(cardinality(COALESCE(s.weathers, CASE WHEN s.weather IS NULL",
    );
    expect(sql).toContain(
      "FROM unnest(COALESCE(s.weathers, CASE WHEN s.weather IS NULL THEN NULL ELSE ARRAY[s.weather] END)) x(v)",
    );
    expect(sql).toContain("ELSE w.kind = x.v END");
    expect(sql).toContain("w.slot_at = yuplink.raid_weather_slot(now())");
    expect(weatherNowSql("s")).toContain(`w.temp_c <= ${SPAWN_FROST_C}`);
    expect(weatherNowSql("s")).toContain(`w.temp_c >= ${SPAWN_HEAT_C}`);
  });

  it("уходят только живые не раненые точки с погодой, когда в мире другая", () => {
    const sql = leavingSql().replace(/\s+/g, " ");
    expect(sql).toContain("END)), 0) > 0 AND s.dead_at IS NULL");
    expect(sql).toContain("AND NOT EXISTS (SELECT 1 FROM unnest(");
    expect(sql).toContain("h.current_hp < h.max_hp");
  });

  it("уход: клетка, hp целого и точка — одним оператором, условия перепроверены", () => {
    const sql = leaveSql(["msp_1", "o'k"]);
    expect(sql).toContain("s.id IN ('msp_1', 'o''k')");
    expect(sql).toContain("FOR UPDATE OF s");
    expect(sql).toContain("SET object_id = NULL, object_config = NULL");
    expect(sql).toContain("c.object_id = g.object_id");
    expect(sql).toContain("h.killed_at IS NULL");
    expect(sql).toContain("SET dead_at = now(), cur_q = NULL, cur_r = NULL");
  });

  it("слот погоды заводится до проверки, острова — мимо", () => {
    expect(weatherSlotsSql()).toContain("raid_weather_ensure(m.map_id, now())");
    expect(weatherSlotsSql()).toContain("left(map_id, 5) <> 'isle_'");
  });

  it("погода списком: из базы (массив или старая одна), без мусора, по порядку", () => {
    expect(spawnWeathers(["fog", "rain", "hail", "rain"])).toEqual(["rain", "fog"]);
    expect(spawnWeathers(null, "frost")).toEqual(["frost"]);
    expect(spawnWeathers(null, null)).toEqual([]);
    expect(spawnWeathersText(["rain", "fog"], false)).toBe("дождь, туман");
    expect(spawnWeathersText([], false)).toBe("любая погода");
    expect(spawnWeathersText([], true)).toBe("any weather");
  });

  it("список погод — тот же, что CHECK миграции", () => {
    expect(SPAWN_WEATHER).toHaveLength(10);
    expect(isSpawnWeather("frost")).toBe(true);
    expect(isSpawnWeather("snow")).toBe(true); // снег — с 09.11 (weather-09)
    expect(isSpawnWeather("hail")).toBe(false);
  });
});
