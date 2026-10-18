// Происхождение «с мобов» в рюкзаке: формулы и то, что их зовут все пути
// записи. Базы здесь нет — проверяем, КАКОЙ SQL уходит и что едет в снимке.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  sql: [] as string[],
  /** Ответ UPDATE списания (null — строки нет / не хватило). */
  taken: null as null | Record<string, unknown>,
  /** Ответ UPDATE возврата: есть ли ячейка. */
  cellExists: true,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    state.sql.push(sql);
    if (sql.includes("raid_backpack_op")) return [{ _row: { claimed: true } }];
    if (sql.includes("FOR UPDATE")) return state.taken ? [state.taken] : [];
    if (sql.trim().startsWith("UPDATE")) return state.cellExists ? [{ id: "bp_1" }] : [];
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  stackKeyFor: async () => "custom:cst_wheat",
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) || null,
  canonCustomMeta: async () => ({ name: "Пшеница", image: null }),
}));

import {
  BARE_COLS,
  OLD_COLS,
  mobAfterGrowSql,
  mobAfterTakeSql,
  mobBackOf,
} from "@/server/api/beta-raid/backpack-mob";
import { depositToBackpack } from "@/server/api/beta-raid/market-backpack-write";
import { takeFromBackpackStack } from "@/server/api/beta-raid/market-backpack-take";
import { returnToBackpackStack } from "@/server/api/beta-raid/market-backpack-return";

const flat = (s: string) => s.replace(/\s+/g, " ");
const last = () => flat(state.sql[state.sql.length - 1] ?? "");

beforeEach(() => {
  state.sql = [];
  state.taken = null;
  state.cellExists = true;
});

describe("формулы", () => {
  it("прирост: прежние мобы не больше count, плюс добавленные", () => {
    expect(mobAfterGrowSql(OLD_COLS, "EXCLUDED.mob_count")).toBe(
      "LEAST(yuplink.raid_hero_backpack.mob_count, yuplink.raid_hero_backpack.count) + EXCLUDED.mob_count",
    );
  });

  it("прирост с потолком нового count (возврат по снимку)", () => {
    expect(mobAfterGrowSql(BARE_COLS, "2", "count + 5")).toBe(
      "LEAST(LEAST(mob_count, count) + 2, count + 5)",
    );
  });

  it("списание: купленное уходит первым", () => {
    expect(mobAfterTakeSql(BARE_COLS, 3)).toBe("LEAST(mob_count, count - 3)");
  });

  it("возврат: мобов не больше, чем возвращаем", () => {
    expect(mobBackOf(5, 2)).toBe(2);
    expect(mobBackOf(3, 10)).toBe(3);
    expect(mobBackOf(0.3, 0.30000000000000004)).toBe(0.3);
    expect(mobBackOf(5, undefined)).toBe(0);
    expect(mobBackOf(5, -1)).toBe(0);
    expect(mobBackOf(5, Number.NaN)).toBe(0);
  });
});

const deposit = (mob?: boolean, origin?: Parameters<typeof depositToBackpack>[0]["origin"]) =>
  depositToBackpack({
    heroId: "hero_1",
    account: "acc_1",
    item: { kind: "custom", refId: "cst_wheat", name: "Пшеница", image: null },
    qty: 5,
    nonce: "n1",
    capacity: 10,
    potionCapacity: 0,
    mob,
    origin,
  });

describe("вклад в рюкзак", () => {
  it("с мобов: новая строка несёт mob_count = qty", async () => {
    await deposit(true);
    const sql = last();
    expect(sql).toContain("count, mob_count, mine_count, field_count, loot_count)");
    expect(sql).toMatch(/, 5, 5, 0, 0, 0 FROM claim/);
    expect(sql).toContain(
      "mob_count = LEAST(yuplink.raid_hero_backpack.mob_count, yuplink.raid_hero_backpack.count) + EXCLUDED.mob_count",
    );
  });

  it("покупка (по умолчанию): метки = 0, прежние только нормализуются", async () => {
    await deposit();
    expect(last()).toMatch(/, 5, 0, 0, 0, 0 FROM claim/);
  });

  it("урожай грядки, добыча шахты, прочее собранное — своими метками; разбор — как есть", async () => {
    await deposit(undefined, "field");
    expect(last()).toMatch(/, 5, 0, 0, 5, 0 FROM claim/);
    await deposit(undefined, "mine");
    expect(last()).toMatch(/, 5, 0, 5, 0, 0 FROM claim/);
    await deposit(undefined, "loot");
    expect(last()).toMatch(/, 5, 0, 0, 0, 5 FROM claim/);
    await deposit(true, { mob: 1, mine: 2, field: 9 });
    expect(last()).toMatch(/, 5, 1, 2, 2, 0 FROM claim/);
    await deposit(true, "field");
    expect(last()).toMatch(/, 5, 0, 0, 5, 0 FROM claim/);
    await deposit(undefined, null);
    expect(last()).toMatch(/, 5, 0, 0, 0, 0 FROM claim/);
  });

  it("прирост меток шахт и грядок — префиксами, как у мобов", async () => {
    await deposit(undefined, "mine");
    const sql = last();
    const old = "yuplink.raid_hero_backpack";
    expect(sql).toContain(
      `mine_count = (LEAST(${old}.mob_count + ${old}.mine_count, ${old}.count) + EXCLUDED.mob_count + EXCLUDED.mine_count) - (LEAST(${old}.mob_count, ${old}.count) + EXCLUDED.mob_count)`,
    );
    expect(sql).toContain(
      `field_count = (LEAST(${old}.mob_count + ${old}.mine_count + ${old}.field_count, ${old}.count)`,
    );
    expect(sql).toContain(
      `loot_count = (LEAST(${old}.mob_count + ${old}.mine_count + ${old}.field_count + ${old}.loot_count, ${old}.count)`,
    );
  });
});

describe("списание", () => {
  it("читает прежние числа под FOR UPDATE и отдаёт mobTaken", async () => {
    state.taken = {
      kind: "custom",
      refId: "cst_wheat",
      name: "Пшеница",
      image: "",
      count: 7,
      mobTaken: 2,
    };
    const snap = await takeFromBackpackStack("hero_1", "custom:cst_wheat", 3);
    const sql = flat(state.sql[0]);
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("mob_count = LEAST(b.mob_count, b.count - 3)");
    expect(sql).toContain('LEAST(o.old_mob, o.old_count) - b.mob_count) AS "mobTaken"');
    expect(snap).toEqual({
      kind: "custom",
      refId: "cst_wheat",
      name: "Пшеница",
      image: null,
      mobTaken: 2,
      mineTaken: 0,
      fieldTaken: 0,
      lootTaken: 0,
    });
  });

  it("метки шахт и грядок: списываются тем же SQL и едут в снимке", async () => {
    state.taken = {
      kind: "custom",
      refId: null,
      name: "x",
      image: null,
      count: 2,
      mobTaken: 1,
      mineTaken: "1",
      fieldTaken: 5,
    };
    const snap = await takeFromBackpackStack("hero_1", "custom:cst_wheat", 3);
    const sql = flat(state.sql[0]);
    expect(sql).toContain(
      "mine_count = (LEAST(b.mob_count + b.mine_count, b.count - 3)) - (LEAST(b.mob_count, b.count - 3))",
    );
    expect(sql).toContain(
      "mine_count AS old_mine, field_count AS old_field, loot_count AS old_loot",
    );
    expect(sql).toContain('AS "fieldTaken"');
    expect(sql).toContain('AS "lootTaken"');
    // Меток ушло не больше, чем штук: 1 моб + 1 шахта + 1 грядка из трёх.
    expect(snap).toMatchObject({ mobTaken: 1, mineTaken: 1, fieldTaken: 1 });
  });

  it("mobTaken не больше списанного", async () => {
    state.taken = { kind: "custom", refId: null, name: "x", image: null, count: 1, mobTaken: "9" };
    expect((await takeFromBackpackStack("hero_1", "custom:cst_wheat", 3))?.mobTaken).toBe(3);
  });

  it("не хватило — null, как прежде", async () => {
    expect(await takeFromBackpackStack("hero_1", "custom:cst_wheat", 3)).toBeNull();
  });
});

describe("возврат (откат оплаты)", () => {
  const snap = { kind: "custom", refId: "cst_wheat", name: "Пшеница", image: null, mobTaken: 2 };

  it("в живую ячейку: мобы из снимка обратно, не выше нового count", async () => {
    await returnToBackpackStack("hero_1", "custom:cst_wheat", 5, snap, "acc_1");
    expect(flat(state.sql[0])).toContain(
      "mob_count = LEAST(LEAST(mob_count, count) + 2, count + 5)",
    );
  });

  it("метки шахт и грядок из снимка возвращаются, но не больше возвращаемого", async () => {
    state.cellExists = false;
    const all = { ...snap, mobTaken: 2, mineTaken: 2, fieldTaken: 4 };
    await returnToBackpackStack("hero_1", "custom:cst_wheat", 5, all, "acc_1");
    expect(flat(state.sql[0])).toContain(
      "mine_count = (LEAST(LEAST(mob_count + mine_count, count) + 2 + 2, count + 5)) - (LEAST(LEAST(mob_count, count) + 2, count + 5))",
    );
    expect(flat(state.sql[1])).toMatch(/, 5, 2, 2, 1, 0\) ON CONFLICT/);
  });

  it("без снимка мобов — только нормализация", async () => {
    await returnToBackpackStack("hero_1", "custom:cst_wheat", 5);
    expect(flat(state.sql[0])).toContain(
      "mob_count = LEAST(LEAST(mob_count, count) + 0, count + 5)",
    );
  });

  it("ячейка удалена: новая строка с mob_count из снимка", async () => {
    state.cellExists = false;
    await returnToBackpackStack("hero_1", "custom:cst_wheat", 5, snap, "acc_1");
    const ins = flat(state.sql[1]);
    expect(ins).toContain("count, mob_count, mine_count, field_count, loot_count)");
    expect(ins).toMatch(/, 5, 2, 0, 0, 0\) ON CONFLICT/);
    expect(ins).toContain(
      "LEAST(LEAST(yuplink.raid_hero_backpack.mob_count, yuplink.raid_hero_backpack.count) + EXCLUDED.mob_count, yuplink.raid_hero_backpack.count + EXCLUDED.count)",
    );
  });
});
