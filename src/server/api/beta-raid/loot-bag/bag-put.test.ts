// «Положить» из рюкзака в мешочек (владелец, 29.09; §8.21): мешочек — как склад.
// Кладут в живой незакопанный мешочек вплотную; положенное — новая порция на
// 24 часа, метки едут с ним (купленное остаётся купленным); изношенная штука
// инструмента остаётся в рюкзаке; повтор нажатия и моста — без второго
// переезда. Новый мешочек так не появляется.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TTL, countOf, db, md5, packOf, resetDb, seedBag } from "./bag.fake";

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
vi.mock("@tanstack/react-start", async () => (await import("./bag.fake-mocks")).startFn);

const { who } = await import("./bag.fake-mocks");
const mod = await import("./bag-put");
const takeMod = await import("./bag-take");
const putFn = mod.putToLootBag as unknown as (a: { data: unknown }) => Promise<{ qty: number }>;

const AXE = "custom:cst_axe";
const APPLE = "custom:cst_apple";
const BAG = `lb_${md5("seed")}`;
let n = 0;
const put = (stackKey: string, qty: number, o: { op?: string; wallet?: string } = {}) => {
  who.wallet = o.wallet ?? "w1";
  return putFn({ data: { bagId: BAG, stackKey, qty, op: o.op ?? `put-${++n}-x` } });
};
const portions = (key: string) => db.bags.get(BAG)?.items.filter((p) => p.stackKey === key) ?? [];

beforeEach(() => {
  resetDb();
  db.catalog.set("cst_apple", { name: "Яблоко" });
  db.catalog.set("cst_axe", { name: "Топор" });
  db.accounts.set("w1", "acc1");
  db.heroes.set("w1", { heroId: "h1", capacity: 3, potionCapacity: 0 });
  db.pos.set("w1", { q: 5, r: 6 });
  packOf("h1").set(APPLE, { count: 10, marks: { mob: 0, mine: 0, field: 4, loot: 0 }, wear: 0 });
  seedBag(BAG, { q: 5, r: 7, items: [{ stackKey: "custom:cst_banana", count: 2 }] });
});

describe("положить", () => {
  it("из рюкзака в мешочек: новая порция на 24 часа, метки едут (купленное — первым)", async () => {
    db.now += 1000;
    expect(await put(APPLE, 7)).toEqual({ qty: 7 });
    expect(packOf("h1").get(APPLE)).toMatchObject({ count: 3, marks: { field: 3 } });
    expect(portions(APPLE)).toEqual([
      expect.objectContaining({ count: 7, expiresAt: db.now + TTL, marks: expect.objectContaining({ field: 1 }) }),
    ]);
    expect(db.events).toEqual(["5,7"]);
  });

  it("всё — стопка уходит из рюкзака целиком", async () => {
    await put(APPLE, 10);
    expect(packOf("h1").has(APPLE)).toBe(false);
    expect(countOf(db.bags.get(BAG), APPLE)).toBe(10);
  });

  it("положенное позже — своя порция со своим сроком", async () => {
    await put(APPLE, 2);
    db.now += 3600_000;
    await put(APPLE, 3);
    expect(portions(APPLE).map((p) => [p.count, p.expiresAt - db.now])).toEqual([
      [2, TTL - 3600_000],
      [3, TTL],
    ]);
  });

  it("изношенная штука инструмента остаётся в рюкзаке", async () => {
    packOf("h1").set(AXE, { count: 2, marks: { mob: 0, mine: 0, field: 0, loot: 0 }, wear: 40 });
    expect(await put(AXE, 5)).toEqual({ qty: 1 });
    expect(packOf("h1").get(AXE)).toMatchObject({ count: 1, wear: 40 });
    await expect(put(AXE, 1)).rejects.toThrow("braid.tool_worn_stays");
  });
});

describe("вход «Открыть» (§8.23)", () => {
  it("без живого входа ни положить, ни забрать — «Сначала открой», всё на месте", async () => {
    db.pass = false;
    await expect(put(APPLE, 3)).rejects.toThrow("pass.closed");
    const take = takeMod.takeFromLootBag as unknown as (a: { data: unknown }) => Promise<unknown>;
    await expect(take({ data: { bagId: BAG, op: "take-no-pass" } })).rejects.toThrow("pass.closed");
    expect(packOf("h1").get(APPLE)?.count).toBe(10);
    expect(countOf(db.bags.get(BAG), "custom:cst_banana")).toBe(2);
    expect(portions(APPLE)).toEqual([]);
  });
});

describe("повторы и отказы", () => {
  it("повтор того же нажатия — второй раз не кладёт", async () => {
    await put(APPLE, 4, { op: "same-put-1" });
    expect(await put(APPLE, 4, { op: "same-put-1" })).toEqual({ qty: 4 });
    expect(packOf("h1").get(APPLE)?.count).toBe(6);
    expect(countOf(db.bags.get(BAG), APPLE)).toBe(4);
  });

  it("ответ моста потерян после записи — исход по ключу нажатия, без второго переезда", async () => {
    db.loseOn = "put";
    expect(await put(APPLE, 4)).toEqual({ qty: 4 });
    expect(packOf("h1").get(APPLE)?.count).toBe(6);
  });

  it("не дошло до базы — «забор» ключа: отказ, опоздавшая попытка не переложит", async () => {
    db.failOn = ["put"];
    await expect(put(APPLE, 4, { op: "lost-put-1" })).rejects.toThrow("MCP timeout");
    const { runCmd } = await import("./bag.fake-cmd");
    runCmd({ cmd: "put", bagId: BAG, heroId: "h1", stackKey: APPLE, qty: 4, op: "bagput:acc1:lost-put-1" });
    expect(packOf("h1").get(APPLE)?.count).toBe(10);
    expect(countOf(db.bags.get(BAG), APPLE)).toBe(0);
  });

  it("в бугорок не кладут", async () => {
    db.bags.get(BAG)!.buried = true;
    await expect(put(APPLE, 1)).rejects.toThrow("bag.buried");
    expect(packOf("h1").get(APPLE)?.count).toBe(10);
  });

  it("пустой или сгоревший мешочек — его нет: новый так не появляется", async () => {
    db.now += TTL + 1;
    await expect(put(APPLE, 1)).rejects.toThrow("bag.gone");
    expect(packOf("h1").get(APPLE)?.count).toBe(10);
  });

  it("не вплотную — «подойди»", async () => {
    db.pos.set("w1", { q: 9, r: 9 });
    await expect(put(APPLE, 1)).rejects.toThrow("bag.approach");
  });

  it("чего нет в рюкзаке — не положить", async () => {
    await expect(put("custom:cst_none", 1)).rejects.toThrow("braid.wh_not_enough");
  });
});
