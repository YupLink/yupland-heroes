// Миграция trees-01 против кода посадки: одной транзакцией, повтор безвреден,
// таблица ключа нажатия — ровно те столбцы, что пишет оператор (tree-plant-sql)
// и читает ручка (tree-plant).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { plantTreeSql } from "./tree-plant-sql";

const raw = readFileSync(
  fileURLToPath(new URL("../../../../../migrations/trees-01-plant-op.sql", import.meta.url)),
  "utf8",
);
const sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

describe("trees-01: ключ нажатия «Посадить дерево»", () => {
  it("одной транзакцией; повтор файла безвреден", () => {
    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(raw.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS yuplink.raid_tree_plant_op (");
    expect(sql.match(/CREATE INDEX IF NOT EXISTS/g)).toHaveLength(2);
    expect(sql).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/);
  });

  it("ключ — первичный; столбцы — те, что пишет оператор посадки", () => {
    expect(sql).toContain("op text PRIMARY KEY");
    const op = plantTreeSql({
      mapId: "m",
      q: 1,
      r: 2,
      account: "a",
      wallet: "w",
      heroId: "h",
      decorId: "decoration_x",
      op: "k",
      cost: 15,
    });
    const cols = /raid_tree_plant_op \(([^)]+)\)/
      .exec(op)![1]
      .split(",")
      .map((c) => c.trim());
    for (const c of cols) expect(sql, c).toMatch(new RegExp(`\\b${c} (text|integer|numeric)`));
  });
});
