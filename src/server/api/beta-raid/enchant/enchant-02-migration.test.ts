// Миграция enchant-02 (зачарование в минус): одна транзакция, повтор безвреден,
// данных не трогает; ослабляет ровно два CHECK из enchant-01 до −99 под теми
// же именами. Сам SQL — проба с откатом (batch32/dry-enchant-02.sql).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENCHANT_BOOST_MIN } from "@/lib/enchant/enchant";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../../migrations/enchant-02.sql", import.meta.url)),
  "utf8",
);
const flat = sql.replace(/\s+/g, " ");
const body = sql.replace(/--.*$/gm, "");

describe("миграция enchant-02", () => {
  it("одной транзакцией, чужой лок ждём не дольше 5 с", () => {
    expect(sql).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("повтор безвреден: каждое ограничение сначала DROP IF EXISTS, потом ADD с тем же именем", () => {
    for (const [table, name] of [
      ["raid_enchant_spell", "raid_enchant_spell_boost_min_check"],
      ["item_enchant", "item_enchant_pct_check"],
    ]) {
      const drop = flat.indexOf(`ALTER TABLE yuplink.${table} DROP CONSTRAINT IF EXISTS ${name};`);
      const add = flat.indexOf(`ALTER TABLE yuplink.${table} ADD CONSTRAINT ${name} CHECK`);
      expect(drop).toBeGreaterThan(0);
      expect(add).toBeGreaterThan(drop);
    }
    expect(body).not.toMatch(/\b(DELETE|TRUNCATE|UPDATE|INSERT|DROP TABLE|DROP COLUMN)\b/);
  });

  it("низ −99 — тот же, что у формы и сервера (enchantBoostOk)", () => {
    expect(ENCHANT_BOOST_MIN).toBe(-99);
    expect(flat).toContain("CHECK (boost_min >= -99)");
    expect(flat).toContain("CHECK (pct >= -99)");
    expect(body).not.toMatch(/>= 0\)/);
  });
});
