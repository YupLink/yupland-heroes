// «Забрать» из мешочка (§8.21): любой вплотную; сколько влезет, остальное
// остаётся; двое разом — ровно то, что было; повтор нажатия и моста — без
// второго эффекта; рюкзак не принял — снятое назад в мешочек с метками;
// закопанный не забирается; метки происхождения едут в рюкзак. Порции вида
// уходят от той, что сгорит раньше; откат возвращает в те же порции.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { TTL, countOf, db, md5, packOf, resetDb, seedBag } from "./bag.fake";
import { runCmd } from "./bag.fake-cmd";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-take-sql", async () => (await import("./bag.fake-mocks")).takeSqlMod);
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
const mod = await import("./bag-take");
type Taken = { taken: Array<{ stackKey: string; qty: number }> };
const takeFn = mod.takeFromLootBag as unknown as (a: { data: unknown }) => Promise<Taken>;

const BANANA = "custom:cst_banana";
const BAG = `lb_${md5("seed")}`;
const BANANAS = CELL_SIZE + 10; // в мешочке — две ячейки: полная и ещё 10
let n = 0;
/** Нажатие игрока `wallet`: стопка с количеством или «Забрать всё». */
const take = (wallet: string, o: { stackKey?: string; qty?: number; op?: string } = {}) => {
  who.wallet = wallet;
  return takeFn({ data: { bagId: BAG, op: o.op ?? `op-${++n}-press`, ...o } });
};
/** Что осталось в мешочке: штук вида (живых порций) и метки первой порции. */
const left = () => ({
  count: countOf(db.bags.get(BAG), BANANA),
  marks: db.bags.get(BAG)?.items.find((p) => p.stackKey === BANANA)?.marks,
});
const seed = (count: number, marks = { mob: count, mine: 0, field: 0, loot: 0 }) =>
  runCmd({
    cmd: "drop",
    at: { key: "seed", mapId: "map1", q: 5, r: 7, account: "acc9" },
    stacks: [
      {
        stackKey: BANANA,
        kind: "custom",
        refId: "cst_banana",
        name: "Банан",
        image: null,
        count,
        marks,
      },
    ],
  });

beforeEach(() => {
  resetDb();
  for (const [w, acc, hero, q, r] of [
    ["w1", "acc1", "h1", 5, 6],
    ["w2", "acc2", "h2", 6, 6],
  ] as const) {
    db.accounts.set(w, acc);
    db.heroes.set(w, { heroId: hero, capacity: 1, potionCapacity: 0 });
    // Обе клетки — соседи мешочка (5,7).
    db.pos.set(w, { q, r });
  }
  seed(BANANAS);
});

describe("забрать", () => {
  it(`всё — сколько влезет (ячейка = ${CELL_SIZE} шт.), остаток в мешочке, метка «с мобов» едет`, async () => {
    const res = await take("w1");
    expect(res.taken).toEqual([{ stackKey: BANANA, qty: CELL_SIZE }]);
    expect(packOf("h1").get(BANANA)).toMatchObject({ count: CELL_SIZE, marks: { mob: CELL_SIZE } });
    expect(left()).toMatchObject({ count: 10, marks: { mob: 10 } });
    expect(db.events).toEqual(["5,7"]);
  });

  it("стопку с количеством (окно QtyDialog) — ровно просьбу", async () => {
    await take("w1", { stackKey: BANANA, qty: 7 });
    expect(packOf("h1").get(BANANA)?.count).toBe(7);
    expect(left()?.count).toBe(BANANAS - 7);
  });

  it("забрали всё — мешочек пуст и больше не виден никому", async () => {
    db.heroes.set("w1", { heroId: "h1", capacity: 2, potionCapacity: 0 });
    await take("w1");
    expect(left()?.count).toBe(0);
    await expect(take("w2")).rejects.toThrow("bag.gone");
  });

  it("купленное остаётся купленным: безымянные штуки уходят первыми и приходят без метки", async () => {
    resetDb();
    db.accounts.set("w1", "acc1");
    db.heroes.set("w1", { heroId: "h1", capacity: 1, potionCapacity: 0 });
    db.pos.set("w1", { q: 5, r: 6 });
    seed(BANANAS, { mob: 0, mine: 0, field: 0, loot: 12 });
    await take("w1");
    // Безымянные (ячейка без двух) ушли первыми, из 12 собранных — 2; в мешочке — 10 собранных.
    expect(packOf("h1").get(BANANA)?.marks).toMatchObject({ loot: 2 });
    expect(left()).toMatchObject({ count: 10, marks: { loot: 10 } });
  });
});

describe("гонки и повторы", () => {
  it("двое забирают разом — ровно то, что было, без дюпа", async () => {
    for (const w of ["w1", "w2"]) {
      db.heroes.set(w, { ...db.heroes.get(w)!, capacity: 2 });
    }
    const out = await Promise.allSettled([take("w1"), take("w2")]);
    const got = (packOf("h1").get(BANANA)?.count ?? 0) + (packOf("h2").get(BANANA)?.count ?? 0);
    expect(got).toBe(BANANAS);
    expect(left()?.count).toBe(0);
    expect(out.filter((o) => o.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
  });

  it("повтор того же нажатия — без второго эффекта", async () => {
    const first = await take("w1", { op: "same-op-1" });
    const again = await take("w1", { op: "same-op-1" });
    expect(again).toEqual(first);
    expect(packOf("h1").get(BANANA)?.count).toBe(CELL_SIZE);
    expect(left()?.count).toBe(10);
  });

  it("повтор моста (ответ снятия потерян после записи) — снято и положено один раз", async () => {
    db.replay = 1;
    await take("w1");
    expect(packOf("h1").get(BANANA)?.count).toBe(CELL_SIZE);
    expect(left()?.count).toBe(10);
  });

  it("рюкзак не принял (место заняли) — снятое назад в мешочек с метками, отказ игроку", async () => {
    packOf("h1").set("custom:cst_other", {
      count: CELL_SIZE,
      marks: { mob: 0, mine: 0, field: 0, loot: 0 },
      wear: 0,
    });
    db.staleBag = true;
    await expect(take("w1")).rejects.toThrow("market.backpack_need");
    expect(left()).toMatchObject({ count: BANANAS, marks: { mob: BANANAS } });
    expect(packOf("h1").has(BANANA)).toBe(false);
    // Повтор того же нажатия после отката — второй попытки нет.
    const op = [...db.ops.keys()][0].split(":")[2];
    await expect(take("w1", { op })).rejects.toThrow();
    expect(left()?.count).toBe(BANANAS);
  });

  it("ответ выдачи потерян, но выдача прошла — «забор» это видит: назад не возвращаем", async () => {
    db.loseDeposit = 1;
    await take("w1");
    expect(packOf("h1").get(BANANA)?.count).toBe(CELL_SIZE);
    expect(left()?.count).toBe(10);
  });
});

describe("отказы", () => {
  it("закопанный мешочек не забирается", async () => {
    db.bags.get(BAG)!.buried = true;
    await expect(take("w1")).rejects.toThrow("bag.buried");
    expect(left()?.count).toBe(BANANAS);
  });

  it("не вплотную — «подойди»", async () => {
    db.pos.set("w1", { q: 9, r: 9 });
    await expect(take("w1")).rejects.toThrow("bag.approach");
  });

  it("без выбранного героя — отказ, мешочек цел", async () => {
    db.heroes.delete("w1");
    await expect(take("w1")).rejects.toThrow("market.backpack_no_hero");
    expect(left()?.count).toBe(BANANAS);
  });

  it("срок вышел — мешочка нет", async () => {
    db.now += 24 * 3600_000 + 1;
    await expect(take("w1")).rejects.toThrow("bag.gone");
  });
});

describe("порции со своим сроком", () => {
  const HOUR = 3600_000;
  const twoPortions = () =>
    seedBag(BAG, {
      q: 5,
      r: 7,
      items: [
        { stackKey: BANANA, count: BANANAS, expiresAt: db.now + TTL, marks: { mob: 0, mine: 0, field: 0, loot: BANANAS } },
        { stackKey: BANANA, count: 5, expiresAt: db.now + HOUR, marks: { mob: 5, mine: 0, field: 0, loot: 0 } },
      ],
    });

  it("сначала уходит то, что сгорит раньше", async () => {
    twoPortions();
    await take("w1", { stackKey: BANANA, qty: 8 });
    const bag = db.bags.get(BAG)!;
    expect(bag.items.find((p) => p.expiresAt === db.now + HOUR)?.count).toBe(0);
    expect(bag.items.find((p) => p.expiresAt === db.now + TTL)?.count).toBe(BANANAS - 3);
    expect(packOf("h1").get(BANANA)).toMatchObject({ count: 8, marks: { mob: 5, loot: 3 } });
  });

  it("сгоревшая порция не забирается и не видна", async () => {
    twoPortions();
    db.now += HOUR + 1;
    const res = await take("w1");
    expect(res.taken).toEqual([{ stackKey: BANANA, qty: CELL_SIZE }]);
    expect(countOf(db.bags.get(BAG), BANANA)).toBe(10);
  });

  it("рюкзак не принял — снятое вернулось в те же порции, с их сроками и метками", async () => {
    twoPortions();
    packOf("h1").set("custom:cst_other", {
      count: CELL_SIZE,
      marks: { mob: 0, mine: 0, field: 0, loot: 0 },
      wear: 0,
    });
    db.staleBag = true;
    await expect(take("w1", { stackKey: BANANA, qty: 12 })).rejects.toThrow("market.backpack_need");
    const bag = db.bags.get(BAG)!;
    expect(bag.items.find((p) => p.expiresAt === db.now + HOUR)).toMatchObject({
      count: 5,
      marks: { mob: 5 },
    });
    expect(bag.items.find((p) => p.expiresAt === db.now + TTL)).toMatchObject({
      count: BANANAS,
      marks: { loot: BANANAS },
    });
  });

  it("пыль: остаток меньше тысячной уходит со стеком, если влезает", () => {
    seedBag(BAG, { q: 5, r: 7, items: [{ stackKey: BANANA, count: 20.0004 }] });
    const res = runCmd({ cmd: "take", bagId: BAG, stackKey: BANANA, qty: 20, cap: 40, op: "d1", heroId: "h1" });
    expect(res).toEqual([{ _row: expect.objectContaining({ qty: 20.0004 }) }]);
    expect(countOf(db.bags.get(BAG), BANANA)).toBe(0);
  });

  it("пыль не влезает — остаётся в мешочке, снято ровно просимое", () => {
    seedBag(BAG, { q: 5, r: 7, items: [{ stackKey: BANANA, count: 20.0004 }] });
    runCmd({ cmd: "take", bagId: BAG, stackKey: BANANA, qty: 20, cap: 20, op: "d2", heroId: "h1" });
    expect(countOf(db.bags.get(BAG), BANANA)).toBe(0.0004);
  });
});
