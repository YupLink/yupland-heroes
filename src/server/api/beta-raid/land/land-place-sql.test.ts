// «Положить землю» — один оператор: ключ нажатия, шаблон местности, стопка,
// клетка в пустоту даром или перестройка другой местности за энергию, минус
// штука и отметка.
import { describe, expect, it } from "vitest";
import { landPlaceVerdict, placeLandSql } from "./land-place-sql";

const sql = placeLandSql({
  mapId: "rmap_builders",
  q: 17,
  r: 33,
  account: "acc_1",
  wallet: "w.near",
  heroId: "hero_1",
  terrainId: "terrain_QArF-OKH-s",
  op: "land:acc_1:op123456",
  cost: 5,
}).replace(/\s+/g, " ");

describe("оператор укладки", () => {
  it("локи до WITH, ключ нажатия и стопка своей местности", () => {
    expect(sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(sql.indexOf("WITH prior"));
    expect(sql).toContain("raid_land_place_op WHERE op = 'land:acc_1:op123456'");
    expect(sql).toContain("b.stack_key = 'land:terrain_QArF-OKH-s'");
    expect(sql).toContain("t.kind = 'terrain'");
  });

  it("новая клетка — только в пустоту, повтор ничего не пишет", () => {
    expect(sql).toContain(
      "go AS ( SELECT 1 FROM tpl, item WHERE NOT EXISTS (SELECT 1 FROM prior) )",
    );
    expect(sql).toContain(
      "SELECT 'rmap_builders', 17, 33, tpl.id, now() FROM go, tpl WHERE NOT EXISTS (SELECT 1 FROM was_cell)",
    );
    expect(sql).toContain("ON CONFLICT (map_id, q, r) DO NOTHING");
  });

  it("перестройка: только местность, без объекта/декора, не та же, не под героем; под свою постройку — не вода, под чужую — нет", () => {
    expect(sql).toMatch(
      /upd AS \( UPDATE yuplink\.raid_map_cells c SET terrain_id = tpl\.id, saved_at = now\(\)/,
    );
    expect(sql).toContain(
      "c.object_id IS NULL AND c.decoration_id IS NULL AND c.terrain_id IS DISTINCT FROM tpl.id AND (c.building_id IS NULL OR (EXISTS (SELECT 1 FROM own_bld) AND NOT tpl.water)) AND NOT EXISTS (SELECT 1 FROM hero_on)",
    );
    expect(sql).toContain(
      "beta_raid_positions p WHERE p.map_id = 'rmap_builders' AND p.q = 17 AND p.r = 33",
    );
  });

  it("энергия — только за перестройку, тем же оператором", () => {
    expect(sql).toMatch(
      /paid AS \( SELECT 1 FROM upd CROSS JOIN LATERAL yuplink\.touch_energy_atomic\('w\.near', 5::numeric\)/,
    );
    expect(sql).toContain("(SELECT count(*) FROM paid)::int * 5 AS paid");
  });

  it("минус штука — только вместе с клеткой; последняя — строки нет", () => {
    expect(sql).toMatch(
      /dec AS \( UPDATE yuplink\.raid_hero_backpack b SET count = b\.count - 1.*FROM item, put/,
    );
    expect(sql).toMatch(/del AS \( DELETE FROM yuplink\.raid_hero_backpack b USING item, put/);
  });

  it("вердикт: легла/повтор — ok, иначе ключ отказа", () => {
    expect(landPlaceVerdict({ placed: true })).toBe("ok");
    expect(landPlaceVerdict({ was: true })).toBe("ok");
    expect(landPlaceVerdict({ box: false, kind: true })).toBe("land.no_item");
    expect(landPlaceVerdict({ box: true, kind: false })).toBe("land.gone_kind");
    expect(landPlaceVerdict({ box: true, kind: true, taken: true, built: true })).toBe(
      "land.built",
    );
    expect(landPlaceVerdict({ box: true, kind: true, taken: true, other: true })).toBe(
      "land.building_other",
    );
    expect(landPlaceVerdict({ box: true, kind: true, taken: true, wet: true })).toBe(
      "land.water_building",
    );
    expect(landPlaceVerdict({ box: true, kind: true, taken: true, same: true })).toBe("land.same");
    expect(landPlaceVerdict({ box: true, kind: true, taken: true, hero: true })).toBe("land.hero");
    expect(landPlaceVerdict(null)).toBe("land.busy");
  });
});
