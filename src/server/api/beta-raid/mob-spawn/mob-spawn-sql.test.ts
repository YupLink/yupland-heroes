// SQL точек возрождения: что в запросах есть то, на чём держатся правила.
// Весь цикл (включить → шаг → смерть → возрождение) прогнан на базе в
// транзакции с откатом 15.10.2026; здесь — сторожа текста запросов.
import { describe, expect, it } from "vitest";
import { moveObjectSql } from "@/server/api/beta-raid/god-move/move-object-sql";
import {
  deathsSql,
  dueSql,
  leaseSql,
  respawnSql,
  stepMarkSql,
  stepsSql,
  spawnFollowSql,
  syncConfigSql,
} from "./mob-spawn-sql";

const at = { mapId: "rmap_x", from: { q: 1, r: 2 }, to: { q: 2, r: 2 }, ref: "boss:rbt_a" };

describe("mob-spawn-sql", () => {
  it("проход один на все процессы — аренда минуты", () => {
    expect(leaseSql()).toContain("mob_spawn_pass");
    expect(leaseSql()).toContain("50 seconds");
  });

  it("смерть: моба нет на клетке точки или он повержен", () => {
    const s = deathsSql();
    expect(s).toContain("c.object_id = s.object_id");
    expect(s).toContain("killed_at IS NOT NULL");
    expect(s).toContain("dead_at IS NULL");
  });

  it("возрождение: по сроку, на родной клетке, если она свободна, под локами переноса", () => {
    expect(dueSql()).toContain("make_interval(mins => s.respawn_min)");
    const s = respawnSql({ id: "msp_1", map_id: "rmap_x", home_q: 3, home_r: 4, object_id: "boss:x", object_config: null });
    expect(s).toContain("pg_advisory_xact_lock(hashtext('godmove:rmap_x'))");
    expect(s).toContain("decor-respawn");
    for (const f of ["water", "player", "runner", "chest", "ship", "decor", "building", "object"])
      expect(s).toContain(`NOT tg.${f}`);
    expect(s).toContain("c.object_id IS NULL");
    expect(s).toContain("dead_at = NULL");
  });

  it("шаг: суша в радиусе от родной, без дороги и объекта, раненый не бродит", () => {
    const s = stepsSql();
    expect(s).toContain("<= s.roam");
    expect(s).toContain("c.road_id IS NULL");
    expect(s).toContain("c.object_id IS NULL");
    expect(s).toMatch(/вод\|water/);
    expect(s).toContain("h.current_hp < h.max_hp");
  });

  it("шаг и отметка точки — одной транзакцией, только если перенос состоялся", () => {
    const plain = moveObjectSql(at);
    const withMark = moveObjectSql(at, stepMarkSql("msp_1", at.to));
    expect(plain).not.toContain("also AS");
    expect(withMark).toContain("also AS (UPDATE yuplink.raid_mob_spawn");
    expect(withMark).toContain("FROM go WHERE sp.id = 'msp_1'");
  });

  it("настройки живого моба переходят в точку", () => {
    expect(syncConfigSql()).toContain("object_config IS DISTINCT FROM s.object_config");
  });
});

describe("перенос моба админом", () => {
  it("точка едет с мобом той же транзакцией, родная — новая клетка, если свободна", () => {
    const s = moveObjectSql(at, spawnFollowSql(at.mapId, at.from, at.to));
    expect(s).toContain("also AS (UPDATE yuplink.raid_mob_spawn sp");
    expect(s).toContain("sp.cur_q = 1 AND sp.cur_r = 2");
    expect(s).toContain("CASE WHEN taken.id IS NULL THEN 2 ELSE sp.home_q END");
  });
});
