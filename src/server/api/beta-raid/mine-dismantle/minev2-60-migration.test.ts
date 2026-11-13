// minev2-60: разборка шахты — одна функция базы под локами: повтор ключа,
// только v2 и не остров, поломка как у обхода, работающая — отказ, энергия
// той же транзакцией и до записи клетки, мешочек на клетке, ключ с итогом.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../../../../migrations/minev2-60-dismantle.sql", import.meta.url),
  "utf8",
);
const flat = sql.replace(/\s+/g, " ");
const at = (s: string) => flat.indexOf(s);
const body = flat.slice(
  at("CREATE OR REPLACE FUNCTION yuplink.raid_mine_dismantle"),
  at("END $fn$;"),
);

describe("minev2-60-dismantle", () => {
  it("транзакция и короткий лок; функция идемпотентна", () => {
    expect(flat).toMatch(/^.*BEGIN; SET LOCAL lock_timeout = '5s';/);
    expect(flat.trim().endsWith("COMMIT;")).toBe(true);
    expect(flat).toContain("CREATE INDEX IF NOT EXISTS raid_mine_op_dismantle_unsent");
  });

  it("локи в порядке постановки шахты, повтор ключа — прошлый итог", () => {
    const locks = ["'godmove:'", "'chestcell:'", "'lootdrop:'", "'mine:'"].map((k) =>
      body.indexOf(k),
    );
    expect(locks.every((x) => x > 0)).toBe(true);
    expect([...locks].sort((a, b) => a - b)).toEqual(locks);
    expect(body).toContain("RETURN v_prev || jsonb_build_object('was', true)");
    expect(body.indexOf("RETURN v_prev")).toBeLessThan(body.indexOf("energy_touch_acc"));
  });

  it("только шахта v2 не на острове; срок вышел — ломаем; работает — отказ", () => {
    expect(body).toContain("yuplink.raid_mine_v2_std(c.building_config) IS NULL");
    expect(body).toContain(
      "yuplink.raid_mine_is_island(c.building_config) OR left(p_map, 5) = 'isle_'",
    );
    const brk = body.indexOf("FROM yuplink.raid_mine_break(p_map, p_q, p_r)");
    const working = body.indexOf("RAISE EXCEPTION 'mine_working'");
    expect(brk).toBeGreaterThan(0);
    expect(working).toBeGreaterThan(brk);
  });

  it("энергия — той же транзакцией, до записи клетки и мешочка", () => {
    const pay = body.indexOf("PERFORM yuplink.energy_touch_acc(p_account, p_cost)");
    expect(pay).toBeGreaterThan(body.indexOf("RAISE EXCEPTION 'mine_working'"));
    expect(pay).toBeLessThan(body.indexOf("UPDATE yuplink.raid_map_cells"));
    expect(pay).toBeLessThan(body.indexOf("INSERT INTO yuplink.raid_loot_bag "));
  });

  it("клетка пуста целиком: постройка, тир, охрана, блок; жилы не трогаем", () => {
    expect(body).toContain(
      "SET building_id = NULL, building_config = NULL, building_skin_id = NULL",
    );
    expect(body).toContain("DELETE FROM yuplink.beta_raid_building_state");
    expect(body).toContain("DELETE FROM yuplink.raid_mine_guard");
    expect(body).toContain("SET group_id = NULL, icon_scale = NULL");
    expect(body).not.toContain("raid_map_vein");
  });

  it("мешочек от ключа на клетке шахты; срок порции — из p_items; ключ 'dismantle'", () => {
    expect(body).toContain("v_bag text := 'lb_' || md5('mdis:' || COALESCE(p_op, ''))");
    expect(body).toContain(
      "VALUES (v_bag, p_map, p_q, p_r, now(), p_account, 'mine', p_name, now())",
    );
    expect(body).toContain("now() + make_interval(hours => v.h)");
    expect(body).toContain("VALUES (p_op, 'dismantle', p_map, p_q, p_r, p_account, v_res)");
  });
});
