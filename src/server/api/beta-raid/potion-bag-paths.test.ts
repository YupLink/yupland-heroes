// Ни один путь, которым зелье приходит герою, не кладёт его в рюкзак (правило
// владельца 29.09): маркет и город (deliverGood), награды и «Добыча»
// (grantExtraReward), урожай грядки, склад «Забрать». Проверка места и запись —
// настоящие (market-backpack), база — фейк, считающий тем же SQL.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bag, bagCells, bagDb, resetBag } from "@/test/potionBagFake";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

const caps = vi.hoisted(() => ({ heroId: "h1", capacity: 5, potionCapacity: 1 }));

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async (sql: string) => bagDb(sql) }));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  stackKeyFor: async (it: { kind: string; refId?: string | null; id?: string | null }) =>
    `${it.kind}:${it.refId ?? it.id}`,
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) || null,
  canonCustomMeta: async (id: string) => ({ name: id, image: null }),
}));
vi.mock("@/server/api/beta-raid/market-backpack", async (orig) => ({
  ...(await orig<typeof import("@/server/api/beta-raid/market-backpack")>()),
  resolveBackpack: async () => ({ ...caps }),
}));
vi.mock("@/server/api/beta-raid/market-money", () => ({ credit: async () => {} }));
vi.mock("@/server/api/beta-raid/art-rarity", () => ({}));
vi.mock("@/server/api/beta-raid/art-stock", () => ({}));
vi.mock("@/server/api/beta-raid/game-item-grant", () => ({}));
vi.mock("@/server/api/user-shared", () => ({ accountOf: async () => "acc1" }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ myMapId: async () => "m1" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc1" }));
vi.mock("@/server/api/beta-raid/warehouse-store", () => ({ warehouseAt: async () => ({}) }));
vi.mock("@/server/api/beta-raid/econ/trade-hooks", () => ({ noteShelf: async () => {} }));

import { deliverGood } from "@/server/api/beta-raid/market-deliver";
import { grantExtraReward } from "@/server/api/raid-reward-extra";
import { isSoftGrantError } from "@/server/api/raid-claim-run";
import { giveFieldReward } from "@/server/api/beta-raid/field-reward";
import { takeFromWarehouse } from "@/server/api/beta-raid/warehouse-take";
import type { MarketItem } from "@/lib/marketItem";

const HEAL = "custom:cst_heal";
const good = (id: string) =>
  ({ id: `mkt_${id}`, kind: "custom", refId: id, name: id, image: null }) as unknown as MarketItem;
const buy = (id: string, qty: number) =>
  deliverGood({
    wallet: "w1",
    account: "acc1",
    item: good(id),
    qty,
    payRef: "p",
    nonce: `n_${id}`,
  });
const reward = (id: string, amount: number) =>
  grantExtraReward({ kind: "custom", wallet: "w1", amount, ref: id, opRef: `rr_${id}` });
const harvest = (id: string, units: number) =>
  giveFieldReward({
    wallet: "w1",
    account: "acc1",
    reward: { kind: "item", itemId: id, name: id, image: null },
    units,
    ref: "f",
    nonce: "fn",
  });
const take = (qty: number) =>
  (takeFromWarehouse as unknown as (a: { data: object }) => Promise<{ qty: number }>)({
    data: { q: 1, r: 2, stackKey: HEAL, scope: "shared", qty },
  });

beforeEach(() => {
  resetBag();
  bag.potionIds = new Set(["cst_heal", "cst_speed"]);
  Object.assign(caps, { capacity: 5, potionCapacity: 1 });
});

describe("сумка полна, рюкзак свободен — зелье не приходит ни одним путём", () => {
  beforeEach(() => bag.rows.set("custom:cst_speed", CELL_SIZE));

  it("маркет, город и скупка (deliverGood)", async () => {
    await expect(buy("cst_heal", 1)).rejects.toThrow("market.potion_bag_need:1:0");
  });

  it("награды и «Добыча»: отказ мягкий — награда ждёт в очереди", async () => {
    const e = await reward("cst_heal", 1).catch((x: unknown) => x);
    expect(String(e)).toContain("market.potion_bag_need:1:0");
    expect(isSoftGrantError(e)).toBe(true);
  });

  it("урожай грядки", async () => {
    await expect(harvest("cst_heal", 3)).rejects.toThrow("market.potion_bag_need:1:0");
  });

  it("склад «Забрать»: «Нет места в сумке зелий», полка не тронута", async () => {
    bag.shelf = 60;
    await expect(take(60)).rejects.toThrow("market.potion_bag_full");
    expect(bag.shelf).toBe(60);
  });

  it("после всех попыток в рюкзаке ни одного зелья, а товар ложится", async () => {
    await Promise.allSettled([buy("cst_heal", 1), reward("cst_heal", 1), harvest("cst_heal", 1)]);
    expect(bagCells()).toEqual({ items: 0, potions: 1 });
    await expect(buy("cst_apple", 5 * CELL_SIZE)).resolves.toMatchObject({ target: "backpack" });
    expect(bagCells()).toEqual({ items: 5, potions: 1 });
  });
});

describe("частичная выдача — сколько влезет в СУМКУ", () => {
  it("склад: долив своей ячейки + свободная ячейка сумки, остаток на полке", async () => {
    caps.potionCapacity = 2;
    bag.rows.set(HEAL, CELL_SIZE - 6);
    bag.shelf = 3 * CELL_SIZE;
    // Рюкзак свободен на все пять ячеек — зелью это ничего не даёт.
    await expect(take(3 * CELL_SIZE)).resolves.toMatchObject({ qty: CELL_SIZE + 6 });
    expect(bag.rows.get(HEAL)).toBe(2 * CELL_SIZE);
    expect(bag.shelf).toBe(2 * CELL_SIZE - 6);
    expect(bagCells()).toEqual({ items: 0, potions: 2 });
  });

  it("склад, гонка за последнюю ячейку сумки: легло одно, второе вернулось на полку", async () => {
    bag.rows.set("custom:cst_speed", CELL_SIZE);
    caps.potionCapacity = 2;
    bag.shelf = 2 * CELL_SIZE;
    const res = await Promise.allSettled([take(CELL_SIZE), take(CELL_SIZE)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toContain("market.potion_bag_need:1:0");
    expect(bag.rows.get(HEAL)).toBe(CELL_SIZE);
    expect(bag.shelf).toBe(CELL_SIZE);
    expect(bagCells()).toEqual({ items: 0, potions: 2 });
  });

  it("склад: обычный товар по-прежнему меряет рюкзак", async () => {
    bag.rows.set("custom:cst_speed", CELL_SIZE);
    bag.potionIds.delete("cst_heal");
    bag.shelf = 3 * CELL_SIZE;
    await expect(take(3 * CELL_SIZE)).resolves.toMatchObject({ qty: 3 * CELL_SIZE });
  });
});

describe("переполненный герой: ничего не отбираем и новое не принимаем", () => {
  beforeEach(() => {
    bag.rows.set(HEAL, CELL_SIZE - 6);
    bag.rows.set("custom:cst_speed", CELL_SIZE);
  });

  it("ни долив, ни новый вид, ни склад", async () => {
    bag.shelf = 5;
    await expect(buy("cst_heal", 1)).rejects.toThrow("market.potion_bag_need:1:0");
    bag.potionIds.add("cst_rage");
    await expect(reward("cst_rage", 1)).rejects.toThrow("market.potion_bag_need:2:0");
    await expect(take(5)).rejects.toThrow("market.potion_bag_full");
    expect([...bag.rows]).toEqual([
      [HEAL, CELL_SIZE - 6],
      ["custom:cst_speed", CELL_SIZE],
    ]);
    expect(bag.shelf).toBe(5);
  });

  it("освобождённые рюкзаком ячейки — только товарам и только до ёмкости", async () => {
    await expect(buy("cst_apple", 5 * CELL_SIZE)).resolves.toMatchObject({ target: "backpack" });
    await expect(buy("cst_milk", 1)).rejects.toThrow("market.backpack_need:1:0");
    expect(bagCells()).toEqual({ items: 5, potions: 2 });
  });
});
