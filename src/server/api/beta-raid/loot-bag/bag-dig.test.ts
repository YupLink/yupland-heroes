// «Закопать» и «Выкопать» (§8.21): только с лопатой в рюкзаке; лопата тратит
// износ, как топор (§8.19: «Износ за удар, %», пусто — ломается сразу);
// закопанный — бугорок, содержимое не видно и не забирается; выкопанный —
// снова мешочек. Не перевернулось — износ назад; повтор нажатия — без второго
// эффекта; закопать и забрать разом — одно из двух. Сроки (владелец, 29.09):
// бугорок сгорает целиком через 24 ч после закапывания, выкопанный хранит эти
// сроки, сгоревший бугорок не выкопать.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TTL, countOf, db, md5, packOf, resetDb, seedBag } from "./bag.fake";
import { runCmd } from "./bag.fake-cmd";

vi.mock("@/server/db/mcpClient", async () => (await import("./bag.fake-mocks")).mcp);
vi.mock("@/server/raidLive", async () => (await import("./bag.fake-mocks")).live);
vi.mock("./bag-sql", async () => (await import("./bag.fake-mocks")).bagSql);
vi.mock("./bag-take-sql", async () => (await import("./bag.fake-mocks")).takeSqlMod);
vi.mock("./bag-back-sql", async () => (await import("./bag.fake-mocks")).backSqlMod);
vi.mock("./bag-dig-sql", async () => (await import("./bag.fake-mocks")).digSqlMod);
vi.mock("./bag-read-sql", async () => (await import("./bag.fake-mocks")).readSql);
vi.mock("./bag-note", () => ({ noteBagTake: async () => {} }));
vi.mock("../tool-wear", async () => (await import("./bag.fake-mocks")).toolWear);
vi.mock("../main-tool/main-tool-read", async () => (await import("./bag.fake-tool")).toolMainRead);
vi.mock("../open-pass/pass", async () => (await import("./bag.fake-mocks")).pass);
vi.mock("./bag-dig-pay", async () => (await import("./bag.fake-mocks")).digPay);
vi.mock("../market-backpack", async () => (await import("./bag.fake-mocks")).backpack);
vi.mock("../chest/chest-net-read", async () => (await import("./bag.fake-mocks")).netRead);
vi.mock("../item-alias", async () => (await import("./bag.fake-mocks")).alias);
vi.mock("../potion-bag", () => ({ potionKeysOf: async () => new Set<string>() }));
vi.mock("../gate", async () => (await import("./bag.fake-mocks")).session.gate);
vi.mock("@/server/rateGate", async () => (await import("./bag.fake-mocks")).session.rate);
vi.mock("../encounter-where", async () => (await import("./bag.fake-mocks")).session.where);
vi.mock("../owner", async () => (await import("./bag.fake-mocks")).session.owner);
vi.mock("../../currency/move", async () => (await import("./bag.fake-mocks")).session.move);
vi.mock("../voidGate", async () => (await import("./bag.fake-mocks")).session.voidGate);
vi.mock("@tanstack/react-start", async () => (await import("./bag.fake-mocks")).startFn);

const { who, toolWear, energy } = await import("./bag.fake-mocks");
const dig = await import("./bag-dig");
const take = await import("./bag-take");
const read = await import("./bag-read");
type Call = (a: { data: unknown }) => Promise<unknown>;
const call = (fn: unknown, wallet: string, data: object) => {
  who.wallet = wallet;
  return (fn as Call)({ data });
};

const BANANA = "custom:cst_banana";
const SHOVEL = "custom:cst_shovel";
const BAG = `lb_${md5("seed")}`;
let n = 0;
const op = () => `press-${++n}-x`;
const bury = (wallet = "w1", o = op()) => call(dig.buryLootBag, wallet, { bagId: BAG, op: o });
const unbury = (wallet = "w1", o = op()) => call(dig.digLootBag, wallet, { bagId: BAG, op: o });
const shovel = () => packOf("h1").get(SHOVEL);
const bag = () => db.bags.get(BAG);

beforeEach(() => {
  resetDb();
  toolWear.resetWear();
  Object.assign(energy, { spent: 0, refunded: 0 });
  db.catalog.set("cst_shovel", { name: "Лопата", shovel: true, wear: 50 });
  for (const [w, acc, hero, q] of [
    ["w1", "acc1", "h1", 5],
    ["w2", "acc2", "h2", 6],
  ] as const) {
    db.accounts.set(w, acc);
    db.heroes.set(w, { heroId: hero, capacity: 3, potionCapacity: 0 });
    db.pos.set(w, { q, r: 6 });
  }
  packOf("h1").set(SHOVEL, { count: 1, marks: { mob: 0, mine: 0, field: 0, loot: 0 }, wear: 0 });
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
        count: 8,
        marks: { mob: 8, mine: 0, field: 0, loot: 0 },
      },
    ],
  });
});

describe("лопата", () => {
  it("закопать: бугорок, лопата −50 %, содержимое не видно и не забирается", async () => {
    await bury();
    expect(bag()?.buried).toBe(true);
    expect(shovel()).toMatchObject({ count: 1, wear: 50 });
    const view = (await call(read.getLootBagsAt, "w2", { q: 5, r: 7 })) as {
      bags: Array<{ buried: boolean; items: unknown[] }>;
    };
    expect(view.bags).toEqual([expect.objectContaining({ buried: true, items: [] })]);
    await expect(call(take.takeFromLootBag, "w2", { bagId: BAG, op: op() })).rejects.toThrow(
      "bag.buried",
    );
    expect(db.events).toEqual(["5,7"]);
  });

  it("выкопать: снова мешочек, вторые 50 % доломали лопату", async () => {
    await bury();
    await unbury();
    expect(bag()?.buried).toBe(false);
    expect(shovel()).toMatchObject({ count: 0, wear: 0 });
    await call(take.takeFromLootBag, "w2", { bagId: BAG, op: op() });
    expect(packOf("h2").get(BANANA)?.count).toBe(8);
  });

  it("без лопаты — «Нужна лопата», мешочек не тронут", async () => {
    await expect(bury("w2")).rejects.toThrow("bag.need_shovel");
    expect(bag()?.buried).toBe(false);
  });

  it("лопата без «Износа за удар» ломается с первого раза", async () => {
    db.catalog.set("cst_shovel", { name: "Лопата", shovel: true, wear: null });
    await bury();
    expect(shovel()?.count).toBe(0);
  });

  it("уже закопан — отказ до лопаты: износ за пустое нажатие не снимается", async () => {
    bag()!.buried = true;
    await expect(bury()).rejects.toThrow("bag.buried");
    expect(shovel()).toMatchObject({ count: 1, wear: 0 });
  });

  it("переворот не прошёл (это нажатие уже получило отказ) — износ назад", async () => {
    const press = op();
    const wear = runCmd({ cmd: "dig", bagId: BAG, op: `bagbury:acc1:${press}`, bury: false });
    expect(wear).toBeTruthy();
    await expect(bury("w1", press)).rejects.toThrow();
    expect(shovel()).toMatchObject({ count: 1, wear: 0 });
  });

  it("повтор того же нажатия — второй раз не копает и износ не снимает", async () => {
    const press = op();
    await bury("w1", press);
    bag()!.buried = false;
    await bury("w1", press).catch(() => {});
    expect(bag()?.buried).toBe(false);
    expect(shovel()).toMatchObject({ count: 1, wear: 50 });
  });

  it("ответ переворота потерян — «забор» ключа видит исход: закопан, износ остаётся", async () => {
    db.loseOn = "dig";
    await bury();
    expect(bag()?.buried).toBe(true);
    expect(shovel()?.wear).toBe(50);
  });

  it("переворот не дошёл до базы — «забор» ставит отказ: износ назад, опоздавшая попытка не копает", async () => {
    const press = op();
    db.failOn = ["dig"];
    await expect(bury("w1", press)).rejects.toThrow("MCP timeout");
    expect(shovel()).toMatchObject({ count: 1, wear: 0 });
    runCmd({ cmd: "dig", bagId: BAG, op: `bagbury:acc1:${press}`, bury: true });
    expect(bag()?.buried).toBe(false);
  });
});

describe("гонка «закопать и забрать»", () => {
  it("одно из двух: либо забрали (бугорка нет, износ назад), либо закопали (мешочек цел)", async () => {
    packOf("h2").set(SHOVEL, { count: 1, marks: { mob: 0, mine: 0, field: 0, loot: 0 }, wear: 0 });
    const [b, t] = await Promise.allSettled([
      bury("w2"),
      call(take.takeFromLootBag, "w1", { bagId: BAG, op: op() }),
    ]);
    const took = packOf("h1").get(BANANA)?.count ?? 0;
    if (t.status === "fulfilled") {
      expect(took).toBe(8);
      expect(b.status).toBe("rejected");
      expect(packOf("h2").get(SHOVEL)).toMatchObject({ count: 1, wear: 0 });
    } else {
      expect(b.status).toBe("fulfilled");
      expect(took).toBe(0);
      expect(countOf(bag(), BANANA)).toBe(8);
    }
  });
});

describe("сроки бугорка", () => {
  const HOUR = 3600_000;
  const portions = () =>
    seedBag(BAG, {
      q: 5,
      r: 7,
      items: [
        { stackKey: BANANA, count: 3, expiresAt: db.now + HOUR, marks: { mob: 3, mine: 0, field: 0, loot: 0 } },
        { stackKey: BANANA, count: 4, expiresAt: db.now + 5 * HOUR },
        { stackKey: "custom:cst_milk", count: 2, expiresAt: db.now - 1 },
      ],
    });

  it("закопать: срок всех порций — закапывание + 24 ч, порции вида слились, сгоревшее ушло", async () => {
    portions();
    db.now += 1000;
    await bury();
    expect(bag()?.items).toEqual([
      expect.objectContaining({ stackKey: BANANA, count: 7, expiresAt: db.now + TTL, marks: expect.objectContaining({ mob: 3 }) }),
    ]);
  });

  it("выкопать: сроки остаются от закапывания", async () => {
    portions();
    await bury();
    const buriedAt = db.now;
    db.now += 2 * HOUR;
    await unbury();
    expect(bag()?.items.map((p) => p.expiresAt)).toEqual([buriedAt + TTL]);
  });

  it("бугорок сгорел — не выкопать даже лопатой, износ не снят", async () => {
    await bury();
    db.now += TTL + 1;
    await expect(unbury()).rejects.toThrow("bag.gone");
    expect(shovel()).toMatchObject({ count: 1, wear: 50 });
  });

  it("пока из мешочка забирают (снятие в полёте) — закопать нельзя, износ назад", async () => {
    runCmd({ cmd: "take", bagId: BAG, stackKey: BANANA, qty: 2, cap: 2, op: "fly", heroId: "h2" });
    await expect(bury()).rejects.toThrow("bag.busy");
    expect(bag()?.buried).toBe(false);
    expect(shovel()).toMatchObject({ count: 1, wear: 0 });
  });
});

describe("энергия лопаты (§8.23)", () => {
  it("закопать и выкопать — по 2 энергии", async () => {
    await bury();
    await unbury();
    expect(energy).toEqual({ spent: 4, refunded: 0 });
  });

  it("мост повторил переворот вслепую — свой (тот же nonce): плата не возвращается", async () => {
    db.replay = 1;
    await bury();
    expect(bag()?.buried).toBe(true);
    expect(energy).toEqual({ spent: 2, refunded: 0 });
  });

  it("без лопаты — энергия назад; отказ до лопаты — не берётся вовсе", async () => {
    await expect(bury("w2")).rejects.toThrow("bag.need_shovel");
    expect(energy).toEqual({ spent: 2, refunded: 2 });
    bag()!.buried = true;
    await expect(bury()).rejects.toThrow("bag.buried");
    expect(energy.spent).toBe(2);
  });
});
