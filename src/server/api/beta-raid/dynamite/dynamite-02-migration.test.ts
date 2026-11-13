// Миграция dynamite-02 (синий динамит, §8.75а): вид броска у raid_dynamite_blast
// (красный по умолчанию — старый вызов не меняется), одна клетка у синего, шахта
// клетки — raid_dynamite_blue_mine: охрана → уровень −1 → руины; алмазная — только
// охрана; гриб — уходит.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("migrations/dynamite-02-blue.sql", "utf8").replace(/\s+/g, " ");

describe("миграция dynamite-02", () => {
  it("одна транзакция; прежняя функция из 10 аргументов снята, новая — с видом по умолчанию", () => {
    expect(sql).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';.*COMMIT; $/);
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS yuplink.raid_dynamite_blast(text, text, integer, integer, text, text, text, text, numeric, jsonb);",
    );
    expect(sql).toContain("p_decor jsonb, p_kind text DEFAULT 'red')");
    expect(sql).toContain(
      "IF COALESCE(p_kind, '') NOT IN ('red', 'blue') THEN RAISE EXCEPTION 'dynamite_bad_args';",
    );
  });

  it("синий — одна клетка; красный — семь, как раньше", () => {
    expect(sql).toContain("AND (p_kind = 'red' OR (d.dq = 0 AND d.dr = 0))");
    expect(sql).toContain("IF p_kind = 'blue' THEN CONTINUE; END IF;");
  });

  it("шахта синего: гриб, охрана, алмазная, уровень, руины — по порядку", () => {
    const at = (s: string) => sql.indexOf(s);
    const order = [
      "'act', 'mushroom'",
      "'act', 'guard'",
      "c.cfg->>'resource' = 'diamonds'",
      "'act', 'dead'",
      "'act', 'level'",
      "yuplink.raid_mine_lose(p_map, p_q, p_r, 'break', NULL)",
      "'act', 'broken'",
    ];
    for (let i = 1; i < order.length; i++) {
      expect(at(order[i - 1]), order[i - 1]).toBeGreaterThan(0);
      expect(at(order[i]), order[i]).toBeGreaterThan(at(order[i - 1]));
    }
    expect(sql).toContain("yuplink.raid_mine_lose(p_map, p_q, p_r, 'blast', NULL)");
    expect(sql).toContain("'{mineLevel}', to_jsonb(v_lvl - 1)");
  });
});
