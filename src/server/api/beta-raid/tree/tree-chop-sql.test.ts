// SQL рубки с меткой посадки: декор и метка забираются одним оператором и
// только если на клетке именно этот декор; метка — из строки до правки;
// откат возвращает метку только посаженному; строка отрастания — своей клетки
// и своего шаблона.
import { describe, expect, it } from "vitest";
import { chopRestoreSql, chopTakeSql, plantedRespawnDropSql } from "./tree-chop-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("SQL рубки и посаженное дерево", () => {
  it("забрать: CAS по декору, метка читается подзапросом до правки", () => {
    const sql = flat(chopTakeSql("m", 4, -2, "decoration_oak", "(COVER)"));
    expect(sql).toContain(
      "UPDATE yuplink.raid_map_cells SET decoration_id = NULL, planted_decor = NULL",
    );
    expect(sql).toContain(
      "FROM (SELECT p.planted_decor AS mark FROM yuplink.raid_map_cells p WHERE p.map_id = 'm' AND p.q = 4 AND p.r = -2) was",
    );
    expect(sql).toContain(
      "WHERE map_id = 'm' AND q = 4 AND r = -2 AND decoration_id = 'decoration_oak'",
    );
    expect(sql).toContain(
      "RETURNING q, (COVER) AS covered, COALESCE(was.mark = 'decoration_oak', false) AS planted;",
    );
  });

  it("откат: метка — только посаженному; только на пустую клетку", () => {
    expect(flat(chopRestoreSql("m", 4, -2, "decoration_oak", true))).toBe(
      "UPDATE yuplink.raid_map_cells SET decoration_id = 'decoration_oak', planted_decor = 'decoration_oak' WHERE map_id = 'm' AND q = 4 AND r = -2 AND decoration_id IS NULL;",
    );
    expect(flat(chopRestoreSql("m", 4, -2, "decoration_oak", false))).toBe(
      "UPDATE yuplink.raid_map_cells SET decoration_id = 'decoration_oak' WHERE map_id = 'm' AND q = 4 AND r = -2 AND decoration_id IS NULL;",
    );
  });

  it("рубка посаженного: снимается только его рассылка, ожидание декора под ним остаётся", () => {
    const at = "d.map_id = 'm' AND d.q = 4 AND d.r = -2";
    // Пока шла рубка, на клетку посадили новое — его рассылку не трогаем.
    const own =
      `${at} AND d.decor_id = 'decoration_oak' AND d.placed_at IS NOT NULL AND NOT EXISTS ` +
      "(SELECT 1 FROM yuplink.raid_map_cells c WHERE c.map_id = 'm' AND c.q = 4 AND c.r = -2 AND c.decoration_id IS NOT NULL)";
    expect(flat(plantedRespawnDropSql("m", 4, -2, "decoration_oak"))).toBe(
      "UPDATE yuplink.raid_decor_respawn d SET decor_id = d.under_decor, under_decor = NULL, placed_at = NULL, " +
        `held_at = now(), due_at = now() + interval '1 minute' WHERE ${own} AND d.under_decor IS NOT NULL; ` +
        `DELETE FROM yuplink.raid_decor_respawn d WHERE ${own}; ` +
        // Ожидание под посаженным — будим: таймер заведёт ближайший проход.
        `UPDATE yuplink.raid_decor_respawn d SET due_at = now() WHERE ${at} AND d.placed_at IS NULL AND d.held_at IS NOT NULL;`,
    );
  });
});
