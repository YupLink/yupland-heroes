// «Управление шахтами» в Ратуше (25.10.2026): покупка — та же функция базы,
// что у Храма (castle_building_buy: списание до постройки, всё или ничего),
// цена владельца 5 000 золота + 10 000 дерева + 5 000 камня + 5 алмазов,
// одно на аккаунт, с 1-го уровня Ратуши; повтор нажатия не задваивает;
// нехватка — отказ без постройки.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MINE_OFFICE_KIND } from "@/lib/townHallCatalog";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as string | null,
  applied: true,
  row: {} as Record<string, unknown>,
  built: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/auth", () => ({ requireWallet: () => "w_me", requireAdmin: () => "w_me" }));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (/townhall_prices_open/.test(sql)) return [{ value: true }];
    if (/FROM yuplink.settings/.test(sql)) return [];
    if (/castle_slots_used/.test(sql)) return [s.row];
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: s.built }];
    return [];
  },
}));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      s.rpc.push({ fn, args });
      if (s.rpcError) return { error: { message: s.rpcError }, data: null };
      if (s.applied) s.built = true;
      return { error: null, data: [{ building_id: "cb_mo", applied: s.applied }] };
    },
  },
}));

const { buyCastleBuilding } = await import("@/server/api/castle-townhall/townhall-buy");
const { getTownHall } = await import("@/server/api/castle-townhall/townhall-state");
const { dropTownHallConfigCache } = await import("@/server/api/castle-townhall/townhall-config");
const { getMineOffice } = await import("./mine-office-own");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const buy = { kind: MINE_OFFICE_KIND, opId: "op_12345678" };

beforeEach(() => {
  Object.assign(s, { rpc: [], rpcError: null, applied: true, built: false });
  s.row = { level: 1, purchased: 0, buildings: [], resources: {} };
  dropTownHallConfigCache();
});

describe("Ратуша продаёт «Управление шахтами»", () => {
  it("в каталоге: цена владельца, одно, с 1-го уровня, место свободно", async () => {
    const v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    const offer = v.catalog.find((c) => c.kind === MINE_OFFICE_KIND);
    expect(offer).toMatchObject({
      cost: { wood: 10_000, stone: 5_000, gold: 5_000, diamonds: 5 },
      max: 1,
      needLevel: 1,
      owned: 0,
      problem: null,
    });
  });
  it("куплено — второе не предлагается; нет места — «улучши Ратушу»", async () => {
    s.row = { level: 1, purchased: 1, buildings: [{ id: "cb_mo", kind: MINE_OFFICE_KIND }] };
    let v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === MINE_OFFICE_KIND)?.problem).toBe("max");
    s.row = { level: 1, purchased: 8, buildings: [] };
    v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === MINE_OFFICE_KIND)?.problem).toBe("slot");
  });
  it("покупка: одна функция базы — цена с сервера, потолок 1, ключ аккаунта", async () => {
    expect(await call(getMineOffice)).toEqual({ owned: false });
    expect(await call(buyCastleBuilding, buy)).toEqual({ id: "cb_mo", kind: MINE_OFFICE_KIND, applied: true });
    expect(s.rpc).toEqual([
      {
        fn: "castle_building_buy",
        args: expect.objectContaining({
          p_account: "acc_me",
          p_kind: MINE_OFFICE_KIND,
          p_cost: { wood: 10_000, stone: 5_000, gold: 5_000, diamonds: 5 },
          p_max: 1,
          p_need_level: 1,
          p_op: "bld:acc_me:op_12345678",
        }),
      },
    ]);
    expect(await call(getMineOffice)).toEqual({ owned: true });
  });
  it("повтор нажатия — тот же ключ, applied=false, не ошибка", async () => {
    s.applied = false;
    expect(await call(buyCastleBuilding, buy)).toEqual({ id: "cb_mo", kind: MINE_OFFICE_KIND, applied: false });
    expect(s.rpc[0].args.p_op).toBe("bld:acc_me:op_12345678");
  });
  it("нехватка и второе здание — отказ ключом, здания нет", async () => {
    s.rpcError = "res_move: в минус";
    await expect(call(buyCastleBuilding, buy)).rejects.toThrow("townhall.no_resources");
    s.rpcError = "townhall_kind_max:1";
    await expect(call(buyCastleBuilding, buy)).rejects.toThrow("townhall.kind_max");
    expect(await call(getMineOffice)).toEqual({ owned: false });
  });
});
