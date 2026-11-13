// Миграция minev2-41 (чертежи шахт): одна таблица, один чертёж на аккаунт,
// только виды шахт, что ставятся; идемпотентно, в транзакции.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLACEABLE_BLUEPRINTS } from "@/lib/minePlacement";

const sql = readFileSync(
  fileURLToPath(new URL("../../../../../migrations/minev2-41-mine-plans.sql", import.meta.url)),
  "utf8",
);

describe("миграция minev2-41", () => {
  it("BEGIN/COMMIT, таблица IF NOT EXISTS, ключ — аккаунт", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yuplink.raid_mine_plan");
    expect(sql).toContain("account_id text PRIMARY KEY");
    for (const col of ["map_id", "q", "r", "kind", "stack_key", "created_at"])
      expect(sql).toMatch(new RegExp(`\\n  ${col}\\s+\\w+`));
  });

  it("вид — только те, что ставятся из заготовки", () => {
    const list = /kind IN \(([^)]+)\)/.exec(sql)?.[1] ?? "";
    expect(list.split(",").map((x) => x.trim().replace(/'/g, ""))).toEqual([
      ...PLACEABLE_BLUEPRINTS,
    ]);
  });
});
