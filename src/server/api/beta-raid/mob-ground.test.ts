// Кто для генерации «моб» и что такое дорога/жила (владелец, 22.10.2026).
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    return [{ id: "chest_hare" }];
  },
}));

const { bareTplId, fleeingTplIds, isMobId, mobGroundSql, roadHereSql, spawnGuardedSql } =
  await import("./mob-ground");

describe("mob-ground", () => {
  it("моб по id — boss: и mob:, прочее — нет", () => {
    expect(isMobId("boss:rbt_a")).toBe(true);
    expect(isMobId("mob:x")).toBe(true);
    expect(isMobId("chest:chest_hare")).toBe(false);
    expect(isMobId("rbt_a")).toBe(false);
    expect(isMobId(null)).toBe(false);
  });

  it("id шаблона из id объекта — как split_part в SQL", () => {
    expect(bareTplId("chest:chest_hare")).toBe("chest_hare");
    expect(bareTplId("chest_hare")).toBe("chest_hare");
  });

  it("убегающие существа — по meta.flees, одним чтением", async () => {
    expect(await fleeingTplIds()).toEqual(new Set(["chest_hare"]));
    expect(db.sql[0]).toContain("meta->>'flees'");
    expect(spawnGuardedSql("v.object_id")).toContain("v.object_id LIKE 'boss:%'");
    expect(spawnGuardedSql("v.object_id")).toContain("meta->>'flees'");
  });

  it("дорога — непустой road_id (пустая строка и запятые — не дорога); жила — raid_map_vein", () => {
    expect(roadHereSql("c")).toBe(`(NULLIF(btrim(replace(c.road_id, ',', '')), '') IS NOT NULL)`);
    expect(mobGroundSql("c")).toContain(`NOT ${roadHereSql("c")}`);
    expect(mobGroundSql("c")).toContain("FROM yuplink.raid_map_vein mgv");
  });
});
