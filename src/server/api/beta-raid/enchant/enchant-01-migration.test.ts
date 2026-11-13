// Миграция enchant-01 (лавка зачарования): одна транзакция, повтор безвреден,
// данных не трогает, заклинаний заранее не создаёт; ключи, на которых держатся
// правила, — в самой схеме. Сам SQL — проба с откатом (batch29/dry-enchant-01.sql).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../../migrations/enchant-01.sql", import.meta.url)),
  "utf8",
);
const flat = sql.replace(/\s+/g, " ");

describe("миграция enchant-01", () => {
  it("одной транзакцией, чужой лок ждём не дольше 5 с", () => {
    expect(sql).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql.split("\n").length).toBeLessThanOrEqual(250);
  });

  it("идемпотентна и данных не трогает: ни одного заклинания заранее", () => {
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE|INSERT)\b/);
  });

  it("одно зачарование на артефакт и одна незавершённая попытка на предмет", () => {
    expect(flat).toContain(
      "CREATE TABLE IF NOT EXISTS yuplink.item_enchant ( item_id text PRIMARY KEY",
    );
    expect(flat).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS enchant_attempt_item_pending ON yuplink.enchant_attempt (item_id) WHERE status = 'pending';",
    );
    expect(flat).toContain("PRIMARY KEY (account_id, op_id)");
  });

  it("правила заклинания держит и база: успех 0–100, разрушение ≤ 100 − успех, цена — список", () => {
    expect(flat).toContain("CHECK (success >= 0 AND success <= 100)");
    expect(flat).toContain("CHECK (destroy_chance >= 0 AND destroy_chance <= 100 - success)");
    expect(flat).toContain(
      "CHECK (jsonb_typeof(cost) = 'array' AND jsonb_array_length(cost) >= 1)",
    );
    expect(flat).toContain("CHECK (steps >= 0 AND steps <= 5)");
  });
});
