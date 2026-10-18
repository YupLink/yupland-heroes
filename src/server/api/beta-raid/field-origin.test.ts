// Где рождаются метки (ПРАВИЛА §8.18): урожай грядки — «с грядок» на личной
// полке склада и в рюкзаке (общая полка — ничья, без метки), ресурс грядки —
// видом 'field' в журнале счёта. Сеттл и зачисление на склад — настоящие; база
// и запись полки — подмены.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  upserts: [] as Array<{ scope: string; qty: number; origin: unknown }>,
  deposits: [] as Array<Record<string, unknown>>,
  shelf: [] as Array<Record<string, unknown>>,
  units: 3,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_field_worker"))
      return [{ account_id: "acc_1", wallet: "w" }];
    if (sql.includes("FROM yuplink.raid_map_cells c")) return [{ q: 31, r: 90 }];
    if (sql.includes("raid_field_take")) return [{ units: s.units }];
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/warehouse-upsert", () => ({
  upsertSlot: async (...a: unknown[]) => {
    s.upserts.push({ scope: a[2] as string, qty: a[6] as number, origin: a[9] });
    return true;
  },
}));
vi.mock("@/server/api/beta-raid/building-action", () => ({ loadCellBuilding: async () => null }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ ownCell: async () => null }));
vi.mock("@/server/api/beta-raid/econ/trade-hooks", () => ({
  noteShelf: async (o: Record<string, unknown>) => void s.shelf.push(o),
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonRef: async (_k: string, id: string) => id,
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 10, potionCapacity: 0 }),
  assertBackpackRoom: async () => {},
  stackKeyFor: async () => "custom:cst_wheat",
  depositToBackpack: async (o: Record<string, unknown>) => void s.deposits.push(o),
}));

import { settleFieldPayout } from "@/server/api/beta-raid/field-settle";
import { giveFieldReward } from "@/server/api/beta-raid/field-reward";
import type { FieldConfig } from "@/lib/fieldConfig";

const cfgOf = (reward: FieldConfig["reward"]): FieldConfig => ({
  reward,
  yield: 2,
  rarities: [],
  levelMode: "any",
  levelFrom: 1,
  levelTo: 100,
  maxHeroes: 0,
});
const wheat = { kind: "item" as const, itemId: "cst_wheat", name: "Пшеница", image: null };
const gold = { kind: "resource" as const, resource: "gold" as const, token: null };
const flat = (x: string) => x.replace(/\s+/g, " ");

beforeEach(() => {
  s.sql = [];
  s.upserts = [];
  s.deposits = [];
  s.shelf = [];
  s.units = 3;
});

describe("урожай грядки → «с грядок»", () => {
  it("товар оседает на полке склада с меткой грядки", async () => {
    await settleFieldPayout("m1", 30, 90, cfgOf(wheat));
    const field3 = { mob: 0, mine: 0, field: 3, loot: 0 };
    expect(s.upserts).toEqual([{ scope: "own", qty: 3, origin: field3 }]);
  });

  it("не влезшее в личное уходит на общую полку — уже ничьё, без метки", async () => {
    s.units = 50;
    await settleFieldPayout("m1", 30, 90, cfgOf(wheat));
    expect(s.upserts).toEqual([
      { scope: "own", qty: 40, origin: { mob: 0, mine: 0, field: 40, loot: 0 } },
      { scope: "shared", qty: 10, origin: undefined },
    ]);
  });

  it("журнал сделок: личные ячейки — «пришло на счёт» (take), общая полка — put", async () => {
    s.units = 50;
    await settleFieldPayout("m1", 30, 90, cfgOf(wheat));
    const rows = s.shelf.map((o) => [o.source, o.side ?? "put", o.qty, o.account]);
    expect(rows).toEqual([
      ["field", "take", 40, "acc_1"],
      ["field", "put", 10, "acc_1"],
    ]);
    expect(String(s.shelf[0].ref)).toMatch(/:own$/);
  });

  it("ресурс грядки на полке — тоже «с грядок»", async () => {
    await settleFieldPayout("m1", 30, 90, cfgOf(gold));
    expect(s.upserts[0]).toMatchObject({ origin: { field: 3 } });
  });

  it("товар грядки в рюкзак — с меткой грядки", async () => {
    await giveFieldReward({
      wallet: "w",
      account: "acc_1",
      reward: wheat,
      units: 1,
      ref: "r",
      nonce: "n",
    });
    expect(s.deposits[0]).toMatchObject({ qty: 1, origin: "field" });
  });

  it("ресурс грядки на счёт — видом 'field', не 'mine'; под ключом поля", async () => {
    await giveFieldReward({
      wallet: "w",
      account: "acc_1",
      reward: gold,
      units: 1,
      ref: "field-leave:m1:30:90:acc_1:x",
      nonce: "n1",
    });
    const sql = flat(s.sql[0]);
    expect(sql).toContain("INSERT INTO yuplink.raid_field_op (op) VALUES ('fr:n1')");
    expect(sql).toContain(
      "SELECT yuplink.res_move('acc_1', 'gold', 1, 'field', 'field-leave:m1:30:90:acc_1:x') FROM claim",
    );
  });

  it("лайки/энергия/токен грядки — прежней функцией (вид энергии решает таяние)", async () => {
    const likes = { kind: "resource" as const, resource: "likes" as const, token: null };
    await giveFieldReward({
      wallet: "w",
      account: "a",
      reward: likes,
      units: 1,
      ref: "r",
      nonce: "n",
    });
    expect(flat(s.sql[0])).toContain(
      "SELECT yuplink.raid_mine_credit('a', 'w', 'likes', NULL, 1, 'r')",
    );
  });
});
