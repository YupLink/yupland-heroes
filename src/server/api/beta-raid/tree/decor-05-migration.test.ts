// Миграция decor-05 (посаженное дерево держит отрастание декора карты, владелец
// 25.10.2026): колонка under_decor и правка raid_dynamite_blast — взрыв
// посаженного снимает только его рассылку, ожидание под ним будит, а не удаляет.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/decor-05-planted-hold.sql", "utf8").replace(/\s+/g, " ");

describe("миграция decor-05", () => {
  it("колонка under_decor — повторный накат безопасен", () => {
    expect(sql).toContain(
      "ALTER TABLE yuplink.raid_decor_respawn ADD COLUMN IF NOT EXISTS under_decor text;",
    );
    expect(sql).toMatch(/^.*BEGIN; SET LOCAL lock_timeout = '5s';.*COMMIT; $/);
  });

  it("динамит по посаженному: ожидание не удаляется ни одним DELETE", () => {
    const deletes = [...sql.matchAll(/DELETE FROM yuplink\.raid_decor_respawn dr WHERE [^;]*;/g)];
    expect(deletes.length).toBe(1);
    expect(deletes[0][0]).toContain("AND dr.placed_at IS NOT NULL;");
    expect(sql).toContain(
      "SET decor_id = dr.under_decor, under_decor = NULL, placed_at = NULL, held_at = now(), due_at = now() + interval '1 minute'",
    );
    expect(sql).toContain(
      "UPDATE yuplink.raid_decor_respawn dr SET due_at = now() WHERE dr.map_id = p_map AND dr.q = r_x.q AND dr.r = r_x.r AND dr.placed_at IS NULL AND dr.held_at IS NOT NULL;",
    );
  });
});
