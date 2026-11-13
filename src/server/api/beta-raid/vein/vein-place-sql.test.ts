// «Положить жилу» — один оператор: локи, ключ нажатия, стопка своего вида,
// правила клетки (те же, что у раскладки minev2-30, и «жилы ещё нет»), строка
// raid_map_vein с поворотом, минус штука и отметка — только вместе с жилой.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VEIN_REFUSALS } from "@/lib/veinPlace";
import { placeVeinSql, veinPlaceVerdict } from "./vein-place-sql";
import { VEIN_BAD_SQL, factCol, factsFromRow, veinFactColsSql, veinOkSql } from "./vein-rules-sql";
import { veinSpotsSql } from "./vein-spots";

const flat = (s: string) => s.replace(/\s+/g, " ");
const at = {
  mapId: "rmap_builders",
  q: 17,
  r: 33,
  account: "acc_1",
  heroId: "hero_1",
  kind: "diamonds" as const,
  rot: 240,
  op: "vein:acc_1:op123456",
};
const sql = flat(placeVeinSql(at));
const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../../${rel}`, import.meta.url)), "utf8");

describe("оператор укладки жилы", () => {
  it("локи до WITH: карта, рюкзак, клетка и шахта — в порядке посадки дерева", () => {
    const locks = sql.slice(0, sql.indexOf("WITH prior"));
    const keys = [...locks.matchAll(/hashtext\('([^']+)'\)/g)].map((m) => m[1]);
    expect(keys).toEqual([
      "godmove:rmap_builders",
      "bp:hero_1",
      "chestcell:rmap_builders:17:33",
      "mine:rmap_builders:17:33",
    ]);
  });

  it("ключ нажатия и стопка своего вида, под FOR UPDATE", () => {
    expect(sql).toContain("raid_vein_place_op WHERE op = 'vein:acc_1:op123456'");
    expect(sql).toContain(
      "b.hero_id = 'hero_1' AND b.stack_key = 'vein:diamonds' AND b.count >= 1 FOR UPDATE",
    );
  });

  it("клетка читается одной строкой и без клетки на карте (no_cell)", () => {
    expect(sql).toContain(
      "FROM (SELECT 1) one LEFT JOIN yuplink.raid_map_cells c ON c.map_id = 'rmap_builders' AND c.q = 17 AND c.r = 33 LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id",
    );
    for (const k of VEIN_REFUSALS) expect(sql).toContain(`AS ${factCol(k)}`);
    expect(sql).toContain(`(${flat(veinOkSql())}) AS ok`);
  });

  it("повтор и негодная клетка ничего не пишут; жила — вид и поворот, без дубля", () => {
    expect(sql).toContain(
      "go AS ( SELECT 1 FROM item, spot WHERE spot.ok AND NOT EXISTS (SELECT 1 FROM prior) )",
    );
    expect(sql).toContain(
      "INSERT INTO yuplink.raid_map_vein (map_id, q, r, kind, rot, placed_by) SELECT 'rmap_builders', 17, 33, 'diamonds', 240, 'acc_1' FROM go ON CONFLICT (map_id, q, r) DO NOTHING RETURNING q, r, kind, rot",
    );
  });

  it("минус штука и ключ — только вместе с легшей жилой; последняя — строки нет", () => {
    expect(sql).toMatch(
      /dec AS \( UPDATE yuplink\.raid_hero_backpack b SET count = b\.count - 1, updated_at = now\(\) FROM item, ins WHERE b\.id = item\.id AND item\.count > 1/,
    );
    expect(sql).toMatch(
      /del AS \( DELETE FROM yuplink\.raid_hero_backpack b USING item, ins WHERE b\.id = item\.id AND item\.count <= 1/,
    );
    expect(sql).toContain(
      "INSERT INTO yuplink.raid_vein_place_op (op, account_id, map_id, q, r, kind, rot) SELECT 'vein:acc_1:op123456', 'acc_1', 'rmap_builders', ins.q, ins.r, ins.kind, ins.rot FROM ins",
    );
    // Энергии жила не берёт, карту редактора (edit_seq) не двигает.
    expect(sql).not.toContain("touch_energy_atomic");
    expect(sql).not.toContain("edit_seq");
  });

  it("поворот — только из шести, мусор — 0", () => {
    expect(flat(placeVeinSql({ ...at, rot: 45 }))).toContain("'diamonds', 0, 'acc_1' FROM go");
    expect(flat(placeVeinSql({ ...at, rot: 300 }))).toContain("'diamonds', 300, 'acc_1' FROM go");
  });

  it("ответ: повтор, легла, стопка, поворот и признаки клетки", () => {
    expect(sql).toContain("EXISTS (SELECT 1 FROM prior) AS was");
    expect(sql).toContain("EXISTS (SELECT 1 FROM ins) AS placed");
    expect(sql).toContain("EXISTS (SELECT 1 FROM item) AS box");
    expect(sql).toContain("(SELECT ins.rot FROM ins) AS rot");
    expect(sql).toContain("s.* FROM spot s");
  });
});

describe("правила клетки — те же, что у раскладки minev2-30", () => {
  const m30 = flat(read("migrations/minev2-30-veins.sql"));

  it("вода и океан, грядки и замок, купол, дорога, постройка и блок, убираемый декор", () => {
    expect(m30).toContain(`NOT ${VEIN_BAD_SQL["vein.water"]}`);
    expect(m30).toContain(`NOT ${VEIN_BAD_SQL["vein.castle"]}`);
    expect(m30).toContain(`NOT ${VEIN_BAD_SQL["vein.void"]}`);
    expect(m30).toContain("COALESCE(btrim(c.road_id), '') = ''");
    expect(VEIN_BAD_SQL["vein.road"]).toBe("COALESCE(btrim(c.road_id), '') <> ''");
    expect(m30).toContain("c.building_id IS NULL AND c.group_id IS NULL");
    expect(VEIN_BAD_SQL["vein.built"]).toBe(
      "(c.building_id IS NOT NULL OR c.group_id IS NOT NULL)",
    );
    const decor = flat(VEIN_BAD_SQL["vein.decor"]);
    for (const part of [
      "d.id = c.decoration_id",
      "jsonb_typeof(d.meta->'interact') = 'object'",
      "d.meta->'interact'->>'on' = 'true'",
    ]) {
      expect(m30).toContain(part);
      expect(decor).toContain(part);
    }
    // У раскладки местность — JOIN (клетки без шаблона нет); здесь — no_cell.
    expect(m30).toContain("JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id");
    expect(VEIN_BAD_SQL["vein.no_cell"]).toBe("t.id IS NULL");
  });

  it("плюс: на клетке ещё нет жилы", () => {
    expect(flat(VEIN_BAD_SQL["vein.taken"])).toBe(
      "EXISTS (SELECT 1 FROM yuplink.raid_map_vein v WHERE v.map_id = c.map_id AND v.q = c.q AND v.r = c.r)",
    );
  });

  it("подсветка круга читает те же признаки, что оператор", () => {
    const spots = flat(veinSpotsSql("rmap_1", 5, -2));
    expect(spots).toContain(flat(veinFactColsSql()));
    expect(spots).toContain("c.q BETWEEN 2 AND 8 AND c.r BETWEEN -5 AND 1");
    expect(spots).toContain("LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id");
  });
});

describe("вердикт укладки", () => {
  it("легла или повтор — ok; нет стопки; признак клетки — его ключ", () => {
    expect(veinPlaceVerdict({ placed: true })).toBe("ok");
    expect(veinPlaceVerdict({ was: true })).toBe("ok");
    expect(veinPlaceVerdict(null)).toBe("vein.busy");
    expect(veinPlaceVerdict({ box: false, f_taken: true })).toBe("vein.no_item");
    expect(veinPlaceVerdict({ box: true, f_taken: true })).toBe("vein.taken");
    expect(veinPlaceVerdict({ box: true, f_no_cell: true, f_water: true })).toBe("vein.no_cell");
    expect(veinPlaceVerdict({ box: true, f_road: true, f_decor: true })).toBe("vein.road");
    expect(veinPlaceVerdict({ box: true, f_decor: true })).toBe("vein.decor");
    // Клетка годна, а жила не легла (кто-то успел первым) — «попробуй ещё».
    expect(veinPlaceVerdict({ box: true, ok: true })).toBe("vein.busy");
  });

  it("признаки из строки: только true считается", () => {
    expect(factsFromRow(null)).toBeNull();
    expect(factsFromRow({ f_water: true, f_road: "true", f_built: 1 })).toMatchObject({
      "vein.water": true,
      "vein.road": false,
      "vein.built": false,
    });
  });
});
