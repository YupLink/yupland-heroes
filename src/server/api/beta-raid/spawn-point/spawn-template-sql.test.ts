import { describe, expect, it } from "vitest";
import {
  deleteTemplateSql,
  mapPointsSql,
  saveTemplateSql,
  templateSql,
} from "./spawn-template-sql";

describe("SQL шаблонов точек спавна", () => {
  it("сохранение — вставка или правка по id, строки мобов json-ом, кавычки экранированы", () => {
    const sql = saveTemplateSql({
      id: "stp_1",
      name: "Волк O'Brien · туман",
      radius: 3,
      mobs: [{ mob: "wolf", count: 2, weathers: ["fog"], respawnMin: 30, reward: null }],
    });
    expect(sql).toContain("INSERT INTO yuplink.raid_spawn_template");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sql).toContain("'Волк O''Brien · туман'");
    expect(sql).toContain('"mob":"wolf"');
    expect(sql).toContain("::jsonb");
  });
  it("выборки и удаление — по id и карте", () => {
    expect(templateSql("stp_1")).toContain("WHERE id = 'stp_1'");
    expect(deleteTemplateSql("stp_1")).toContain("DELETE FROM yuplink.raid_spawn_template");
    expect(mapPointsSql("rmap_x")).toContain("map_id = 'rmap_x'");
  });
});
