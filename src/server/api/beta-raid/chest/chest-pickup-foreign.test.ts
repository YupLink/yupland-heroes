// «Забрать сундук» чужим (владелец, 29.09.2026, дополнение №2): живой охраны
// нет — сундук открепляется от сети хозяина. Нет места — сундук мешочком на
// клетке. Есть у хозяина другие сундуки — снимающему только сундук; последний —
// вся сеть хозяина: в рюкзак, сколько влезет после сундука, остальное —
// мешочком. Модель базы — src/test/chestPickupFake.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { count, inBags, OWNER, resetPickup, s, THIEF } from "@/test/chestPickupFake";

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
type Res = { guard: boolean; taken: unknown[]; bagged?: unknown[]; chestBagged?: boolean };
type View = { sig?: string; foreign?: boolean; chestBagged?: boolean; guard: unknown };
const call = <T>(fn: unknown, data: object) =>
  (fn as (a: { data: object }) => Promise<T>)({ data });
const view = () => call<View>(getChestPickup, { q: 1, r: 2 });
const lift = async (op: string, confirm = false) => {
  const sig = confirm ? (await view()).sig : undefined;
  return call<Res>(pickUpChest, { q: 1, r: 2, op, confirm, sig });
};
const ORE = "custom:cst_ore";
const CHEST = "custom:cst_mc";
const full = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ stackKey: `custom:x${i}`, count: 20, potion: false }));

beforeEach(() => {
  resetPickup();
  s.actor = THIEF;
  s.guard = null;
});

describe("охрана", () => {
  it("живая охрана — сначала бой: ни окна, ни снятия", async () => {
    s.guard = { tpl: "rbt_1", name: "Тролль", image: null, whole: true };
    await expect(view()).rejects.toThrow("chest.guarded");
    await expect(lift("op1abc")).rejects.toThrow("chest.guarded");
    expect(s.chests["1,2"]).toBe(OWNER);
  });

  it("охрану поставили между снимком и записью — отказ, ничего не тронуто", async () => {
    s.beforeWrite = () => {
      s.guard = { tpl: "rbt_1", name: "Тролль", image: null, whole: true };
    };
    await expect(lift("op1abc")).rejects.toThrow("chest.guarded");
    expect(s.writes).toBe(0);
    expect(s.chests["1,2"]).toBe(OWNER);
  });

  it("закопанный чужому — «сундука нет»", async () => {
    s.buried.add("1,2");
    await expect(view()).rejects.toThrow("chest.gone");
    await expect(lift("op1abc")).rejects.toThrow("chest.gone");
  });
});

describe("у хозяина есть другие сундуки", () => {
  it("снимающему — только сундук; сеть хозяина цела и работает через остальные", async () => {
    await expect(lift("op1abc")).resolves.toMatchObject({ guard: false, taken: [], bagged: [], chestBagged: false });
    expect(count(CHEST)).toBe(1);
    expect(s.net).toEqual([{ stackKey: ORE, count: 30 }]);
    expect(s.chests).toEqual({ "5,5": OWNER });
    expect(s.notes).toMatchObject({ seize: 1, loot: 1 });
  });

  it("места нет — сундук падает мешочком (по цифрам), снят всё равно", async () => {
    s.bag = full(4);
    await expect(lift("op1abc")).rejects.toThrow("chest.last_confirm");
    const v = await view();
    expect(v).toMatchObject({ foreign: true, chestBagged: true, guard: null });
    await expect(lift("op2abc", true)).resolves.toMatchObject({ chestBagged: true, taken: [] });
    expect(count(CHEST)).toBe(0);
    expect(s.bags).toEqual([{ key: expect.any(String), items: [{ k: CHEST, n: 1, loot: 0 }] }]);
    expect(s.chests).toEqual({ "5,5": OWNER });
  });
});

describe("последний сундук хозяина — вся сеть снимающему", () => {
  beforeEach(() => {
    delete s.chests["5,5"];
  });

  it("в рюкзак после сундука, сколько влезет; остальное — мешочком; сеть хозяина пуста", async () => {
    s.bag = full(2);
    const res = await lift("op1abc", true);
    // Ёмкость 4: две заняты, одна — сундук, одна — 20 руды.
    expect(res).toMatchObject({ taken: [{ stackKey: ORE, qty: 20 }], bagged: [{ stackKey: ORE, qty: 10 }] });
    expect(count(CHEST)).toBe(1);
    expect(s.bag.find((b) => b.stackKey === ORE)).toMatchObject({ count: 20, loot: 20 });
    expect(inBags(ORE)).toBe(10);
    expect(s.net).toEqual([]);
    expect(s.chests).toEqual({});
  });

  it("места нет совсем — и сундук, и сеть мешочком, ничего не пропало", async () => {
    s.bag = full(4);
    const res = await lift("op1abc", true);
    expect(res).toMatchObject({ chestBagged: true, taken: [], bagged: [{ stackKey: ORE, qty: 30 }] });
    expect(inBags(CHEST)).toBe(1);
    expect(inBags(ORE)).toBe(30);
    expect(s.net).toEqual([]);
  });

  it("без подтверждения по отпечатку — окно; confirm без sig у чужого не годится", async () => {
    await expect(lift("op1abc")).rejects.toThrow("chest.last_confirm");
    await expect(call(pickUpChest, { q: 1, r: 2, op: "op1abc", confirm: true })).rejects.toThrow(
      "chest.last_confirm",
    );
    expect(s.writes).toBe(0);
  });

  it("без открытого входа сеть не уносится — «Сначала открой»", async () => {
    s.passes.delete(THIEF);
    await expect(view()).rejects.toThrow("pass.closed");
    expect(s.writes).toBe(0);
  });

  it("хозяин положил под рукой — цифры устарели: окно заново, ничего не тронуто", async () => {
    const v = await view();
    s.net.push({ stackKey: "custom:cst_gem", count: 5 });
    await expect(call(pickUpChest, { q: 1, r: 2, op: "op1abc", confirm: true, sig: v.sig })).rejects.toThrow(
      "chest.last_confirm",
    );
    expect(s.writes).toBe(0);
    expect(s.net).toHaveLength(2);
  });

  it("другой забрал руду под рукой (снимок устарел) — план заново по свежей сети", async () => {
    const v = await view();
    s.beforeWrite = () => {
      s.net = [{ stackKey: ORE, count: 12 }];
    };
    await expect(call(pickUpChest, { q: 1, r: 2, op: "op1abc", confirm: true, sig: v.sig })).rejects.toThrow(
      "chest.last_confirm",
    );
    expect(s.writes).toBe(0);
    await expect(lift("op1abc", true)).resolves.toMatchObject({ taken: [{ stackKey: ORE, qty: 12 }] });
  });

  it("хозяин и чужой разом — проходит один, сеть уезжает один раз", async () => {
    const v = await view();
    // Кто действует, ручка читает первым же шагом — вызов сразу за сменой.
    const thief = call(pickUpChest, { q: 1, r: 2, op: "opTTTT", confirm: true, sig: v.sig });
    s.actor = OWNER;
    const owner = call(pickUpChest, { q: 1, r: 2, op: "opOOOO", confirm: true });
    const got = await Promise.allSettled([thief, owner]);
    expect(got.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(s.writes).toBe(1);
    expect(count(ORE) + inBags(ORE)).toBe(30);
  });

  it("повтор того же нажатия — итог из журнала, второй записи и мешочка нет", async () => {
    s.bag = full(3);
    const first = await lift("op1abc", true);
    const again = await call<Res>(pickUpChest, { q: 1, r: 2, op: "op1abc", confirm: true });
    expect(again).toEqual(first);
    expect(s.writes).toBe(1);
    expect(s.bags).toHaveLength(1);
  });
});
