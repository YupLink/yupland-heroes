// Склад хранит происхождение (ПРАВИЛА §8.18): «положить» и «забрать» переносят
// метки с мобов / шахт / грядок / прочего собранного по правилу траты (сначала
// безымянное), и на ЛИЧНОЙ полке ни одна метка не рождается и не теряется — ни
// при переносе туда-обратно, ни при откатах. Общая полка меток не хранит
// (warehouse-shared.test.ts). Базы нет: строки держит фейк
// (src/test/warehouseFake.ts), который считает присваивания и RETURNING тем же
// SQL, что уйдёт в Postgres.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dec } from "@/test/numeric";
import { K, db, item, resetDb, shelf } from "@/test/warehouseFake";
import { invariantBroken, totalMarks } from "@/test/warehouseFakeOps";
import { rpc } from "@/test/warehouseMocks";

// Путь фабрик — через vi.hoisted: vi.mock поднимается выше обычных констант.
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
type Req = { stackKey?: string; qty: number; scope?: "auto" | "own" | "shared" };
const call = (fn: unknown, d: Req) =>
  (fn as (a: { data: object }) => Promise<Record<string, number>>)({
    data: { q: 1, r: 2, stackKey: K, ...d },
  });
const put = (d: Req) => call(storeToWarehouse, d);
const take = (d: Req & { scope: "own" | "shared" }) => call(takeFromWarehouse, d);
const marks = (r: { mob: bigint; mine: bigint; field: bigint; loot: bigint } | undefined) =>
  r && { mob: r.mob, mine: r.mine, field: r.field, loot: r.loot };
const m = (mob: string, mine: string, field: string, loot = "0") => ({
  mob: dec(mob),
  mine: dec(mine),
  field: dec(field),
  loot: dec(loot),
});
/** Личная полка занята другим товаром на одну ячейку из двух. */
const ownHalfFull = () => db.shelves.push({ ...shelf("own", "acc1", "20"), key: "custom:milk" });

beforeEach(() => {
  resetDb();
  rpc.error = null;
  rpc.calls = [];
});

describe("положить на склад", () => {
  it("всё: метки уезжают на полку; личной — помеченное первым, общей — безымянное", async () => {
    ownHalfFull();
    db.bp.set(K, item("30", { mob: "10", mine: "3", field: "5" }));
    const res = await put({ qty: 30 });
    expect(res).toMatchObject({ own: 20, shared: 10 });
    expect(db.bp.has(K)).toBe(false);
    const own = db.shelves.find((x) => x.key === K && x.scope === "own");
    const shared = db.shelves.find((x) => x.key === K && x.scope === "shared");
    expect(marks(own)).toEqual(m("10", "3", "5"));
    expect(marks(shared)).toEqual(m("0", "0", "0"));
    expect(totalMarks()).toEqual(m("10", "3", "5"));
    expect(invariantBroken()).toBeNull();
  });

  it("часть: сначала безымянное, потом грядки, шахты, мобы", async () => {
    db.bp.set(K, item("30", { mob: "10", field: "5" }));
    await put({ qty: 12 });
    expect(marks(db.shelves[0])).toEqual(m("0", "0", "0"));
    expect(db.bp.get(K)).toMatchObject({ count: dec("18"), ...m("10", "0", "5") });
    await put({ qty: 10 });
    expect(marks(db.shelves[0])).toEqual(m("2", "0", "5"));
    expect(db.bp.get(K)).toMatchObject({ count: dec("8"), ...m("8", "0", "0") });
    expect(invariantBroken()).toBeNull();
  });

  it("полка не приняла — товар вернулся в рюкзак вместе с метками", async () => {
    db.bp.set(K, item("30", { mob: "10", mine: "1", field: "2" }));
    db.upsertOk = false;
    await expect(put({ qty: 30 })).rejects.toThrow("braid.wh_full");
    expect(db.bp.get(K)).toMatchObject({ count: dec("30"), ...m("10", "1", "2") });
  });

  it("личная легла, общая нет — назад только не легшая часть, метки не удваиваются", async () => {
    ownHalfFull();
    db.upsertPlan = [true, false];
    db.bp.set(K, item("30", { mob: "10" }));
    const res = await put({ qty: 30 });
    expect(res).toMatchObject({ own: 20, shared: 0, rejected: 10 });
    const own = db.shelves.find((x) => x.key === K);
    expect(own).toMatchObject({ count: dec("20"), ...m("10", "0", "0") });
    expect(db.bp.get(K)).toMatchObject({ count: dec("10"), ...m("0", "0", "0") });
    expect(totalMarks()).toEqual(m("10", "0", "0"));
    expect(invariantBroken()).toBeNull();
  });

  it("старый стек рюкзака (только мобы) — метка мобов едет на полку", async () => {
    db.bp.set(K, item("10", { mob: "10" }));
    await put({ qty: 10 });
    expect(marks(db.shelves[0])).toEqual(m("10", "0", "0"));
  });
});

describe("забрать со склада", () => {
  it("с полки уходит сначала безымянное, метки едут в рюкзак", async () => {
    db.shelves = [shelf("own", "acc1", "20", { mob: "5", field: "5" })];
    await take({ scope: "own", qty: 12 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("12"), ...m("0", "0", "2") });
    expect(db.shelves[0]).toMatchObject({ count: dec("8"), ...m("5", "0", "3") });
    expect(invariantBroken()).toBeNull();
  });

  it("выдача сорвалась — на полку вернулись и штуки, и метки", async () => {
    db.shelves = [shelf("own", "acc1", "10", { mob: "4", mine: "1" })];
    db.depositFails = true;
    await expect(take({ scope: "own", qty: 10 })).rejects.toThrow("backpack_need");
    expect(db.shelves[0]).toMatchObject({ count: dec("10"), ...m("4", "1", "0") });
  });

  it("старая полка без меток — в рюкзак ложится безымянное", async () => {
    db.shelves = [shelf("own", "acc1", "10")];
    await take({ scope: "own", qty: 10 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("10"), ...m("0", "0", "0") });
  });

  it("прочее собранное (объекты, декор) едет с личной полки так же, как мобы", async () => {
    db.shelves = [shelf("own", "acc1", "20", { loot: "12", field: "3" })];
    await take({ scope: "own", qty: 10 });
    // Безымянных 5 ушли первыми, дальше прочее: 5 loot.
    expect(db.bp.get(K)).toMatchObject({ count: dec("10"), ...m("0", "0", "0", "5") });
    expect(db.shelves[0]).toMatchObject({ count: dec("10"), ...m("0", "0", "3", "7") });
    expect(totalMarks()).toEqual(m("0", "0", "3", "12"));
    expect(invariantBroken()).toBeNull();
  });

  it("ресурс с грядки: метка уходит со штуками, сбой счёта — возвращается на полку", async () => {
    const gold = { ...shelf("own", "acc1", "20", { field: "20" }), key: "resource:gold" };
    db.shelves = [gold];
    rpc.error = { message: "res_move: сбой" };
    await expect(take({ stackKey: "resource:gold", scope: "own", qty: 5 })).rejects.toThrow();
    expect(db.shelves[0]).toMatchObject({ count: dec("20"), ...m("0", "0", "20") });
    rpc.error = null;
    await take({ stackKey: "resource:gold", scope: "own", qty: 5 });
    expect(db.shelves[0]).toMatchObject({ count: dec("15"), ...m("0", "0", "15") });
    expect(rpc.calls.at(-1)).toMatchObject({ p_kind: "wh_take", p_delta: 5 });
  });
});

describe("туда и обратно", () => {
  it("рюкзак → склад → рюкзак: метки те же, ни одна не родилась и не пропала", async () => {
    db.bp.set(K, item("30", { mob: "10", mine: "3", field: "5" }));
    await put({ qty: 30, scope: "own" });
    expect(db.bp.has(K)).toBe(false);
    await take({ scope: "own", qty: 30 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("30"), ...m("10", "3", "5") });
    expect(db.shelves[0]).toMatchObject({ count: 0n, ...m("0", "0", "0") });
    expect(invariantBroken()).toBeNull();
  });

  it("длинные дроби наград: метки сохраняются до девятого знака, как и штуки", async () => {
    db.bp.set(K, item("7.738083231", { mob: "2.5", field: "1.000000001" }));
    await put({ qty: 7.738083231, scope: "own" });
    await take({ scope: "own", qty: 7.738083231 });
    expect(db.bp.get(K)).toMatchObject({
      count: dec("7.738083231"),
      ...m("2.5", "0", "1.000000001"),
    });
    expect(invariantBroken()).toBeNull();
  });
});

describe("сбои и соседи", () => {
  it("общая часть упала с ошибкой — назад только она, со своими метками", async () => {
    ownHalfFull();
    db.upsertPlan = [true, "throw"];
    db.bp.set(K, item("30", { mob: "10", field: "12" }));
    await expect(put({ qty: 30 })).rejects.toThrow("MCP POST 502");
    expect(db.shelves.find((x) => x.key === K)).toMatchObject({
      count: dec("20"),
      ...m("10", "0", "10"),
    });
    expect(db.bp.get(K)).toMatchObject({ count: dec("10"), ...m("0", "0", "2") });
    expect(totalMarks()).toEqual(m("10", "0", "12"));
    expect(invariantBroken()).toBeNull();
  });

  it("личная упала с ошибкой — назад всё и со всеми метками", async () => {
    db.upsertPlan = ["throw"];
    db.bp.set(K, item("30", { mob: "10", field: "12" }));
    await expect(put({ qty: 30 })).rejects.toThrow("MCP POST 502");
    expect(db.bp.get(K)).toMatchObject({ count: dec("30"), ...m("10", "0", "12") });
    expect(db.shelves).toHaveLength(0);
  });

  it("личная не легла, общая легла — помеченное вернулось в рюкзак, на общей безымянное", async () => {
    ownHalfFull();
    db.upsertPlan = [false, true];
    db.bp.set(K, item("30", { mob: "10" }));
    expect(await put({ qty: 30 })).toMatchObject({ own: 0, shared: 10, rejected: 20 });
    expect(db.bp.get(K)).toMatchObject({ count: dec("20"), ...m("10", "0", "0") });
    expect(db.shelves.find((x) => x.key === K)).toMatchObject({
      scope: "shared",
      count: dec("10"),
      ...m("0", "0", "0"),
    });
  });

  it("полка изменилась между снятием и откатом — метки не рождаются и не теряются", async () => {
    const own = shelf("own", "acc1", "10", { mob: "4" });
    db.shelves = [own];
    db.depositFails = true;
    // Пока выдача летела, на полку осел урожай: 5 «с грядок».
    db.beforeDepositFail = () => {
      own.count += dec("5");
      own.field += dec("5");
    };
    await expect(take({ scope: "own", qty: 10 })).rejects.toThrow("backpack_need");
    expect(own).toMatchObject({ count: dec("15"), ...m("4", "0", "5") });
    expect(invariantBroken()).toBeNull();
  });

  it("«Забрать своё» снимает только свою личную полку, чужие метки не трогает", async () => {
    db.shelves = [shelf("own", "acc2", "10", { mob: "10" }), shelf("own", "acc1", "10")];
    await take({ scope: "own", qty: 10 });
    expect(db.shelves[0]).toMatchObject({ count: dec("10"), ...m("10", "0", "0") });
    expect(db.shelves[1].count).toBe(0n);
    expect(db.bp.get(K)).toMatchObject({ count: dec("10"), ...m("0", "0", "0") });
  });
});
