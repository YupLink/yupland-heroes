// DARAI-шахта и мешочек (lib/daraiMine): из мешочка — только целиком (половинку
// не разместить); места нет — не берётся вовсе; положить в мешочек и выбросить
// её нельзя («выбросил-поднял» сбрасывал бы час, через мешочек она уходила бы
// другому) — отказ dmine.stays, рюкзак не тронут.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { countOf, db, md5, packOf, resetDb, seedBag } from "./bag.fake";
import { dict } from "@/lib/translations/braid-dmine";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-put-sql", async () => (await import("./bag.fake-mocks")).putSqlMod);
vi.mock("./bag-take-sql", async () => (await import("./bag.fake-mocks")).takeSqlMod);
vi.mock("./bag-back-sql", async () => (await import("./bag.fake-mocks")).backSqlMod);
vi.mock("../chest/chest-net-read", async () => (await import("./bag.fake-mocks")).netRead);
vi.mock("../item-alias", async () => (await import("./bag.fake-mocks")).alias);
vi.mock("../potion-bag", () => ({ potionKeysOf: async () => new Set<string>() }));
vi.mock("./bag-note", () => ({ noteBagPut: async () => {}, noteBagTake: async () => {} }));
vi.mock("../tool-wear", async () => (await import("./bag.fake-mocks")).toolWear);
vi.mock("../open-pass/pass", async () => (await import("./bag.fake-mocks")).pass);
vi.mock("../market-backpack", async () => (await import("./bag.fake-mocks")).backpack);
vi.mock("../gate", async () => (await import("./bag.fake-mocks")).session.gate);
vi.mock("@/server/rateGate", async () => (await import("./bag.fake-mocks")).session.rate);
vi.mock("../encounter-where", async () => (await import("./bag.fake-mocks")).session.where);
vi.mock("../../currency/move", async () => (await import("./bag.fake-mocks")).session.move);
vi.mock("../voidGate", async () => (await import("./bag.fake-mocks")).session.voidGate);
vi.mock("../owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("@tanstack/react-start", async () => (await import("./bag.fake-mocks")).startFn);

const { who } = await import("./bag.fake-mocks");
type Fn = (a: { data: unknown }) => Promise<unknown>;
const putFn = (await import("./bag-put")).putToLootBag as unknown as Fn;
const takeFn = (await import("./bag-take")).takeFromLootBag as unknown as Fn;
const { discardToBag } = await import("./bag-discard");

const DMINE = "dmine:dm_1";
const APPLE = "custom:cst_apple";
const BAG = `lb_${md5("seed")}`;
let n = 0;
const op = () => `op-${++n}-press`;
const take = (qty?: number) => {
  who.wallet = "w1";
  return takeFn({ data: { bagId: BAG, stackKey: DMINE, qty, op: op() } });
};

beforeEach(() => {
  resetDb();
  db.accounts.set("w1", "acc1");
  db.heroes.set("w1", { heroId: "h1", capacity: 2, potionCapacity: 0 });
  db.pos.set("w1", { q: 5, r: 6 });
  seedBag(BAG, { q: 5, r: 7, items: [{ stackKey: DMINE, kind: "dmine", count: 1 }] });
});

describe("из мешочка — только целиком", () => {
  it("просили половинку — шахта уходит целиком", async () => {
    await expect(take(0.5)).resolves.toEqual({ taken: [{ stackKey: DMINE, qty: 1 }] });
    expect(packOf("h1").get(DMINE)?.count).toBe(1);
    expect(countOf(db.bags.get(BAG), DMINE)).toBe(0);
  });

  it("места нет — не берётся, в мешочке лежит целая", async () => {
    db.heroes.set("w1", { heroId: "h1", capacity: 1, potionCapacity: 0 });
    packOf("h1").set(APPLE, { count: 20, marks: { mob: 0, mine: 0, field: 0, loot: 0 }, wear: 0 });
    await expect(take()).rejects.toThrow("market.backpack_full");
    expect(packOf("h1").has(DMINE)).toBe(false);
    expect(countOf(db.bags.get(BAG), DMINE)).toBe(1);
  });
});

describe("класть и выбрасывать нельзя", () => {
  beforeEach(() => {
    packOf("h1").set(DMINE, { count: 1, marks: { mob: 0, mine: 0, field: 0, loot: 0 }, wear: 0 });
  });

  it("положить в мешочек — отказ, шахта в рюкзаке", async () => {
    who.wallet = "w1";
    const put = putFn({ data: { bagId: BAG, stackKey: DMINE, qty: 1, op: op() } });
    await expect(put).rejects.toThrow("dmine.stays");
    expect(packOf("h1").get(DMINE)?.count).toBe(1);
    expect(countOf(db.bags.get(BAG), DMINE)).toBe(1);
  });

  it("выбросить — отказ, мешочка не прибавилось", async () => {
    const bags = db.bags.size;
    const drop = discardToBag({ wallet: "w1", heroId: "h1", stackKey: DMINE, qty: 1 });
    await expect(drop).rejects.toThrow("dmine.stays");
    expect(packOf("h1").get(DMINE)?.count).toBe(1);
    expect(db.bags.size).toBe(bags);
  });

  it("отказ понятен на обоих языках", () => {
    expect(dict["dmine.stays"].ru).toBeTruthy();
    expect(dict["dmine.stays"].en).toBeTruthy();
  });
});
