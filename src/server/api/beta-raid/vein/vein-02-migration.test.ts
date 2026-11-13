// vein-02: жилы игроков (placed_by) — не места появления грибов DARAI; функции грибов —
// прод-версии, изменено одно условие в трёх местах. Жила карты (placed_by NULL) — как была.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL("../../../../../migrations/vein-02-player-veins-no-mushrooms.sql", import.meta.url),
  "utf8",
);
const code = raw.replace(/--.*$/gm, "");

describe("vein-02: грибы — только на жилах карты", () => {
  it("столбец placed_by; обе функции грибов берут жилы с placed_by IS NULL", () => {
    expect(code).toContain(
      "ALTER TABLE yuplink.raid_map_vein ADD COLUMN IF NOT EXISTS placed_by text;",
    );
    expect(code).toContain("FUNCTION yuplink.raid_mushroom_spawn_hour(");
    expect(code).toContain("FUNCTION yuplink.raid_mushroom_respawn_due(");
    expect(code.match(/v\.placed_by IS NULL/g)).toHaveLength(5);
  });
  it("укладка игрока пишет, кто положил", async () => {
    const { placeVeinSql } = await import("./vein-place-sql");
    const sql = placeVeinSql({
      mapId: "rmap_builders",
      account: "acc_1",
      heroId: "h1",
      stackKey: "vein:gold",
      kind: "gold",
      q: 1,
      r: 0,
      rot: 60,
      op: "vein:acc_1:op",
    } as Parameters<typeof placeVeinSql>[0]);
    expect(sql).toContain("(map_id, q, r, kind, rot, placed_by)");
  });
});
