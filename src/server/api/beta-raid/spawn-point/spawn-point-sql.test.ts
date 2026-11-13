// Точка спавна (lib/raid/spawnPoint, migrations/mob-03): пересборка — под замком
// карты, старые мобы точки сняты (раненые — нет), новые записи по свободным
// клеткам радиуса «убиты давно» — встают минутным проходом в свою погоду.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { placementOrder, pointMobTotal, type SpawnPointMob } from "@/lib/raid/spawnPoint";
import { removePointSql, savePointSql } from "./spawn-point-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const wolf: SpawnPointMob = {
  mob: "rbt_wolf",
  count: 2,
  weathers: ["rain", "fog"],
  respawnMin: 30,
  reward: null,
};
const bear: SpawnPointMob = {
  mob: "rbt_bear",
  count: 1,
  weathers: [],
  respawnMin: 60,
  reward: { fillers: [], split: [100], packs: [], items: [] },
};
const sql = flat(
  savePointSql({
    id: "spt_1",
    mapId: "rmap_A",
    q: 10,
    r: 5,
    radius: 3,
    mobs: [wolf, bear],
    order: placementOrder([wolf, bear]),
  }),
);

describe("расстановка", () => {
  it("по кругу: по одному от каждой строки — мест мало, каждый вид всё равно есть", () => {
    expect(placementOrder([wolf, bear]).map((m) => m.mob)).toEqual([
      "rbt_wolf",
      "rbt_bear",
      "rbt_wolf",
    ]);
    expect(pointMobTotal([wolf, bear])).toBe(3);
  });
});

describe("сохранение точки", () => {
  it("под замком карты (тот же, что у прохода), точка — по клетке, повтор правит её", () => {
    expect(sql.indexOf("pg_advisory_xact_lock(hashtext('godmove:rmap_A'))")).toBeLessThan(
      sql.indexOf("INSERT INTO yuplink.raid_spawn_point"),
    );
    expect(sql).toContain(
      "ON CONFLICT (map_id, q, r) DO UPDATE SET radius = EXCLUDED.radius, mobs = EXCLUDED.mobs",
    );
  });

  it("старые мобы точки: не раненые уходят с карты, записи точки стёрты", () => {
    expect(sql).toContain(
      "WHERE s.point_id = 'spt_1' AND s.dead_at IS NULL AND s.cur_q IS NOT NULL AND NOT EXISTS",
    );
    expect(sql).toContain("h.current_hp < h.max_hp");
    expect(sql).toContain("SET object_id = NULL, object_config = NULL");
    expect(sql).toContain("DELETE FROM yuplink.raid_mob_spawn s WHERE s.point_id = 'spt_1'");
  });

  it("новые записи: моб, своя награда или как в шаблоне, погода списком, встают сразу в свою погоду", () => {
    expect(sql).toContain("(1, 'boss:rbt_wolf', NULL::jsonb, 30, ARRAY['rain', 'fog']::text[])");
    expect(sql).toContain(
      '(2, \'boss:rbt_bear\', \'{"rewardConfig":{"fillers":[],"split":[100],"packs":[],"items":[]}}\'::jsonb, 60, NULL::text[])',
    );
    expect(sql).toContain("now() - make_interval(mins => w.respawn_min)");
    expect(sql).toContain("w.weathers, 'spt_1'");
    expect(sql).toContain("ON CONFLICT (map_id, home_q, home_r) DO NOTHING");
  });

  it("клетки — свободная суша в радиусе, сначала сама точка, без чужих записей", () => {
    expect(sql).toContain("(abs(c.q - 10) + abs(c.r - 5) + abs(c.q + c.r - 10 - 5)) / 2 <= 3");
    expect(sql).toContain("ORDER BY (c.q = 10 AND c.r = 5) DESC, random()");
    expect(sql).toContain(
      "c.object_id IS NULL AND c.building_id IS NULL AND c.decoration_id IS NULL",
    );
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.raid_mob_spawn x WHERE x.map_id = c.map_id AND x.home_q = c.q AND x.home_r = c.r)",
    );
    // Номера мест — по порядку: точка первой, дальше случайно (иначе LIMIT взял бы не те).
    expect(sql).toContain("ORDER BY n LIMIT 3");
  });

  it("убрать точку: те же снятие и стирание, и сама точка", () => {
    const rm = flat(removePointSql("rmap_A", "spt_1"));
    expect(rm).toContain("DELETE FROM yuplink.raid_mob_spawn s WHERE s.point_id = 'spt_1'");
    expect(rm).toContain("DELETE FROM yuplink.raid_spawn_point p WHERE p.id = 'spt_1'");
  });
});

describe("миграция mob-03", () => {
  const m = readFileSync(
    fileURLToPath(new URL("../../../../../migrations/mob-03-spawn-points.sql", import.meta.url)),
    "utf8",
  );
  it("погода списком с той же проверкой, перенос старой, точка — по клетке", () => {
    expect(m).toContain("ADD COLUMN IF NOT EXISTS weathers text[]");
    expect(m).toContain("SET weathers = ARRAY[weather]");
    expect(flat(m)).toContain("UNIQUE (map_id, q, r)");
    expect(m).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/);
  });
});
