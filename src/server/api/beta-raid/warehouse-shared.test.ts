// Склад × метки происхождения (владелец, 29.09.2026): пока товар у игрока — в
// рюкзаках его героев и на его личной полке — он «его», метка сохраняется, и
// перенос туда-обратно её не теряет. Общая полка — не «моя»: что уходит туда,
// теряет метки, и забранное оттуда приходит безымянным. Базы нет: фейк
// (src/test/warehouseFake.ts) считает тем же SQL, что уйдёт в Postgres.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { dec, decNum } from "@/test/numeric";
import { K, db, item, resetDb, shelf } from "@/test/warehouseFake";
import { invariantBroken, totalMarks } from "@/test/warehouseFakeOps";

const M = vi.hoisted(() => "@/test/warehouseMocks");
vi.mock("@tanstack/react-start", async () => (await import(M)).reactStart);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/db/pg", async () => (await import(M)).pg);
vi.mock("@/server/api/beta-raid/gate", async () => (await import(M)).gate);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await import(M)).where);
vi.mock("@/server/api/currency/move", async () => (await import(M)).move);
vi.mock("@/server/api/beta-raid/field-settle", async () => (await import(M)).settle);
vi.mock("@/server/api/beta-raid/econ/trade-hooks", async () => (await import(M)).hooks);
vi.mock("@/server/api/beta-raid/item-alias", async () => (await import(M)).alias);
vi.mock("@/server/api/beta-raid/potion-bag", async () => (await import(M)).potion);
vi.mock("@/server/api/beta-raid/warehouse-store", async () => (await import(M)).store);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await import(M)).backpack());

const { storeToWarehouse } = await import("@/server/api/beta-raid/warehouse");
const { takeFromWarehouse } = await import("@/server/api/beta-raid/warehouse-take");
type Req = { qty: number; scope?: "auto" | "own" | "shared" };
const call = (fn: unknown, d: Req) =>
  (fn as (a: { data: object }) => Promise<Record<string, number>>)({
    data: { q: 1, r: 2, stackKey: K, ...d },
  });
const put = (d: Req) => call(storeToWarehouse, d);
const take = (d: Req & { scope: "own" | "shared" }) => call(takeFromWarehouse, d);
const m = (mob: string, mine: string, field: string, loot: string) => ({
  mob: dec(mob),
  mine: dec(mine),
  field: dec(field),
  loot: dec(loot),
});
const NONE = m("0", "0", "0", "0");
const sharedRow = () => db.shelves.find((x) => x.key === K && x.scope === "shared");
const ownRow = () => db.shelves.find((x) => x.key === K && x.scope === "own");

beforeEach(resetDb);

describe("общая полка — не «моя»: метки сбрасываются", () => {
  it("положил собранное на общую — на полке безымянное, забрал оттуда — безымянное", async () => {
    db.bp.set(K, item("10", { mob: "2", field: "3", loot: "5" }));
    await put({ qty: 10, scope: "shared" });
    expect(sharedRow()).toMatchObject({ count: dec("10"), ...NONE });
    expect(totalMarks()).toEqual(NONE);
    await take({ scope: "shared", qty: 10 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("10"), ...NONE });
  });

  it("«Сам»: личной — помеченное первым, не влезшее на общую — теряет метки", async () => {
    // Личная полка на две ячейки, одна занята молоком: своему товару — одна ячейка.
    const cell = `${CELL_SIZE}`;
    db.shelves.push({ ...shelf("own", "acc1", cell), key: "custom:milk" });
    db.bp.set(K, item(`${CELL_SIZE + 10}`, { loot: `${CELL_SIZE + 5}`, mob: "1" }));
    expect(await put({ qty: CELL_SIZE + 10 })).toMatchObject({ own: CELL_SIZE, shared: 10 });
    const ownLoot = `${CELL_SIZE - 1}`;
    expect(ownRow()).toMatchObject({ count: dec(cell), ...m("1", "0", "0", ownLoot) });
    // 6 собранных не влезли в личное — уехали на общую и стали ничьими.
    expect(sharedRow()).toMatchObject({ count: dec("10"), ...NONE });
    expect(totalMarks()).toEqual(m("1", "0", "0", ownLoot));
    expect(invariantBroken()).toBeNull();
  });

  it("метки, лежавшие на общей полке до правила, не выдаются и гаснут при заборе", async () => {
    db.shelves = [shelf("shared", null, "20", { mob: "10", field: "5" })];
    await take({ scope: "shared", qty: 12 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("12"), ...NONE });
    expect(sharedRow()).toMatchObject({ count: dec("8"), ...NONE });
  });

  it("забор с общей сорвался — штуки назад на общую, меток не прибавилось", async () => {
    db.shelves = [shelf("shared", null, "10", { loot: "4" })];
    db.depositFails = true;
    await expect(take({ scope: "shared", qty: 10 })).rejects.toThrow("backpack_need");
    expect(sharedRow()).toMatchObject({ count: dec("10"), ...NONE });
  });

  it("не легло на общую — назад в рюкзак со СВОИМИ метками", async () => {
    db.bp.set(K, item("10", { loot: "10" }));
    db.upsertOk = false;
    await expect(put({ qty: 10, scope: "shared" })).rejects.toThrow("braid.wh_shared_full");
    expect(db.bp.get(K)).toMatchObject({ count: dec("10"), ...m("0", "0", "0", "10") });
  });
});

describe("личная полка — «моя»: туда-обратно без потерь", () => {
  it("пять раз рюкзак ↔ личный склад частями: метки те же, ни одна не родилась", async () => {
    db.bp.set(K, item("37.5", { mob: "4", mine: "1.5", field: "7", loot: "20" }));
    const start = totalMarks();
    for (const qty of [10, 37.5, 5.25, 20, 37.5]) {
      await put({ qty, scope: "own" });
      expect(totalMarks()).toEqual(start);
      await take({ scope: "own", qty: decNum(ownRow()?.count ?? 0n) });
      expect(totalMarks()).toEqual(start);
      expect(invariantBroken()).toBeNull();
    }
    expect(db.bp.get(K)).toMatchObject({
      count: dec("37.5"),
      ...m("4", "1.5", "7", "20"),
    });
  });

  it("перенос между своими героями через личную полку: метки доехали до второго", async () => {
    db.bp.set(K, item("15", { loot: "9", field: "2" }));
    await put({ qty: 15, scope: "own" });
    db.hero = "h2";
    await take({ scope: "own", qty: 15 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("15"), ...m("0", "0", "2", "9") });
    db.hero = "h1";
    expect(db.bp.has(K)).toBe(false);
    expect(totalMarks()).toEqual(m("0", "0", "2", "9"));
  });
});
