// Текст SQL основного инструмента (§8.24): гард в самом ударе, выбор под локом
// героя, «копать» — чтение клетки и ключ нажатия под своим локом.
//
// Смысл гарда (mainOkSql) сверен с моделью фейка (main-tool.fake mainOkModel)
// на живом Postgres только SELECT-ами по VALUES, без таблиц: 768 сочетаний
// (записанный основной × штуки топора, кирки и двух лопат × ключ удара × что
// нужно делу) — 768 совпадений (30.09.2026). Проверка клетки для «Копать»
// (groundCellSql) прогнана SELECT-ом на боевой карте: суша — да, вода и декор — нет.
import { describe, expect, it } from "vitest";
import { hitSql } from "../tool-wear";
import { adoptSql, mainOkSql, setMainSql, toolStateSql } from "./main-tool-sql";
import { groundCellSql, groundFenceSql, groundMarkSql } from "./ground-dig-sql";

const at = { heroId: "h1", stackKey: "custom:cst_sh1", op: "wear:bag:x" };

describe("гард удара", () => {
  it("бьёт только основной: гард в той же выборке стопки, что и удар, под локом героя", () => {
    const sql = hitSql({ ...at, step: 25, need: "shovel" });
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l;")).toBe(true);
    const src = sql.slice(sql.indexOf("src AS ("), sql.indexOf("upd AS ("));
    expect(src).toContain(mainOkSql("h1", "custom:cst_sh1", "shovel"));
    expect(src).toContain("FOR UPDATE");
  });

  it("стопка, ставшая основной ударом, записывается тем же оператором и только при ударе", () => {
    const sql = hitSql({ ...at, step: 25, need: "shovel" });
    expect(sql).toContain(`adopt AS (${adoptSql("h1", "custom:cst_sh1", "upd")})`);
    expect(adoptSql("h1", "k", "upd")).toContain("hi.main_tool IS DISTINCT FROM 'k'");
    expect(adoptSql("h1", "k", "upd")).toContain("AND EXISTS (SELECT 1 FROM upd)");
    expect(sql).toMatch(/AS main, EXISTS \(SELECT 1 FROM adopt\) AS adopted/);
  });

  it("лопате — только лопата; декору — ключ его инструмента", () => {
    const shovel = mainOkSql("h1", "custom:cst_sh1", "shovel");
    expect(shovel).toContain("split_part('custom:cst_sh1', ':', 2) AND mci.is_shovel");
    expect(shovel).toContain(") = 1");
    expect(shovel.startsWith("(EXISTS (SELECT 1 FROM yuplink.raid_custom_item mci")).toBe(true);
    // Декору ключ лопатой быть не обязан: только замена кончившейся лопаты.
    const item = mainOkSql("h1", "custom:cst_axe", "item");
    expect(item.startsWith("(COALESCE((SELECT mhi.main_tool")).toBe(true);
    expect(item).toContain("= 'custom:cst_axe', false)");
    // По умолчанию удар — декору: гард есть всегда, обойти его нечем.
    expect(hitSql({ ...at, step: 25 })).toContain(mainOkSql("h1", "custom:cst_sh1", "item"));
  });

  it("удочке (§8.35) — только удочка: тот же гард семейства, галочка is_rod", () => {
    const rod = mainOkSql("h1", "custom:cst_rod", "rod");
    expect(rod.startsWith("(EXISTS (SELECT 1 FROM yuplink.raid_custom_item mci")).toBe(true);
    expect(rod).toContain("split_part('custom:cst_rod', ':', 2) AND mci.is_rod)");
    expect(rod).toContain("sci.is_rod AND sx.count >= 1) = 1");
    expect(rod).not.toContain("is_shovel");
    // Лопате гард прежний, слово в слово про лопату.
    expect(mainOkSql("h1", "custom:cst_sh1", "shovel")).not.toContain("is_rod");
  });
});

describe("выбор основного", () => {
  it("под локом героя отдельным оператором; взять — только стопку с целой штукой", () => {
    const sql = setMainSql("h1", "custom:cst_axe");
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l;")).toBe(true);
    expect(sql).toContain("SET main_tool = 'custom:cst_axe'");
    expect(sql).toContain("b.stack_key = 'custom:cst_axe' AND b.count >= 1");
    const drop = setMainSql("h1", null);
    expect(drop).toContain("SET main_tool = NULL");
    expect(drop).not.toContain("b.count >= 1");
  });

  it("чтение: записанный основной, лопата (удочка) ли он и свои товары с целой штукой", () => {
    const sql = toolStateSql("h1");
    expect(sql).toContain('hi.main_tool AS "mainKey"');
    expect(sql).toContain('AS "mainRod"');
    expect(sql).toContain("'rod', COALESCE(ci.is_rod, false)");
    expect(sql).toContain("b.kind = 'custom' AND b.count >= 1");
  });
});

describe("«Копать» пустую землю", () => {
  const o = { mapId: "m1", q: 1, r: 0 };
  it("клетка: суша без воды, декора, постройки, объекта, мешочка, сундука и корабля", () => {
    const sql = groundCellSql(o);
    for (const part of [
      "c.terrain_id IS NOT NULL",
      "c.decoration_id IS NULL",
      "NOT (c.building_id IS NOT NULL",
      "bb.group_id = c.group_id",
      "bb.building_id IS NOT NULL",
      "NOT (c.object_id IS NOT NULL AND",
      "FROM yuplink.raid_loot_bag b",
      "FROM yuplink.raid_plain_chest pc",
      "FROM yuplink.raid_magic_chest mc",
      "FROM yuplink.beta_raid_ship s",
    ]) {
      expect(sql).toContain(part);
    }
    expect(sql).toMatch(/NOT COALESCE\(\(t\.name ~\*/);
  });

  it("ключ нажатия: лок ключа отдельным оператором, «копали» / «забор»", () => {
    const mark = groundMarkSql({ ...o, op: "gdig:a:x", account: "a", nonce: "n1" });
    expect(mark.startsWith("SELECT pg_advisory_xact_lock(hashtext('gdig:gdig:a:x')) AS l;")).toBe(
      true,
    );
    expect(mark).toContain("'ground:m1:1:0', 'a', 'ground', 'done'");
    expect(mark).toContain("WHERE NOT EXISTS (SELECT 1 FROM prior)");
    const fence = groundFenceSql({ ...o, op: "gdig:a:x", account: "a" });
    expect(fence).toContain("'ground', 'failed')");
    expect(fence).toContain("ON CONFLICT (op) DO NOTHING");
  });
});
