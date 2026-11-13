// Ресурс счёта в мешочке (разборка шахты, §8.70): забранное уходит на счёт
// (res_move вида bag_take), а не в рюкзак — ни героя, ни места не нужно;
// сколько просили — до 0,0001, остаток лежит; повтор нажатия и моста — без
// второго начисления; «Забрать всё» берёт и ресурс, и товар; положить ресурс
// в мешочек нельзя. Текст SQL — bag-take-res-sql.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TTL, countOf, db, md5, packOf, resetDb, seedBag } from "./bag.fake";
import { resBal, resLedger, resetRes } from "./bag.fake-res";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-take-sql", async () => (await import("./bag.fake-mocks")).takeSqlMod);
vi.mock("./bag-take-res-sql", async () => (await import("./bag.fake-res")).takeResSqlMod);
vi.mock("./bag-back-sql", async () => (await import("./bag.fake-mocks")).backSqlMod);
vi.mock("./bag-put-sql", async () => (await import("./bag.fake-mocks")).putSqlMod);
vi.mock("./bag-note", () => ({ noteBagTake: async () => {}, noteBagPut: async () => {} }));
vi.mock("../open-pass/pass", async () => (await import("./bag.fake-mocks")).pass);
vi.mock("../market-backpack", async () => (await import("./bag.fake-mocks")).backpack);
vi.mock("../chest/chest-net-read", async () => (await import("./bag.fake-mocks")).netRead);
vi.mock("../item-alias", async () => (await import("./bag.fake-mocks")).alias);
vi.mock("../potion-bag", () => ({ potionKeysOf: async () => new Set<string>() }));
vi.mock("../tool-wear", async () => (await import("./bag.fake-mocks")).toolWear);
vi.mock("../gate", async () => (await import("./bag.fake-mocks")).session.gate);
vi.mock("@/server/rateGate", async () => (await import("./bag.fake-mocks")).session.rate);
vi.mock("../encounter-where", async () => (await import("./bag.fake-mocks")).session.where);
vi.mock("../../currency/move", async () => (await import("./bag.fake-mocks")).session.move);
vi.mock("../voidGate", async () => (await import("./bag.fake-mocks")).session.voidGate);
vi.mock("@tanstack/react-start", async () => (await import("./bag.fake-mocks")).startFn);

const { who } = await import("./bag.fake-mocks");
type Taken = { taken: Array<{ stackKey: string; qty: number }> };
type Fn<T> = (a: { data: unknown }) => Promise<T>;
const takeFn = (await import("./bag-take")).takeFromLootBag as unknown as Fn<Taken>;
const putFn = (await import("./bag-put")).putToLootBag as unknown as Fn<{ qty: number }>;

const WOOD = "resource:wood";
const DIAM = "resource:diamonds";
const APPLE = "custom:cst_apple";
const BAG = `lb_${md5("mdis:seed")}`;
const KEEP = 87_600 * 3600_000;
let n = 0;
const take = (o: { stackKey?: string; qty?: number; op?: string } = {}) => {
  who.wallet = "w1";
  return takeFn({ data: { bagId: BAG, op: o.op ?? `op-${++n}-press`, ...o } });
};
const bal = (res: string) => resBal.get(`acc1|${res}`) ?? 0;

beforeEach(() => {
  resetDb();
  resetRes();
  db.accounts.set("w1", "acc1");
  db.pos.set("w1", { q: 5, r: 6 });
  seedBag(BAG, {
    q: 5,
    r: 7,
    items: [
      { stackKey: WOOD, kind: "resource", refId: "wood", count: 90, expiresAt: db.now + KEEP },
      { stackKey: DIAM, kind: "resource", refId: "diamonds", count: 4.5, expiresAt: db.now + KEEP },
    ],
  });
});

describe("ресурс из мешочка — на счёт", () => {
  it("без героя: забрать стопку целиком — счёт, а не рюкзак; журнал вида bag_take", async () => {
    await expect(take({ stackKey: WOOD })).resolves.toEqual({
      taken: [{ stackKey: WOOD, qty: 90 }],
    });
    expect(bal("wood")).toBe(90);
    expect(countOf(db.bags.get(BAG), WOOD)).toBe(0);
    expect(db.packs.size).toBe(0);
    expect(resLedger).toEqual([
      {
        account: "acc1",
        res: "wood",
        delta: 90,
        kind: "bag_take",
        ref: expect.stringMatching(/^bagtake:acc1:op-\d+-press:resource:wood$/),
      },
    ]);
  });

  it("частично: дробное до 0,0001, остаток лежит; повтор нажатия второй раз не начисляет", async () => {
    const op = "same-press-1";
    await expect(take({ stackKey: DIAM, qty: 1.23456, op })).resolves.toEqual({
      taken: [{ stackKey: DIAM, qty: 1.2345 }],
    });
    await expect(take({ stackKey: DIAM, qty: 1.23456, op })).resolves.toEqual({
      taken: [{ stackKey: DIAM, qty: 1.2345 }],
    });
    expect(bal("diamonds")).toBe(1.2345);
    expect(countOf(db.bags.get(BAG), DIAM)).toBe(3.2655);
    expect(resLedger).toHaveLength(1);
  });

  it("слепой повтор моста (ответ потерян, запрос повторён) — одно начисление", async () => {
    db.replay = 1;
    await take({ stackKey: WOOD, qty: 10 });
    expect(bal("wood")).toBe(10);
    expect(countOf(db.bags.get(BAG), WOOD)).toBe(80);
  });

  it("ответ потерялся после записи — ключ говорит «забрано», без второго снятия", async () => {
    db.loseOn = "takeRes";
    await expect(take({ stackKey: WOOD, qty: 5 })).resolves.toEqual({
      taken: [{ stackKey: WOOD, qty: 5 }],
    });
    expect(bal("wood")).toBe(5);
  });

  it("«Забрать всё» с героем: ресурсы на счёт, товар — в рюкзак", async () => {
    db.heroes.set("w1", { heroId: "h1", capacity: 3, potionCapacity: 0 });
    db.bags.get(BAG)?.items.push({
      stackKey: APPLE,
      kind: "custom",
      refId: "cst_apple",
      name: "Яблоко",
      image: null,
      count: 3,
      expiresAt: db.now + TTL,
      marks: { mob: 0, mine: 0, field: 0, loot: 0 },
    });
    const res = await take();
    expect(res.taken).toEqual([
      { stackKey: WOOD, qty: 90 },
      { stackKey: DIAM, qty: 4.5 },
      { stackKey: APPLE, qty: 3 },
    ]);
    expect(bal("wood")).toBe(90);
    expect(bal("diamonds")).toBe(4.5);
    expect(packOf("h1").get(APPLE)?.count).toBe(3);
    expect(packOf("h1").has(WOOD)).toBe(false);
  });

  it("«Забрать всё» без героя: ресурсы забраны, товар ждёт в мешочке (left)", async () => {
    seedBag(BAG, {
      q: 5,
      r: 7,
      items: [
        { stackKey: WOOD, kind: "resource", refId: "wood", count: 9, expiresAt: db.now + KEEP },
        { stackKey: APPLE, count: 2 },
      ],
    });
    await expect(take()).resolves.toEqual({
      taken: [{ stackKey: WOOD, qty: 9 }],
      left: [{ stackKey: APPLE, name: APPLE, qty: 2 }],
    });
    expect(countOf(db.bags.get(BAG), APPLE)).toBe(2);
  });

  it("закопанный мешочек ресурс не отдаёт", async () => {
    const bag = db.bags.get(BAG);
    if (bag) bag.buried = true;
    await expect(take({ stackKey: WOOD })).rejects.toThrow("bag.buried");
    expect(bal("wood")).toBe(0);
  });

  it("положить ресурс в мешочек нельзя — отказ до всего", async () => {
    db.heroes.set("w1", { heroId: "h1", capacity: 3, potionCapacity: 0 });
    who.wallet = "w1";
    await expect(
      putFn({ data: { bagId: BAG, stackKey: WOOD, qty: 1, op: "put-res-1" } }),
    ).rejects.toThrow("bag.res_no_put");
    expect(countOf(db.bags.get(BAG), WOOD)).toBe(90);
  });
});
