// Ручки Ратуши поверх фейковой базы: окно (места, каталог, Храм альфа-теста),
// улучшение, покупка здания и декора — с какими ценами и ключами зовётся база,
// отказы ключами, проверка места перед постройкой Казино/Дома/Архитектора.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  admin: true,
  settings: null as string | null,
  open: true as boolean,
  row: {} as Record<string, unknown>,
  sql: [] as string[],
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as string | null,
  applied: true,
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
vi.mock("@/server/auth", () => ({
  requireWallet: () => "w_me",
  requireAdmin: () => {
    if (!s.admin) throw new Error("Доступ запрещён");
    return "w_me";
  },
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/townhall_prices_open/.test(sql)) return s.open ? [{ value: true }] : [];
    if (/FROM yuplink.settings/.test(sql)) return s.settings ? [{ value: s.settings }] : [];
    if (/castle_slots_used/.test(sql)) return [s.row];
    return [];
  },
}));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      s.rpc.push({ fn, args });
      if (s.rpcError) return { error: { message: s.rpcError }, data: null };
      if (fn === "castle_townhall_upgrade")
        return { error: null, data: [{ level: Number(args.p_from) + 1, applied: s.applied }] };
      if (fn === "castle_building_buy")
        return { error: null, data: [{ building_id: "cb_1", applied: s.applied }] };
      return { error: null, data: [{ applied: s.applied }] };
    },
  },
}));

const { getTownHall, upgradeTownHall } = await import("./townhall-state");
const { buyCastleBuilding, buyCastleDecor, assertCastleSlot } = await import("./townhall-buy");
const { saveTownHallAdmin, dropTownHallConfigCache } = await import("./townhall-config");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });

beforeEach(() => {
  Object.assign(s, {
    admin: true,
    settings: null,
    open: true,
    sql: [],
    rpc: [],
    rpcError: null,
    applied: true,
  });
  s.row = {
    level: 2,
    purchased: 3,
    casino: false,
    auction: true,
    architect: true,
    resources: { wood: 50 },
  };
  s.row.buildings = [{ id: "cb_a", kind: "temple", source: "alpha", createdAt: "2026-10-22" }];
  s.row.decor = ["tree"];
  dropTownHallConfigCache();
});

describe("окно Ратуши", () => {
  it("уровень, места, Храм альфа-тестера, цена следующего", async () => {
    const v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.level).toBe(2);
    expect(v.slots).toEqual({ limit: 15, used: 3, free: 12, nextLimit: 22, base: 0 });
    expect(v.cost).toEqual({ wood: 4_000, stone: 600, gold: 2_000, diamonds: 5 });
    expect(v.legacy).toEqual({ casino: false, auction: true, architect: true });
    const temple = v.catalog.find((c) => c.kind === "temple");
    expect(temple?.owned).toBe(1);
    expect(temple?.problem).toBe("max");
    expect(v.decor.owned).toEqual(["tree"]);
    expect(v.decor.prices.fountain).toBe(1_500);
  });
  it("нет строки — 1-й уровень, всё пусто", async () => {
    s.row = { purchased: 0 };
    const v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.level).toBe(1);
    expect(v.slots.limit).toBe(8);
    expect(v.buildings).toEqual([]);
    expect(v.catalog.find((c) => c.kind === "temple")?.problem).toBeNull();
  });
});

describe("улучшение", () => {
  it("цена — с сервера по уровню, ключ — аккаунт + нажатие", async () => {
    const r = await call(upgradeTownHall, { fromLevel: 1, opId: "op_12345678" });
    expect(r).toEqual({ level: 2, applied: true });
    expect(s.rpc[0]).toEqual({
      fn: "castle_townhall_upgrade",
      args: {
        p_account: "acc_me",
        p_from: 1,
        p_cost: { wood: 2_000, stone: 250, gold: 1_000, diamonds: 0 },
        p_op: "up:acc_me:op_12345678",
      },
    });
  });
  it("повтор нажатия — applied=false, не ошибка", async () => {
    s.applied = false;
    expect(await call(upgradeTownHall, { fromLevel: 1, opId: "op_12345678" })).toEqual({
      level: 2,
      applied: false,
    });
  });
  it("9-й — потолок, база не зовётся; отказы базы — ключами", async () => {
    await expect(call(upgradeTownHall, { fromLevel: 9, opId: "op_12345678" })).rejects.toThrow(
      "townhall.max_level",
    );
    expect(s.rpc).toHaveLength(0);
    s.rpcError = "res_move: в минус";
    await expect(call(upgradeTownHall, { fromLevel: 1, opId: "op_12345678" })).rejects.toThrow(
      "townhall.no_resources",
    );
    s.rpcError = "townhall_level_moved:3";
    await expect(call(upgradeTownHall, { fromLevel: 1, opId: "op_12345678" })).rejects.toThrow(
      "townhall.level_moved",
    );
  });
  it("цены — из настройки админа", async () => {
    s.settings = JSON.stringify({ levels: [{ wood: 1, stone: 2, gold: 3, diamonds: 4 }] });
    await call(upgradeTownHall, { fromLevel: 1, opId: "op_12345678" });
    expect(s.rpc[0].args.p_cost).toEqual({ wood: 1, stone: 2, gold: 3, diamonds: 4 });
  });
});

describe("покупка здания", () => {
  it("Храм: цена, потолок, уровень и лимиты — с сервера", async () => {
    expect(await call(buyCastleBuilding, { kind: "temple", opId: "op_12345678" })).toEqual({
      id: "cb_1",
      kind: "temple",
      applied: true,
    });
    expect(s.rpc[0]).toEqual({
      fn: "castle_building_buy",
      args: {
        p_account: "acc_me",
        p_kind: "temple",
        p_cost: { wood: 20, stone: 0, gold: 0, diamonds: 0 },
        p_max: 1,
        p_need_level: 1,
        p_limits: [8, 15, 22, 29, 36, 43, 50, 57, 64],
        p_base: 0,
        p_op: "bld:acc_me:op_12345678",
      },
    });
  });
  it("вида нет в каталоге — отказ без базы; отказы лимита — ключами с числами", async () => {
    await expect(call(buyCastleBuilding, { kind: "castle", opId: "op_12345678" })).rejects.toThrow(
      "townhall.unknown_kind",
    );
    expect(s.rpc).toHaveLength(0);
    s.rpcError = "townhall_no_slot:8:8";
    await expect(call(buyCastleBuilding, { kind: "temple", opId: "op_12345678" })).rejects.toThrow(
      "townhall.no_slot:8:8",
    );
    s.rpcError = "townhall_need_level:3";
    await expect(call(buyCastleBuilding, { kind: "temple", opId: "op_12345678" })).rejects.toThrow(
      'townhall.need_level|{"n":3}',
    );
    s.rpcError = "townhall_kind_max:1";
    await expect(call(buyCastleBuilding, { kind: "temple", opId: "op_12345678" })).rejects.toThrow(
      "townhall.kind_max",
    );
  });
});

describe("покупка декора", () => {
  it("цена — из каталога сервера, повтор — без списания", async () => {
    expect(await call(buyCastleDecor, { kind: "elven-fountain", opId: "op_12345678" })).toEqual({
      kind: "elven-fountain",
      applied: true,
    });
    expect(s.rpc[0].args).toEqual({
      p_account: "acc_me",
      p_kind: "elven-fountain",
      p_gold: 4_500,
      p_op: "dec:acc_me:op_12345678",
    });
    s.applied = false;
    expect(await call(buyCastleDecor, { kind: "elven-fountain", opId: "op_87654321" })).toEqual({
      kind: "elven-fountain",
      applied: false,
    });
  });
  it("незнакомый вид — отказ без базы", async () => {
    await expect(call(buyCastleDecor, { kind: "dragon", opId: "op_12345678" })).rejects.toThrow(
      "townhall.unknown_kind",
    );
    expect(s.rpc).toHaveLength(0);
  });
});

describe("место перед постройкой Казино / Дома / Архитектора", () => {
  it("есть место — тихо; занято всё — отказ ключом", async () => {
    s.row = { level: 1, purchased: 7 };
    await expect(assertCastleSlot("acc_me")).resolves.toBeUndefined();
    s.row = { level: 1, purchased: 8 };
    await expect(assertCastleSlot("acc_me")).rejects.toThrow("townhall.no_slot:8:8");
  });
});

describe("админ", () => {
  it("сохраняет цены; не админу — отказ", async () => {
    const levels = Array.from({ length: 8 }, () => ({ wood: 1, stone: 1, gold: 1, diamonds: 1 }));
    const cfg = (await call(saveTownHallAdmin, { levels, buildings: {}, decor: { tree: 7 } })) as {
      decor: Record<string, number>;
    };
    expect(cfg.decor.tree).toBe(7);
    expect(s.sql.some((q) => /INSERT INTO yuplink.settings/.test(q))).toBe(true);
    s.admin = false;
    await expect(call(saveTownHallAdmin, { levels, buildings: {}, decor: {} })).rejects.toThrow();
  });
});

describe("цены не утверждены владельцем (townhall_prices_open нет)", () => {
  it("цены уровня и декора скрыты, улучшение и декор — отказ без базы; здание покупается", async () => {
    s.open = false;
    s.row = { level: 1, purchased: 0, buildings: [], resources: { wood: 9e6, gold: 9e6 } };
    const v = (await call(getTownHall)) as { pricesOpen: boolean; cost: unknown; decor: { prices: object } };
    expect(v.pricesOpen).toBe(false);
    expect(v.cost).toBeNull();
    expect(v.decor.prices).toEqual({});
    await expect(call(upgradeTownHall, { fromLevel: 1, opId: "op-123456" })).rejects.toThrow(
      "townhall.prices_pending",
    );
    await expect(call(buyCastleDecor, { kind: "small", opId: "op-123456" })).rejects.toThrow(
      "townhall.prices_pending",
    );
    expect(s.rpc).toEqual([]);
  });
});

