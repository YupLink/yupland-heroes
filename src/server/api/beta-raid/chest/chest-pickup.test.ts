// «Забрать сундук» хозяином целиком: снимок → план → запись одним оператором.
// Базы нет: SQL-модули подменены метками с параметрами, а mcpExec — маленькая
// модель (src/test/chestPickupFake.ts), которая пишет так же, как оператор
// под локом: сверяет снимок и делает всё или ничего. Дополнение №3 владельца
// (29.09): у последнего сундука не влезшее не пропадает — мешочком на клетке.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { count, inBags, resetPickup, s } from "@/test/chestPickupFake";

const M = vi.hoisted(() => "@/test/chestPickupFake");
vi.mock("@tanstack/react-start", async () => (await import(M)).reactStart);
vi.mock("@/server/api/beta-raid/chest/chest-pickup-sql", async () => (await import(M)).pickupSqlMock);
vi.mock("@/server/api/beta-raid/chest/chest-pickup-snap-sql", async () => (await import(M)).snapSqlMock);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/raidLive", async () => (await import(M)).raidLive);
vi.mock("@/server/api/beta-raid/econ/chest-note", async () => (await import(M)).chestNote);
vi.mock("@/server/api/beta-raid/econ/trade-journal", async () => (await import(M)).tradeJournal);
vi.mock("@/server/api/beta-raid/loot-bag/bag-sweep", async () => (await import(M)).bagSweep);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await import(M)).backpack);
vi.mock("@/server/api/beta-raid/chest/chest-row", async () => (await import(M)).chestRow);
vi.mock("@/server/api/beta-raid/open-pass/pass", async () => (await import(M)).pass);
vi.mock("@/server/api/beta-raid/open-pass/pass-sql", async () => (await import(M)).passSql);

const { pickUpChest, getChestPickup } = await import("@/server/api/beta-raid/chest/chest-pickup");
type Res = { guard: boolean; taken: unknown[]; bagged?: unknown[]; lost: unknown[] };
type View = { sig?: string; taken: unknown[]; bagged?: unknown[]; lost: unknown[] };
const call = <T>(fn: unknown, data: object) =>
  (fn as (a: { data: object }) => Promise<T>)({ data });
const pick = (op: string, confirm?: boolean, sig?: string) =>
  call<Res>(pickUpChest, { q: 1, r: 2, op, confirm, sig });
const view = () => call<View>(getChestPickup, { q: 1, r: 2 });
const ORE = "custom:cst_ore";

beforeEach(resetPickup);

describe("не последний сундук", () => {
  it("сундук и живая охрана — в рюкзак, сеть продолжает работать", async () => {
    await expect(pick("op1abc")).resolves.toEqual({
      guard: true,
      taken: [],
      bagged: [],
      chestBagged: false,
      lost: [],
    });
    expect(count("custom:cst_mc")).toBe(1);
    expect(count("boss:rbt_1")).toBe(1);
    expect(s.net).toHaveLength(1);
    expect(s.chests).toEqual({ "5,5": "acc_o" });
    expect(s.published).toEqual(["built"]);
  });

  it("нет места под сундук и охрану — отказ с числами, ничего не тронуто", async () => {
    s.bag = [0, 1, 2].map((i) => ({ stackKey: `custom:x${i}`, count: CELL_SIZE, potion: false }));
    await expect(pick("op1abc")).rejects.toThrow("market.backpack_need:2:1");
    expect(s.writes).toBe(0);
    expect(s.chests["1,2"]).toBe("acc_o");
  });

  it("закопанный свой не забрать, пока не выкопан", async () => {
    s.buried.add("1,2");
    await expect(pick("op1abc")).rejects.toThrow("chest.buried");
    expect(s.writes).toBe(0);
  });
});

describe("последний сундук", () => {
  beforeEach(() => {
    delete s.chests["5,5"];
  });

  it("без подтверждения — chest.last_confirm, всё на месте", async () => {
    await expect(pick("op1abc")).rejects.toThrow("chest.last_confirm");
    expect(s.writes).toBe(0);
    expect(s.net).toHaveLength(1);
  });

  it("влезло всё — товары сети в рюкзак «собрано прочее», мешочка нет, сеть пуста", async () => {
    const res = await pick("op1abc", true);
    expect(res).toMatchObject({ guard: true, taken: [{ stackKey: ORE, qty: 30 }], bagged: [], lost: [] });
    expect(s.bag.find((b) => b.stackKey === ORE)).toMatchObject({ count: 30, loot: 30 });
    expect(s.net).toEqual([]);
    expect(s.bags).toEqual([]);
    expect(s.notes.move).toBe(1);
  });

  it("не влезло — ровно остаток мешочком на клетке с меткой, ничего не пропало", async () => {
    s.net = [{ stackKey: ORE, count: CELL_SIZE + 10 }];
    s.bag = [{ stackKey: "custom:x0", count: CELL_SIZE, potion: false }];
    const res = await pick("op1abc", true);
    expect(res.taken).toEqual([{ stackKey: ORE, qty: CELL_SIZE }]);
    expect(res.bagged).toEqual([{ stackKey: ORE, qty: 10 }]);
    expect(res.lost).toEqual([]);
    expect(count(ORE) + inBags(ORE)).toBe(CELL_SIZE + 10);
    expect(s.bags).toEqual([{ key: expect.stringContaining("mcpick:"), items: [{ k: ORE, n: 10, loot: 10 }] }]);
    expect(s.net).toEqual([]);
    expect(s.published).toEqual(["built", "bags"]);
  });

  it("дробный остаток — до девятого знака: рюкзак + мешочек = сеть", async () => {
    s.net = [{ stackKey: ORE, count: CELL_SIZE + 4.123456789 }];
    s.bag = [{ stackKey: "custom:x0", count: CELL_SIZE, potion: false }];
    const res = await pick("op1abc", true);
    expect(res.taken).toEqual([{ stackKey: ORE, qty: CELL_SIZE }]);
    expect(res.bagged).toEqual([{ stackKey: ORE, qty: 4.123456789 }]);
  });

  it("без открытого входа сеть не уезжает — «Сначала открой»", async () => {
    s.passes.clear();
    await expect(pick("op1abc", true)).rejects.toThrow("pass.closed");
    expect(s.writes).toBe(0);
  });

  it("окно показывает цифры с отпечатком; подтверждение по старому отпечатку — снова окно", async () => {
    const v = await view();
    expect(v).toMatchObject({ taken: [{ stackKey: ORE, qty: 30 }], bagged: [], lost: [] });
    s.net = [{ stackKey: ORE, count: 2 * CELL_SIZE }];
    await expect(pick("op1abc", true, v.sig)).rejects.toThrow("chest.last_confirm");
    expect(s.writes).toBe(0);
    const fresh = await view();
    await expect(pick("op1abc", true, fresh.sig)).resolves.toMatchObject({
      taken: [{ stackKey: ORE, qty: 2 * CELL_SIZE }],
    });
  });

  it("два «Забрать» разом — содержимое сети уезжает один раз", async () => {
    const got = await Promise.allSettled([pick("opAAAA", true), pick("opBBBB", true)]);
    expect(got.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String(got.find((x) => x.status === "rejected")?.reason)).toContain("chest.gone");
    expect(count(ORE)).toBe(30);
    expect(count("custom:cst_mc")).toBe(1);
    expect(s.writes).toBe(1);
  });

  it("стал последним между снимком и записью — нужны цифры, ничего не тронуто", async () => {
    s.chests["5,5"] = "acc_o";
    s.beforeWrite = () => delete s.chests["5,5"];
    await expect(pick("op1abc")).rejects.toThrow("chest.last_confirm");
    expect(s.writes).toBe(0);
    expect(s.net).toHaveLength(1);
  });

  it("закопанный второй сундук — стоит: этот не последний, сеть не трогается", async () => {
    s.chests["5,5"] = "acc_o";
    s.buried.add("5,5");
    await expect(pick("op1abc")).resolves.toMatchObject({ taken: [], bagged: [] });
    expect(s.net).toHaveLength(1);
  });
});

describe("повторы", () => {
  it("повтор того же нажатия — тот же итог из журнала (и мешочек), второй записи нет", async () => {
    delete s.chests["5,5"];
    s.net = [{ stackKey: ORE, count: CELL_SIZE + 10 }];
    s.bag = [{ stackKey: "custom:x0", count: CELL_SIZE, potion: false }];
    const first = await pick("op1abc", true);
    const again = await pick("op1abc", true);
    expect(again).toEqual(first);
    expect(s.writes).toBe(1);
    expect(s.bags).toHaveLength(1);
    expect(count(ORE) + inBags(ORE)).toBe(CELL_SIZE + 10);
  });

  it("рюкзак поменялся под рукой — план заново: не влезшее — мешочком", async () => {
    delete s.chests["5,5"];
    s.beforeWrite = () =>
      s.bag.push(
        { stackKey: "custom:y", count: CELL_SIZE, potion: false },
        { stackKey: "custom:z", count: CELL_SIZE, potion: false },
      );
    const res = await pick("op1abc", true);
    // Ёмкость 4: две ячейки заняли под рукой, две — сундук и охрана.
    expect(res.taken).toEqual([]);
    expect(res.bagged).toEqual([{ stackKey: ORE, qty: 30 }]);
    expect(inBags(ORE)).toBe(30);
    expect(s.writes).toBe(1);
  });
});
