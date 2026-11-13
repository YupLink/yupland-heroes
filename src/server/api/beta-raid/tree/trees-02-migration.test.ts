// Миграция trees-02 (посаженные не отрастают) против кода: одной транзакцией,
// повтор безвреден; метка — тот столбец, что пишет посадка и снимает рубка;
// триггер снимает метку при любой другой смене декора и срабатывает только у
// помеченных клеток; заполнение меток и снятие отрастания — по ключам посадки.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { plantTreeSql } from "./tree-plant-sql";
import { chopRestoreSql, chopTakeSql } from "./tree-chop-sql";

const raw = readFileSync(
  fileURLToPath(new URL("../../../../../migrations/trees-02-planted-mark.sql", import.meta.url)),
  "utf8",
);
const sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("trees-02: метка «посадил игрок»", () => {
  it("одной транзакцией; повтор файла безвреден", () => {
    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(raw.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain(
      "ALTER TABLE yuplink.raid_map_cells ADD COLUMN IF NOT EXISTS planted_decor text;",
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION yuplink.raid_cell_planted_guard()");
    expect(sql).toContain(
      "DROP TRIGGER IF EXISTS raid_map_cells_planted_guard ON yuplink.raid_map_cells;",
    );
  });

  it("триггер: только смена декора у помеченной клетки; метку, поставленную самой правкой, не трогает", () => {
    expect(sql).toContain(
      "BEFORE UPDATE OF decoration_id ON yuplink.raid_map_cells FOR EACH ROW WHEN (OLD.planted_decor IS NOT NULL AND OLD.decoration_id IS DISTINCT FROM NEW.decoration_id)",
    );
    expect(sql).toContain(
      "IF NEW.planted_decor IS NOT DISTINCT FROM OLD.planted_decor THEN NEW.planted_decor := NULL; END IF;",
    );
  });

  it("посадка пишет метку, рубка снимает, откат возвращает — тот же столбец", () => {
    const plant = flat(
      plantTreeSql({
        mapId: "m",
        q: 1,
        r: 2,
        account: "a",
        wallet: "w",
        heroId: "h",
        decorId: "decoration_x",
        op: "k",
        cost: 15,
      }),
    );
    expect(plant).toContain("SET decoration_id = tpl.id, planted_decor = tpl.id");
    expect(flat(chopTakeSql("m", 1, 2, "decoration_x", "false"))).toContain(
      "SET decoration_id = NULL, planted_decor = NULL",
    );
    expect(flat(chopRestoreSql("m", 1, 2, "decoration_x", true))).toContain(
      "SET decoration_id = 'decoration_x', planted_decor = 'decoration_x'",
    );
  });

  it("уже посаженные: последний ключ посадки клетки и тот же шаблон на ней", () => {
    expect(sql).toContain(
      "SELECT DISTINCT ON (map_id, q, r) map_id, q, r, decor_id FROM yuplink.raid_tree_plant_op ORDER BY map_id, q, r, at DESC",
    );
    expect(sql).toContain("SET planted_decor = o.decor_id FROM o");
    expect(sql).toContain("AND c.decoration_id = o.decor_id");
  });

  it("отрастание срубленного посаженного снимается: ждёт, тот же шаблон, после посадки", () => {
    expect(sql).toContain("DELETE FROM yuplink.raid_decor_respawn d USING o");
    expect(sql).toContain(
      "AND d.decor_id = o.decor_id AND d.placed_at IS NULL AND d.created_at >= o.at",
    );
  });
});
