// «Забрать всё» из мешочка (§8.21, кнопка над плитками с 23.10): все стопки
// одним нажатием — товар в рюкзак по общей арифметике места, ресурс счёта
// (§8.70) на счёт; не влезшее остаётся в мешочке и приходит в ответе (left —
// свежим чтением после забора); повтор того же нажатия второй раз не выдаёт.
// Шаги каждой стопки — bag-take.test, ресурсы — bag-take-res.test.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { countOf, db, md5, packOf, resetDb, seedBag } from "./bag.fake";
import { resBal, resLedger, resetRes } from "./bag.fake-res";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-take-sql", async () => (await import("./bag.fake-mocks")).takeSqlMod);
vi.mock("./bag-take-res-sql", async () => (await import("./bag.fake-res")).takeResSqlMod);
vi.mock("./bag-back-sql", async () => (await import("./bag.fake-mocks")).backSqlMod);
vi.mock("./bag-note", () => ({ noteBagTake: async () => {} }));
vi.mock("../open-pass/pass", async () => (await import("./bag.fake-mocks")).pass);
vi.mock("../market-backpack", async () => (await import("./bag.fake-mocks")).backpack);
vi.mock("../chest/chest-net-read", async () => (await import("./bag.fake-mocks")).netRead);
vi.mock("../item-alias", async () => (await import("./bag.fake-mocks")).alias);
vi.mock("../potion-bag", () => ({ potionKeysOf: async () => new Set<string>() }));
vi.mock("../gate", async () => (await import("./bag.fake-mocks")).session.gate);
vi.mock("@/server/rateGate", async () => (await import("./bag.fake-mocks")).session.rate);
vi.mock("../encounter-where", async () => (await import("./bag.fake-mocks")).session.where);
vi.mock("../../currency/move", async () => (await import("./bag.fake-mocks")).session.move);
vi.mock("../voidGate", async () => (await import("./bag.fake-mocks")).session.voidGate);
vi.mock("@tanstack/react-start", async () => (await import("./bag.fake-mocks")).startFn);

const { who } = await import("./bag.fake-mocks");
type Taken = {
  taken: Array<{ stackKey: string; qty: number }>;
  left?: Array<{ stackKey: string; name: string; qty: number }>;
};
const takeFn = (await import("./bag-take")).takeFromLootBag as unknown as (a: {
  data: unknown;
}) => Promise<Taken>;

const BAG = `lb_${md5("all:seed")}`;
const APPLE = "custom:cst_apple";
const BANANA = "custom:cst_banana";
const WOOD = "resource:wood";
const GOLD = "resource:gold";
const KEEP = 87_600 * 3600_000;
let n = 0;
const takeAll = (op = `all-${++n}-press`) => {
  who.wallet = "w1";
  return takeFn({ data: { bagId: BAG, op } });
};
const hero = (capacity: number) =>
  db.heroes.set("w1", { heroId: "h1", capacity, potionCapacity: 0 });
const bal = (res: string) => resBal.get(`acc1|${res}`) ?? 0;
const zero = { mob: 0, mine: 0, field: 0, loot: 0 };
const goods = (stackKey: string, name: string, count: number) => ({
  stackKey,
  name,
  count,
  marks: { ...zero, loot: count },
});
/** Бананов на две ячейки: полная и ещё 10. */
const BANANAS = CELL_SIZE + 10;
const res = (stackKey: string, count: number) => ({
  stackKey,
  kind: "resource",
  refId: stackKey.split(":")[1],
  name: stackKey,
  count,
  expiresAt: db.now + KEEP,
});

beforeEach(() => {
  resetDb();
  resetRes();
  db.accounts.set("w1", "acc1");
  db.pos.set("w1", { q: 5, r: 6 });
});

describe("«Забрать всё»", () => {
  it("всё влезло: каждая стопка забрана, мешочек пуст, left нет", async () => {
    hero(3);
    seedBag(BAG, {
      q: 5,
      r: 7,
      items: [goods(APPLE, "Яблоко", 5), goods(BANANA, "Банан", BANANAS)],
    });
    await expect(takeAll()).resolves.toEqual({
      taken: [
        { stackKey: APPLE, qty: 5 },
        { stackKey: BANANA, qty: BANANAS },
      ],
    });
    expect(packOf("h1").get(APPLE)).toMatchObject({ count: 5, marks: { loot: 5 } });
    expect(packOf("h1").get(BANANA)?.count).toBe(BANANAS);
    expect(countOf(db.bags.get(BAG), APPLE) + countOf(db.bags.get(BAG), BANANA)).toBe(0);
    expect(db.events).toEqual(["5,7"]);
  });

  it("места не хватило: забрано, что влезло; остаток в мешочке и в left с именем", async () => {
    hero(2);
    seedBag(BAG, {
      q: 5,
      r: 7,
      items: [goods(APPLE, "Яблоко", 5), goods(BANANA, "Банан", BANANAS)],
    });
    const out = await takeAll();
    // Яблоко — ячейка, бананам — одна оставшаяся (CELL_SIZE шт.): рюкзак не над ёмкостью.
    expect(out).toEqual({
      taken: [
        { stackKey: APPLE, qty: 5 },
        { stackKey: BANANA, qty: CELL_SIZE },
      ],
      left: [{ stackKey: BANANA, name: "Банан", qty: 10 }],
    });
    expect(packOf("h1").get(BANANA)?.count).toBe(CELL_SIZE);
    expect(countOf(db.bags.get(BAG), BANANA)).toBe(10);
  });

  it("повтор того же нажатия второй раз не выдаёт и не начисляет", async () => {
    hero(2);
    seedBag(BAG, {
      q: 5,
      r: 7,
      items: [goods(APPLE, "Яблоко", 5), goods(BANANA, "Банан", BANANAS), res(WOOD, 90)],
    });
    const first = await takeAll("same-all-1");
    const again = await takeAll("same-all-1");
    // Ушедшие целиком стопки из мешочка пропали — повтор отвечает за то, что
    // ещё лежит: бананы — прежним числом (ключ нажатия), остаток — тот же.
    expect(again.taken).toEqual(first.taken.filter((t) => t.stackKey === BANANA));
    expect(again.left).toEqual(first.left);
    expect(packOf("h1").get(APPLE)?.count).toBe(5);
    expect(packOf("h1").get(BANANA)?.count).toBe(CELL_SIZE);
    expect(bal("wood")).toBe(90);
    expect(resLedger).toHaveLength(1);
    expect(countOf(db.bags.get(BAG), BANANA)).toBe(10);
  });

  it("ресурсы счёта — на счёт при полном рюкзаке; товар ждёт в мешочке (left)", async () => {
    hero(1);
    packOf("h1").set("custom:cst_other", { count: CELL_SIZE, marks: zero, wear: 0 });
    seedBag(BAG, {
      q: 5,
      r: 7,
      items: [res(WOOD, 300), res(GOLD, 90), goods(APPLE, "Яблоко", 2)],
    });
    await expect(takeAll()).resolves.toEqual({
      taken: [
        { stackKey: WOOD, qty: 300 },
        { stackKey: GOLD, qty: 90 },
      ],
      left: [{ stackKey: APPLE, name: "Яблоко", qty: 2 }],
    });
    expect([bal("wood"), bal("gold")]).toEqual([300, 90]);
    expect(packOf("h1").has(APPLE)).toBe(false);
    expect(packOf("h1").has(WOOD)).toBe(false);
    expect(countOf(db.bags.get(BAG), APPLE)).toBe(2);
  });

  it("только ресурсы, без героя — всё на счёт, left нет", async () => {
    seedBag(BAG, { q: 5, r: 7, items: [res(WOOD, 300), res(GOLD, 0.8)] });
    await expect(takeAll()).resolves.toEqual({
      taken: [
        { stackKey: WOOD, qty: 300 },
        { stackKey: GOLD, qty: 0.8 },
      ],
    });
    expect(bal("gold")).toBe(0.8);
    expect(db.packs.size).toBe(0);
  });

  it("ничего не влезло — отказ «рюкзак полон», мешочек цел", async () => {
    hero(1);
    packOf("h1").set("custom:cst_other", { count: CELL_SIZE, marks: zero, wear: 0 });
    seedBag(BAG, { q: 5, r: 7, items: [goods(APPLE, "Яблоко", 2)] });
    await expect(takeAll()).rejects.toThrow("market.backpack_full");
    expect(countOf(db.bags.get(BAG), APPLE)).toBe(2);
    expect(db.events).toEqual([]);
  });

  it("сгоревшая порция не забирается и в left не попадает", async () => {
    hero(3);
    seedBag(BAG, {
      q: 5,
      r: 7,
      items: [goods(APPLE, "Яблоко", 2), { ...goods(BANANA, "Банан", 4), expiresAt: db.now + 1 }],
    });
    db.now += 2;
    await expect(takeAll()).resolves.toEqual({ taken: [{ stackKey: APPLE, qty: 2 }] });
    expect(packOf("h1").has(BANANA)).toBe(false);
  });
});
