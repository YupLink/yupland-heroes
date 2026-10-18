// Запись на полку склада несёт метки происхождения (ПРАВИЛА §8.18): новая
// строка личной полки — метками кладущегося, существующая — складывает их со
// своими. Общая полка меток не хранит (владелец, 29.09.2026: она не «моя») —
// запись обнуляет и те, что лежали там до этого правила.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dec } from "@/test/numeric";
import { evalSql, setsOf } from "@/test/sqlExpr";

const s = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return [{ wrote: 1, fits: true }];
  },
}));

import { upsertSlot } from "@/server/api/beta-raid/warehouse-upsert";

const snap = { kind: "custom", refId: "cst_x", name: "Икс", image: null };
const flat = (x: string) => x.replace(/\s+/g, " ");
const at = { q: 1, r: 2 };

/** Слить вклад в существующую строку тем SQL, что уйдёт в базу. */
function merge(sql: string, old: Record<string, string>, add: Record<string, string>) {
  const env: Record<string, bigint> = {};
  for (const [k, v] of Object.entries(old)) env[`yuplink.raid_warehouse_slot.${k}`] = dec(v);
  for (const [k, v] of Object.entries(add)) env[`EXCLUDED.${k}`] = dec(v);
  const out: Record<string, bigint> = {};
  for (const [col, expr] of setsOf(sql)) out[col] = evalSql(expr, env);
  return out;
}
const row = (count: string, mob: string, mine: string, field: string, loot = "0") => ({
  count,
  mob_count: mob,
  mine_count: mine,
  field_count: field,
  loot_count: loot,
});

beforeEach(() => {
  s.sql = [];
});

describe("upsertSlot: метки происхождения", () => {
  it("новая строка личной полки — метками кладущегося, не больше штук", async () => {
    await upsertSlot("m1", at, "own", "acc1", "custom:cst_x", snap, 5, "op1", 2, { field: 5 });
    expect(flat(s.sql[0])).toContain("count, mob_count, mine_count, field_count, loot_count)");
    expect(flat(s.sql[0])).toMatch(/, 5, 0, 0, 5, 0 FROM room CROSS JOIN claim/);
    await upsertSlot("m1", at, "own", "acc1", "custom:cst_x", snap, 5, "op1", 2, { loot: 9 });
    expect(flat(s.sql[1])).toMatch(/, 5, 0, 0, 0, 5 FROM room CROSS JOIN claim/);
  });

  it("общая полка: новая строка без меток, что бы ни пришло", async () => {
    await upsertSlot("m1", at, "shared", null, "custom:cst_x", snap, 5, undefined, 8, { mob: 9 });
    expect(flat(s.sql[0])).toMatch(/, 5, 0, 0, 0, 0 FROM room WHERE/);
  });

  it("без меток — безымянное; путь без лимита (откаты) пишет их так же", async () => {
    await upsertSlot("m1", at, "own", "acc1", "custom:cst_x", snap, 2);
    expect(flat(s.sql[0])).toMatch(/, 2, 0, 0, 0, 0\) ON CONFLICT/);
    await upsertSlot("m1", at, "own", "acc1", "custom:cst_x", snap, 2, "op2", 0, { mine: 2 });
    expect(flat(s.sql[1])).toMatch(/, 2, 0, 2, 0, 0 FROM \(INSERT INTO yuplink.raid_field_op/);
  });

  it("общая полка: вклад обнуляет и прежние метки строки — они ничьи", async () => {
    await upsertSlot("m1", at, "shared", null, "custom:cst_x", snap, 5, undefined, 8, { field: 5 });
    const got = merge(s.sql[0], row("10", "10", "0", "0", "3"), row("5", "0", "0", "0"));
    expect(got).toEqual({
      count: dec("15"),
      mob_count: 0n,
      mine_count: 0n,
      field_count: 0n,
      loot_count: 0n,
    });
  });

  it("личная полка: старая строка без меток остаётся безымянной, вклад — со своими", async () => {
    await upsertSlot("m1", at, "own", "acc1", "custom:cst_x", snap, 3, undefined, 2, { loot: 3 });
    const got = merge(s.sql[0], row("7", "0", "0", "0"), row("3", "0", "0", "0", "3"));
    expect(got).toEqual({
      count: dec("10"),
      mob_count: 0n,
      mine_count: 0n,
      field_count: 0n,
      loot_count: dec("3"),
    });
  });

  it("личная полка: вклад складывается со своими метками", async () => {
    await upsertSlot("m1", at, "own", "acc1", "custom:cst_x", snap, 4, undefined, 2, { mob: 4 });
    const got = merge(s.sql[0], row("6", "1", "0", "2", "3"), row("4", "4", "0", "0"));
    expect(got).toEqual({
      count: dec("10"),
      mob_count: dec("5"),
      mine_count: 0n,
      field_count: dec("2"),
      loot_count: dec("3"),
    });
  });
});
