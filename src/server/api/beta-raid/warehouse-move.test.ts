// Склад ↔ рюкзак: «всё» переносится точным количеством — ни в рюкзаке, ни на
// полке не остаётся крошки 0,000083 на целую ячейку (жалоба 27.09.2026);
// частичный перенос прежний; откат «своего» не задевает чужие личные полки.
//
// Базы нет: строки рюкзака и полок держит фейк (src/test/warehouseFake.ts) на
// numeric-BigInt и читает из SQL те же условия, что выполнит Postgres.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { dec, decNum } from "@/test/numeric";
import { K, db, fakeDb, item, resetDb, shelf } from "@/test/warehouseFake";
import { fakeDeposit, fakeSlots, fakeUpsert } from "@/test/warehouseFakeOps";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async (sql: string) => fakeDb(sql) }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ myMapId: async () => "m1" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc1" }));
vi.mock("@/server/api/beta-raid/field-settle", () => ({
  settleFieldsForWarehouse: async () => [],
}));
vi.mock("@/server/api/beta-raid/econ/trade-hooks", () => ({ noteShelf: async () => {} }));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1),
}));
vi.mock("@/server/api/beta-raid/potion-bag", () => ({
  IS_POTION_SQL: "false",
  POTION_JOIN: "",
  potionKeysOf: async () => new Set<string>(),
}));
vi.mock("@/server/api/beta-raid/warehouse-store", () => ({
  warehouseAt: async () => ({ name: "Склад" }),
  toStack: (x: unknown) => x,
  loadSlots: async (_m: string, _q: number, _r: number, account: string) => fakeSlots(account),
  upsertSlot: async (...a: unknown[]) =>
    fakeUpsert(a[2] as "own" | "shared", a[3] as string | null, a[4] as string, a[6] as number),
}));
// Списание и возврат — настоящие (их SQL и проверяем), выдача в рюкзак — фейк.
vi.mock("@/server/api/beta-raid/market-backpack", async () => {
  const take =
    await vi.importActual<typeof import("./market-backpack-take")>("./market-backpack-take");
  const back = await vi.importActual<typeof import("./market-backpack-return")>(
    "./market-backpack-return",
  );
  return {
    resolveBackpack: async () => ({ heroId: "h1", capacity: db.capacity, potionCapacity: 0 }),
    takeFromBackpackStack: take.takeFromBackpackStack,
    returnToBackpackStack: back.returnToBackpackStack,
    depositToBackpack: async (o: Parameters<typeof fakeDeposit>[0]) => fakeDeposit(o),
  };
});

const { storeToWarehouse } = await import("@/server/api/beta-raid/warehouse");
const { takeFromWarehouse } = await import("@/server/api/beta-raid/warehouse-take");
type Req = { stackKey: string; qty: number; scope?: "auto" | "own" | "shared" };
const put = (d: Req) =>
  (storeToWarehouse as unknown as (a: { data: object }) => Promise<Record<string, number>>)({
    data: { q: 1, r: 2, ...d },
  });
const take = (d: Req & { scope: "own" | "shared" }) =>
  (takeFromWarehouse as unknown as (a: { data: object }) => Promise<{ qty: number }>)({
    data: { q: 1, r: 2, ...d },
  });
/** Число из рюкзака глазами клиента: numeric → JSON → double. */
const seen = (count: string) => decNum(dec(count));

beforeEach(resetDb);

describe("положить на склад", () => {
  it("«всё» у 7,738083… — стек уходит целиком, крошки в рюкзаке нет", async () => {
    db.bp.set(K, item("7.738083231472351586"));
    const res = await put({ stackKey: K, qty: seen("7.738083231472351586") });
    expect(db.bp.has(K)).toBe(false);
    expect(res.own).toBe(7.738083231);
    expect(db.shelves[0].count).toBe(dec("7.738083231"));
  });

  it("стек, который до тысячных округляется вверх (39,99973 → 40), кладётся весь", async () => {
    db.bp.set(K, item("39.999728747083907307"));
    await put({ stackKey: K, qty: seen("39.999728747083907307") });
    expect(db.bp.has(K)).toBe(false);
    expect(db.shelves[0].count).toBe(dec("39.999728747"));
  });

  it("крошка 0,000455 кладётся, а не «слишком мало»", async () => {
    db.bp.set(K, item("0.000454660540250266"));
    await put({ stackKey: K, qty: seen("0.000454660540250266") });
    expect(db.bp.has(K)).toBe(false);
    expect(db.shelves[0].count).toBe(dec("0.000454661"));
  });

  it("остаток меньше тысячной — тоже «всё»: пыль не остаётся", async () => {
    db.bp.set(K, item("7.738083231472351586"));
    await put({ stackKey: K, qty: 7.738 });
    expect(db.bp.has(K)).toBe(false);
  });

  it("частичный — прежний: 5 из 25, в рюкзаке ровно 20", async () => {
    db.bp.set(K, item("25"));
    await put({ stackKey: K, qty: 5 });
    expect(db.bp.get(K)?.count).toBe(dec("20"));
    expect(db.shelves[0].count).toBe(dec("5"));
  });

  it(`«Ячейку» с точным хвостом плитки — в рюкзаке ровно ${CELL_SIZE}, одна ячейка`, async () => {
    db.bp.set(K, item(`${CELL_SIZE + 7}.738083231472351586`));
    await put({ stackKey: K, qty: 7.738083231 });
    expect(db.bp.get(K)?.count).toBe(dec(`${CELL_SIZE}`));
  });

  it("полка не приняла — всё вернулось в рюкзак (до девятого знака)", async () => {
    db.bp.set(K, item("7.738083231472351586"));
    db.upsertOk = false;
    await expect(put({ stackKey: K, qty: seen("7.738083231472351586") })).rejects.toThrow(
      "braid.wh_full",
    );
    expect(db.bp.get(K)?.count).toBe(dec("7.738083231"));
    expect(db.shelves).toHaveLength(0);
  });
});

describe("забрать со склада", () => {
  it("«всё» с длинной дробью — полка пустеет до нуля, в рюкзаке ровно столько же", async () => {
    db.shelves = [shelf("own", "acc1", "7.738083231")];
    const res = await take({ stackKey: K, scope: "own", qty: 7.738083231 });
    expect(res.qty).toBe(7.738083231);
    expect(db.shelves[0].count).toBe(0n);
    expect(db.bp.get(K)?.count).toBe(dec("7.738083231"));
  });

  it("крошку с полки можно забрать (раньше до тысячных — ноль и «уже забрали»)", async () => {
    db.shelves = [shelf("shared", null, "0.000454661")];
    await take({ stackKey: K, scope: "shared", qty: 0.000454661 });
    expect(db.shelves[0].count).toBe(0n);
    expect(db.bp.get(K)?.count).toBe(dec("0.000454661"));
  });

  it("плитка до тысячных от длинной дроби — пыль уходит вместе с ней", async () => {
    db.shelves = [shelf("own", "acc1", "7.738083231")];
    await take({ stackKey: K, scope: "own", qty: 7.738 });
    expect(db.shelves[0].count).toBe(0n);
  });

  it("частичный — прежний: 5 из 25", async () => {
    db.shelves = [shelf("shared", null, "25")];
    await take({ stackKey: K, scope: "shared", qty: 5 });
    expect(db.shelves[0].count).toBe(dec("20"));
    expect(db.bp.get(K)?.count).toBe(dec("5"));
  });

  it("в рюкзак влезает не всё — тысячные вниз, край ячейки не перешагнуть", async () => {
    db.capacity = 1;
    db.bp.set(K, item("7.738083231"));
    // До края ячейки — CELL_SIZE − 7,738083231; на полке на крошку больше.
    const onShelf = `${CELL_SIZE - 8}.262`;
    db.shelves = [shelf("own", "acc1", onShelf)];
    const res = await take({ stackKey: K, scope: "own", qty: Number(onShelf) });
    expect(res.qty).toBe(Number(`${CELL_SIZE - 8}.261`));
    expect(db.bp.get(K)?.count).toBe(dec(`${CELL_SIZE - 1}.999083231`));
    expect(db.shelves[0].count).toBe(dec("0.001"));
  });

  it("выдача сорвалась — возврат только на СВОЮ полку, чужие личные не растут", async () => {
    db.shelves = [
      shelf("own", "acc1", "10"),
      shelf("own", "acc2", "10"),
      shelf("own", "acc3", "10"),
    ];
    db.depositFails = true;
    await expect(take({ stackKey: K, scope: "own", qty: 10 })).rejects.toThrow("backpack_need");
    expect(db.shelves.map((x) => decNum(x.count))).toEqual([10, 10, 10]);
  });
});

describe("изношенный инструмент переносится с износом (tool-wear-move, 14.10)", () => {
  it("«всё» — уходит вся стопка вместе с износом; обратно — износ на месте", async () => {
    db.bp.set(K, { ...item("3"), wear: 25 });
    await put({ stackKey: K, qty: 3 });
    expect(db.bp.has(K)).toBe(false);
    expect(db.shelves[0]).toMatchObject({ count: dec("3"), wear: 25 });
    await take({ stackKey: K, scope: "own", qty: 3 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("3"), wear: 25 });
    expect(db.shelves[0]).toMatchObject({ count: dec("0") });
    expect(db.shelves[0].wear ?? 0).toBe(0);
  });

  it("одна изношенная штука уходит на склад и возвращается такой же, не починенной", async () => {
    db.bp.set(K, { ...item("1"), wear: 75 });
    await put({ stackKey: K, qty: 1 });
    expect(db.bp.has(K)).toBe(false);
    expect(db.shelves[0]).toMatchObject({ count: dec("1"), wear: 75 });
    await take({ stackKey: K, scope: "own", qty: 1 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("1"), wear: 75 });
  });

  it("часть стопки — уходят целые, износ остаётся там, где был", async () => {
    db.bp.set(K, { ...item("3"), wear: 25 });
    await put({ stackKey: K, qty: 2 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("1"), wear: 25 });
    expect(db.shelves[0].count).toBe(dec("2"));
    expect(db.shelves[0].wear ?? 0).toBe(0);
  });

  it("износ к износу складывается: 60 % + 60 % = одна штука доломана, вторая с 20 %", async () => {
    db.shelves = [{ ...shelf("own", "acc1", "1"), wear: 60 }];
    db.bp.set(K, { ...item("1"), wear: 60 });
    await put({ stackKey: K, qty: 1 });
    expect(db.shelves[0]).toMatchObject({ count: dec("1"), wear: 20 });
  });

  it("на складе места нет — стопка с износом вернулась в рюкзак как была", async () => {
    db.bp.set(K, { ...item("2"), wear: 40 });
    db.upsertOk = false;
    await expect(put({ stackKey: K, qty: 2 })).rejects.toThrow();
    expect(db.bp.get(K)).toMatchObject({ count: dec("2"), wear: 40 });
  });

  it("выдача со склада сорвалась — износ вернулся на полку", async () => {
    db.shelves = [{ ...shelf("own", "acc1", "2"), wear: 30 }];
    db.depositFails = true;
    await expect(take({ stackKey: K, scope: "own", qty: 2 })).rejects.toThrow();
    expect(db.shelves[0]).toMatchObject({ count: dec("2"), wear: 30 });
  });

  it("продажа и оплата по-прежнему не берут изношенную штуку", async () => {
    const { takeFromBackpackStack } = await import("./market-backpack-take");
    db.bp.set(K, { ...item("2"), wear: 25 });
    const exact = { exact: true };
    await expect(takeFromBackpackStack("h1", K, 2, exact)).rejects.toThrow("braid.tool_worn_stays");
    expect(db.bp.get(K)).toMatchObject({ count: dec("2"), wear: 25 });
    expect(await takeFromBackpackStack("h1", K, 1, exact)).toBeTruthy(); // целая — уходит
    expect(db.bp.get(K)).toMatchObject({ count: dec("1"), wear: 25 });
  });
});
