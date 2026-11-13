// Выдача предметов с карты (владелец, 29.09.2026; ПРАВИЛА §8.21): сразу в рюкзак
// выбранного героя, что не влезло — мешочком на клетке, где взято; нет героя —
// всё мешочком. Повтор моста не удваивает ни рюкзак, ни мешочек; сбой базы на
// выдаче и на мешочке — «заборы» решают, где штуки, и они ровно в одном месте;
// мешочек точно не упал — остаток в «Добычу». Метка происхождения едет и в
// рюкзак, и в мешочек. Базы нет: фейк (bag.fake).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TTL, alive, countOf, db, md5, packOf, resetDb } from "./bag.fake";
import type { DropItem } from "./bag-deliver";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-back-sql", async () => (await import("./bag.fake-mocks")).backSqlMod);
vi.mock("../market-backpack", async () => (await import("./bag.fake-mocks")).backpack);
vi.mock("../chest/chest-net-read", async () => (await import("./bag.fake-mocks")).netRead);
vi.mock("../item-alias", async () => (await import("./bag.fake-mocks")).alias);
vi.mock("../potion-bag", () => ({ potionKeysOf: async () => new Set<string>() }));
vi.mock("./bag-sweep", () => ({ startLootBagSweeper: () => {} }));

const { deliverOrDrop } = await import("./bag-deliver");

const BANANA = "custom:cst_banana";
const at = (key = "k1") =>
  ({ key, mapId: "map1", q: 5, r: 7, source: "object", sourceName: "Сундук" }) as const;
let queued: DropItem[] = [];
let keys: string[] = [];
const toQueue = async (it: DropItem, key: string) => void (queued.push(it), keys.push(key));
const deliver = (items: DropItem[], o: { key?: string; strict?: boolean } = {}) =>
  deliverOrDrop({ owner: "w1", account: "acc1", items, at: at(o.key), toQueue, strict: o.strict });
const give = (amount: number, o: { origin?: "mob" | "loot"; key?: string; strict?: boolean } = {}) =>
  deliver([{ itemId: "cst_banana", amount, origin: o.origin ?? "loot" }], o);
const bagOf = (key = "k1") => db.bags.get(`lb_${md5(key)}`);
const row = (toBackpack: number, dropped: number, queuedN = 0, itemId = "cst_banana") =>
  ({ itemId, toBackpack, dropped, queued: queuedN });

beforeEach(() => {
  resetDb();
  queued = [];
  keys = [];
  db.catalog.set("cst_banana", { name: "Банан" });
  db.catalog.set("cst_milk", { name: "Молоко" });
  // Одна ячейка рюкзака = CELL_SIZE штук одного вида.
  db.heroes.set("w1", { heroId: "h1", capacity: 1, potionCapacity: 0 });
});

describe("влезло — рюкзак, не влезло — мешочек", () => {
  it("влезло всё: в рюкзак с меткой, мешочка и события нет", async () => {
    const res = await give(5);
    expect(packOf("h1").get(BANANA)).toMatchObject({ count: 5, marks: { loot: 5, mob: 0 } });
    expect(res).toEqual({ items: [row(5, 0)], bagId: null });
    expect(db.bags.size).toBe(0);
    expect(db.events).toEqual([]);
  });

  it("не влезло: часть в рюкзак, остаток мешочком на клетке — порция на 24 часа, с меткой", async () => {
    const res = await give(CELL_SIZE + 5, { origin: "mob" });
    expect(packOf("h1").get(BANANA)).toMatchObject({ count: CELL_SIZE, marks: { mob: CELL_SIZE } });
    expect(res).toEqual({ items: [row(CELL_SIZE, 5)], bagId: `lb_${md5("k1")}` });
    expect(bagOf()).toMatchObject({ q: 5, r: 7, droppedBy: "acc1", buried: false });
    expect(bagOf()?.items).toEqual([
      expect.objectContaining({ stackKey: BANANA, count: 5, expiresAt: db.now + TTL }),
    ]);
    expect(bagOf()?.items[0].marks).toMatchObject({ mob: 5, loot: 0 });
    // Кто рядом — перечитывает свой «второй обзор».
    expect(db.events).toEqual(["5,7"]);
  });

  it("второй вид не открывает новую ячейку — целиком в мешочек, первый — в рюкзак", async () => {
    const res = await deliver([
      { itemId: "cst_banana", amount: 3, origin: "loot" },
      { itemId: "cst_milk", amount: 2, origin: "loot" },
    ]);
    expect(packOf("h1").get(BANANA)?.count).toBe(3);
    expect(packOf("h1").has("custom:cst_milk")).toBe(false);
    expect(countOf(bagOf(), "custom:cst_milk")).toBe(2);
    expect(res.items).toEqual([row(3, 0), row(0, 2, 0, "cst_milk")]);
  });

  it("один вид дважды (с мобов и собранный) — одна стопка: помеченное первым в рюкзак", async () => {
    const res = await deliver([
      { itemId: "cst_banana", amount: CELL_SIZE - 5, origin: "mob" },
      { itemId: "cst_banana", amount: 10, origin: "loot" },
    ]);
    const marks = { mob: CELL_SIZE - 5, loot: 5 };
    expect(packOf("h1").get(BANANA)).toMatchObject({ count: CELL_SIZE, marks });
    expect(bagOf()?.items[0]).toMatchObject({ count: 5, marks: { mob: 0, loot: 5 } });
    expect(res.items).toEqual([row(CELL_SIZE - 5, 0), row(5, 5)]);
  });

  it("нет выбранного героя — всё мешочком", async () => {
    db.heroes.clear();
    const res = await give(4);
    expect(db.packs.size).toBe(0);
    expect(countOf(bagOf(), BANANA)).toBe(4);
    expect(res.items).toEqual([row(0, 4)]);
  });

  it("товара нет в справочнике — ждёт в «Добыче» (ключ строки — номер предмета), мешочка нет", async () => {
    const res = await deliver([
      { itemId: "cst_banana", amount: 1, origin: "loot" },
      { itemId: "cst_gone", amount: 2, origin: "loot" },
    ]);
    expect(queued).toEqual([{ itemId: "cst_gone", amount: 2, origin: "loot" }]);
    expect(keys).toEqual(["k1:q1"]);
    expect(res.items).toEqual([row(1, 0), row(0, 0, 2, "cst_gone")]);
    expect(db.bags.size).toBe(0);
  });

  it("чтение героя «мигнуло» — не роняем добычу на общую клетку: бросок, ничего не тронуто", async () => {
    db.accounts.set("w1", "acc1");
    db.heroReadFails = true;
    await expect(give(5)).rejects.toThrow("loot-bag: hero unreadable");
    expect(db.bags.size).toBe(0);
    expect(queued).toEqual([]);
  });

  it("пыль округления мешочком не падает", async () => {
    db.heroes.set("w1", { heroId: "h1", capacity: 1, potionCapacity: 0 });
    const res = await give(CELL_SIZE + 0.0004);
    expect(packOf("h1").get(BANANA)?.count).toBe(CELL_SIZE);
    expect(db.bags.size).toBe(0);
    expect(res.items[0]).toMatchObject({ toBackpack: CELL_SIZE, dropped: 0 });
  });
});

describe("гонки и повтор моста", () => {
  it("повтор моста (ответ потерян после записи): мешочек один, содержимое не удвоено", async () => {
    db.replay = 5;
    await give(CELL_SIZE + 5);
    expect(db.bags.size).toBe(1);
    expect(countOf(bagOf(), BANANA)).toBe(5);
  });

  it("повтор всей выдачи тем же ключом — второй раз ничего не кладёт и не роняет", async () => {
    await give(CELL_SIZE + 5);
    await give(CELL_SIZE + 5);
    expect(packOf("h1").get(BANANA)?.count).toBe(CELL_SIZE);
    expect(db.bags.size).toBe(1);
    expect(countOf(bagOf(), BANANA)).toBe(5);
  });

  it("место заняли между расчётом и записью — не легло, штуки мешочком, не пропали", async () => {
    packOf("h1").set("custom:cst_other", {
      count: CELL_SIZE,
      marks: { mob: 0, mine: 0, field: 0, loot: 0 },
      wear: 0,
    });
    db.staleBag = true;
    const res = await give(5);
    expect(packOf("h1").has(BANANA)).toBe(false);
    expect(countOf(bagOf(), BANANA)).toBe(5);
    expect(res.items).toEqual([row(0, 5)]);
    // Отказ тоже закрыт «забором»: опоздавшая попытка не положит.
    expect(db.bpOps.has(`bpx:k1:${BANANA}`)).toBe(true);
  });

  it("сбой базы после записи (ответ выдачи потерян) — «забор» видит выдачу, в мешочек не дублируем", async () => {
    db.loseDeposit = 1;
    await give(5);
    expect(packOf("h1").get(BANANA)?.count).toBe(5);
    expect(db.bags.size).toBe(0);
  });

  it("сбой базы до записи — «забор» перекрывает выдачу: штуки мешочком, опоздавшая попытка не кладёт", async () => {
    db.failDeposit = 1;
    await give(5);
    expect(countOf(bagOf(), BANANA)).toBe(5);
    const { backpack } = await import("./bag.fake-mocks");
    await backpack.depositToBackpack({
      heroId: "h1",
      nonce: `k1:${BANANA}`,
      capacity: 1,
      item: { kind: "custom", refId: "cst_banana", name: "Банан", image: null },
      qty: 5,
    });
    expect(packOf("h1").has(BANANA)).toBe(false);
  });
});

describe("сбой посреди выдачи", () => {
  it("исход одной стопки неизвестен — её не роняем, остальные своим чередом", async () => {
    db.catalog.set("cst_apple", { name: "Яблоко" });
    db.heroes.set("w1", { heroId: "h1", capacity: 3, potionCapacity: 0 });
    Object.assign(db, { failDeposit: 1, failDepositKey: "custom:cst_milk", failOn: ["fence"] });
    const res = await deliver([
      { itemId: "cst_banana", amount: 3, origin: "loot" },
      { itemId: "cst_milk", amount: 2, origin: "loot" },
      { itemId: "cst_apple", amount: CELL_SIZE + 10, origin: "loot" },
    ]);
    expect(packOf("h1").get(BANANA)?.count).toBe(3);
    expect(packOf("h1").get("custom:cst_apple")?.count).toBe(CELL_SIZE + 10);
    expect(db.bags.size).toBe(0);
    expect(res.items.map((x) => x.itemId)).toEqual(["cst_banana", "cst_apple"]);
  });
});

describe("мешочек не упал", () => {
  it("упал, но ответ потерян — «забор» видит мешочек: в «Добычу» не дублируем", async () => {
    db.loseOn = "drop";
    const res = await give(CELL_SIZE + 5);
    expect(countOf(bagOf(), BANANA)).toBe(5);
    expect(queued).toEqual([]);
    expect(res.items).toEqual([row(CELL_SIZE, 5)]);
  });

  it("не упал (сбой базы) — надгробие, остаток ждёт в «Добыче» с меткой", async () => {
    db.failOn = ["drop"];
    const res = await give(CELL_SIZE + 5, { origin: "mob" });
    expect(alive(bagOf())).toBe(false);
    expect(queued).toEqual([{ itemId: "cst_banana", amount: 5, origin: "mob" }]);
    expect(keys).toEqual(["k1:q0"]);
    expect(res.items).toEqual([row(CELL_SIZE, 0, 5)]);
    // Опоздавшая попытка уронить упрётся в надгробие.
    const { mcp } = await import("./bag.fake-mocks");
    const { dropSql } = (await import("./bag.fake-mocks")).bagSql;
    await mcp.mcpExec(dropSql({ ...at(), account: "acc1" }, [{ stackKey: BANANA, count: 5 }]));
    expect(alive(bagOf())).toBe(false);
  });

  it("ничего не выдано и мешочек не упал: у декора (strict) — бросок, «Добыча» пуста", async () => {
    db.heroes.clear();
    db.failOn = ["drop"];
    await expect(give(4, { strict: true })).rejects.toThrow("bag.drop_failed");
    expect(queued).toEqual([]);
  });

  it("ничего не выдано и мешочек не упал: у объекта — всё в «Добычу»", async () => {
    db.heroes.clear();
    db.failOn = ["drop"];
    const res = await give(4);
    expect(res.items).toEqual([row(0, 0, 4)]);
    expect(queued.map((q) => q.amount)).toEqual([4]);
  });

  it("исход мешочка неизвестен и ничего не выдано — бросок: вызывающий решит сам", async () => {
    db.heroes.clear();
    db.failOn = ["drop", "dropFence"];
    await expect(give(4)).rejects.toThrow("MCP timeout");
    expect(queued).toEqual([]);
  });
});
