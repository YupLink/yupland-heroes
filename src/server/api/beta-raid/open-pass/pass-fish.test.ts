// «Открыть» рыбу от красного динамита (30.10.2026): тот же платный вход, что у мешочка;
// метку башмака снимает ТОТ ЖЕ оператор входа (ответ boot — «Упс, показалось», рыба
// исчезает у всех), повтор нажатия, когда рыбы уже не видно, отвечает тем же без платы.
// Сундук башмаков не знает.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenAnswer } from "./pass";

const h = vi.hoisted(() => ({
  boot: false,
  again: false,
  gone: false,
  sql: [] as string[],
  events: [] as unknown[],
  notes: [] as unknown[],
}));
vi.mock("@tanstack/react-start", async () => (await import("../dynamite/dynamite.fake")).startFn);
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    h.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_open_pass p")) return [{ boot: h.again }];
    return [{ _row: { near: true, free: false, paid: 1, price: 1, until: "later", boot: h.boot } }];
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: (e: unknown) => void h.events.push(e) }));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1", account: "acc1", mapId: "map1" }),
  loadPlainChest: async () => ({ id: "pc_1", buried: false }),
}));
vi.mock("@/server/api/beta-raid/loot-bag/bag-actor", () => ({
  bagNear: async (_a: unknown, id: string) => {
    if (h.gone) throw new Error("bag.gone");
    return { id, q: 5, r: 6, buried: false, alive: true };
  },
}));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  requireChestNear: async () => {},
  chestNearAny: async () => ({ chest: { owner_account: "acc1" }, mine: true }),
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
}));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({
  noteEnergySpendByWallet: async (...a: unknown[]) => void h.notes.push(a),
}));

const pass = await import("./pass");
type Open = (a: { data: unknown }) => Promise<OpenAnswer>;
const open = pass.openStorage as unknown as Open;
const BAG = `lb_${"b".repeat(32)}`;
const flat = (s: string) => s.replace(/\s+/g, " ");

beforeEach(() => {
  Object.assign(h, { boot: false, again: false, gone: false, sql: [], events: [], notes: [] });
});

describe("рыба открывается как мешочек", () => {
  it("вход в рыбу снимает метку башмака тем же оператором", async () => {
    await open({ data: { q: 5, r: 6, bagId: BAG, op: "op_open1", price: 1 } });
    const sql = flat(h.sql[0]);
    expect(sql).toContain(`hashtext('lootbag:${BAG}')`);
    expect(sql).toContain("boot AS ( UPDATE yuplink.raid_loot_bag_item bi SET count = 0");
    expect(sql).toContain(" AS boot ) _t;");
  });

  it("башмак: ответ boot, рыба исчезает у всех (событие «bags» по клетке)", async () => {
    h.boot = true;
    const res = await open({ data: { q: 5, r: 6, bagId: BAG, op: "op_open2", price: 1 } });
    expect(res).toEqual({ ok: true, paid: 1, until: "later", boot: true });
    expect(h.events).toEqual([{ mapId: "map1", type: "bags", cells: ["5,6"] }]);
    expect(h.notes).toEqual([["w1", 1, "bag_open"]]);
  });

  it("рыба без башмака — обычный ответ входа, без boot и без события", async () => {
    const res = await open({ data: { q: 5, r: 6, bagId: BAG, op: "op_open3", price: 1 } });
    expect(res).toEqual({ ok: true, paid: 1, until: "later" });
    expect(h.events).toEqual([]);
  });

  it("повтор нажатия, когда рыбы уже не видно: вход этого нажатия был — снова «Упс», даром", async () => {
    h.gone = true;
    h.again = true;
    const res = await open({ data: { q: 5, r: 6, bagId: BAG, op: "op_open4", price: 1 } });
    expect(res).toEqual({ ok: true, paid: 0, until: null, boot: true });
    const check = flat(h.sql[0]);
    expect(check).toContain(`p.target = 'lb:${BAG}' AND p.op = 'open:op_open4'`);
    expect(check).toContain("bi.stack_key = 'fish:boot'");
    expect(h.notes).toEqual([]);
  });

  it("рыбы нет и это не повтор — прежний отказ bag.gone", async () => {
    h.gone = true;
    await expect(
      open({ data: { q: 5, r: 6, bagId: BAG, op: "op_open5", price: 1 } }),
    ).rejects.toThrow("bag.gone");
  });

  it("сундук — башмаков не ищем", async () => {
    await open({ data: { q: 5, r: 6, op: "op_open6" } });
    expect(h.sql[0]).not.toContain("fish:boot");
  });
});
