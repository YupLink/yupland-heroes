// Установка сундука и охраны к нему — один оператор «всё или ничего»: без
// окна, где сундук «с охраной» стоит без неё, и без строки охраны без
// списанного босса. Базы нет — проверяем текст операторов.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { chestGuardSql, placeChestSql } from "@/server/api/beta-raid/chest/chest-place-sql";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";

const flat = (s: string) => s.replace(/\s+/g, " ");
const who = { mapId: "rmap_x", q: 4, r: -2, account: "acc_1", heroId: "h1" };
const tpl: EncounterTarget = {
  name: "Тролль",
  imageUrl: null,
  backgroundUrl: null,
  maxHp: 500,
  interactionCost: 10,
  abilities: [],
  damage: 25,
} as unknown as EncounterTarget;
const guard = { stackKey: "boss:rbt_1", templateId: "rbt_1", tpl };
const chest = {
  ...who,
  itemId: "cst_mc",
  name: "Сундук O'Neil",
  image: null,
  stackKey: "custom:cst_mc",
};

describe("сундук на клетку", () => {
  const bare = flat(placeChestSql(chest, null, "chestplace:n1"));
  const guarded = flat(placeChestSql(chest, guard, "chestplace:n2"));

  it("под локами сети, рюкзака и клетки — отдельными операторами до чтения", () => {
    // Лок клетки общий с обычным сундуком: два сундука разного вида на одну клетку не встанут.
    expect(
      bare.startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('chest:acc_1')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('chestcell:rmap_x:4:-2')) AS l; WITH prior AS",
      ),
    ).toBe(true);
  });

  it("только на свободной клетке, со штукой сундука в рюкзаке и с ключом повтора", () => {
    expect(bare).toContain(
      "NOT (f.building OR f.obj OR f.water OR f.dome OR f.chest OR f.guard OR ex.decor OR ex.ship)",
    );
    expect(bare).toContain(
      "box AS (SELECT b.id FROM yuplink.raid_hero_backpack b WHERE b.hero_id = 'h1' AND b.stack_key = 'custom:cst_mc' AND b.count >= 1 FOR UPDATE)",
    );
    expect(bare).toContain("ON CONFLICT (map_id, q, r) DO NOTHING");
    expect(bare).toContain("WHERE op = 'chestplace:n1'");
    expect(bare).toContain("'Сундук O''Neil'");
  });

  it("хозяин — тот, кто ставит: забранный у чужого встаёт в его сеть (или новой сетью)", () => {
    expect(bare).toContain(
      "INSERT INTO yuplink.raid_magic_chest (map_id, q, r, owner_account, item_id, name, image) SELECT 'rmap_x', 4, -2, 'acc_1', 'cst_mc'",
    );
  });

  it("без охраны — ни строки охраны, ни босса", () => {
    expect(bare).not.toContain("raid_mine_guard (");
    expect(bare).not.toContain("boss_upd");
    expect(bare).toContain("true AS boss");
  });

  it("с охраной — сундук, охрана и оба списания держатся за одну вставку сундука", () => {
    expect(guarded).toContain(
      "b.stack_key = 'boss:rbt_1' AND b.kind = 'boss' AND b.count >= 1 FOR UPDATE",
    );
    expect(guarded).toContain("SELECT 1 FROM prior, f, ex, box, boss WHERE NOT prior.was");
    expect(guarded).toContain(
      "NULL, NULL, now() FROM ins ON CONFLICT (map_id, q, r) DO UPDATE SET",
    );
    expect(guarded).toContain("FROM box, ins WHERE b.id = box.id AND b.count - 1 >= 0.001");
    expect(guarded).toContain("FROM boss, ins WHERE b.id = boss.id AND b.count - 1 >= 0.001");
    expect(guarded).toContain("DELETE FROM yuplink.raid_hero_backpack b USING boss, ins");
    expect(guarded).toContain("mob_count = LEAST(b.mob_count, b.count - 1)");
  });
});

describe("охрана к своему сундуку", () => {
  const sql = flat(chestGuardSql(who, guard, "guardplace:n1"));

  it("под теми же локами, что «Забрать сундук»: тот не вернёт неоплаченного босса", () => {
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('chest:acc_1')) AS l;")).toBe(
      true,
    );
    expect(sql).toContain("SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l; WITH prior AS");
  });

  it("только к моему незакопанному сундуку и не поверх живой охраны; поверженная — не помеха", () => {
    expect(sql).toContain(
      "raid_magic_chest mc WHERE mc.map_id = 'rmap_x' AND mc.q = 4 AND mc.r = -2 AND mc.owner_account = 'acc_1' AND mc.buried_at IS NULL",
    );
    expect(sql).toContain(
      "busy AS ( SELECT 1 FROM yuplink.raid_mine_guard g WHERE g.map_id = 'rmap_x' AND g.q = 4 AND g.r = -2 AND NOT (g.killed_at IS NOT NULL OR g.current_hp <= 0) )",
    );
    expect(sql).not.toContain("g.killed_by");
    expect(sql).toContain("WHERE NOT prior.was AND NOT EXISTS (SELECT 1 FROM busy)");
  });

  it("строка охраны и списание босса — вместе, ключ — от вставки охраны", () => {
    expect(sql).toContain("NULL, NULL, now() FROM go ON CONFLICT (map_id, q, r) DO UPDATE SET");
    expect(sql).toContain("FROM boss, grd WHERE b.id = boss.id");
    expect(sql).toContain("SELECT 'guardplace:n1' FROM grd");
    expect(sql).toContain("500, 500, '25'");
  });
});
