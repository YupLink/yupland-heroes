// «Хижина шаманов» (28.10.2026): здание — в Ратуше той же функцией базы, что и
// «Метеостанция» (castle_building_buy), цена 2 000 дерева / 1 000 камня /
// 1 000 золота, одно на аккаунт, с 1-го уровня. Шаман — без цены админа не
// продаётся (окно: «Скоро в продаже»), с ценой — castle_shaman_buy по цене
// сервера и ключу нажатия; без хижины окна и покупки нет.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHAMAN_HUT_KIND } from "@/lib/townHallCatalog";
import { SHAMAN_ART, SHAMAN_TEMPLATE_ID } from "@/lib/shamanHut";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as string | null,
  built: false,
  count: 0,
  price: null as unknown,
  tpl: null as Record<string, unknown> | null,
  row: {} as Record<string, unknown>,
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
    if (/key = 'shaman_config'/.test(sql)) return s.price == null ? [] : [{ value: s.price }];
    if (/townhall_prices_open/.test(sql)) return [{ value: true }];
    if (/FROM yuplink.settings/.test(sql)) return [];
    if (/castle_slots_used/.test(sql)) return [s.row];
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: s.built }];
    if (/FROM yuplink.castle_shaman/.test(sql)) return [{ n: s.count }];
    if (/FROM yuplink.raid_boss_template/.test(sql)) return s.tpl ? [s.tpl] : [];
    return [];
  },
}));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      s.rpc.push({ fn, args });
      if (s.rpcError) return { error: { message: s.rpcError }, data: null };
      if (fn === "castle_building_buy") {
        s.built = true;
        return { error: null, data: [{ building_id: "cb_sh", applied: true }] };
      }
      s.count += 1;
      return { error: null, data: [{ shamans: s.count, applied: true }] };
    },
  },
}));

const { buyCastleBuilding } = await import("@/server/api/castle-townhall/townhall-buy");
const { getTownHall } = await import("@/server/api/castle-townhall/townhall-state");
const { dropTownHallConfigCache } = await import("@/server/api/castle-townhall/townhall-config");
const { getShamanHutOwned } = await import("./shaman-own");
const { getShamanHut, buyShaman } = await import("./shaman-hut");
const { dropShamanConfigCache } = await import("./shaman-config");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const COST = { wood: 2_000, stone: 1_000, gold: 1_000, diamonds: 0 };
const buy = { opId: "op_12345678" };

beforeEach(() => {
  Object.assign(s, { rpc: [], rpcError: null, built: false, count: 0, price: null, tpl: null });
  s.row = { level: 1, purchased: 0, buildings: [], resources: {} };
  dropTownHallConfigCache();
  dropShamanConfigCache();
});

describe("Ратуша продаёт «Хижину шаманов»", () => {
  it("в каталоге: цена владельца, одна, с 1-го уровня, место свободно", async () => {
    const v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === SHAMAN_HUT_KIND)).toMatchObject({
      cost: COST,
      max: 1,
      needLevel: 1,
      owned: 0,
      problem: null,
    });
  });
  it("куплена — вторая не предлагается", async () => {
    s.row = { level: 1, purchased: 1, buildings: [{ id: "cb_sh", kind: SHAMAN_HUT_KIND }] };
    const v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === SHAMAN_HUT_KIND)?.problem).toBe("max");
  });
  it("покупка — одна функция базы: цена с сервера, потолок 1; после — хижина есть", async () => {
    expect(await call(getShamanHutOwned)).toEqual({ owned: false });
    await call(buyCastleBuilding, { kind: SHAMAN_HUT_KIND, opId: "op_12345678" });
    expect(s.rpc[0]).toEqual({
      fn: "castle_building_buy",
      args: expect.objectContaining({
        p_account: "acc_me",
        p_kind: SHAMAN_HUT_KIND,
        p_cost: COST,
        p_max: 1,
        p_need_level: 1,
      }),
    });
    expect(await call(getShamanHutOwned)).toEqual({ owned: true });
  });
});

describe("окно хижины", () => {
  it("без хижины — отказ", async () => {
    await expect(call(getShamanHut)).rejects.toThrow("shaman.not_built");
  });
  it("цены нет — шамана видно (картинка, имя), но не продают; характеристик нет", async () => {
    s.built = true;
    s.tpl = {
      id: SHAMAN_TEMPLATE_ID,
      name: "Шаман",
      image_url: SHAMAN_ART,
      max_hp: 0,
      damage: null,
    };
    expect(await call(getShamanHut)).toEqual({
      count: 0,
      price: null,
      shaman: { name: "Шаман", image: SHAMAN_ART, hp: 0, attack: null, guard: false },
    });
  });
  it("цена админа и характеристики — видны; HP и урон есть — можно в охрану", async () => {
    Object.assign(s, { built: true, count: 3, price: JSON.stringify({ price: { gold: 500 } }) });
    s.tpl = {
      id: SHAMAN_TEMPLATE_ID,
      name: "Шаман",
      image_url: null,
      max_hp: "5000",
      damage: "80-120",
    };
    expect(await call(getShamanHut)).toEqual({
      count: 3,
      price: { currency: "gold", amount: 500 },
      shaman: { name: "Шаман", image: SHAMAN_ART, hp: 5000, attack: "80-120", guard: true },
    });
  });
  it("шаблона нет — шаман без характеристик, окно не падает", async () => {
    s.built = true;
    const v = (await call(getShamanHut)) as { shaman: { guard: boolean; image: string } };
    expect(v.shaman).toMatchObject({ guard: false, image: SHAMAN_ART });
  });
});

describe("покупка шамана", () => {
  it("цены нет — отказ, база не тронута", async () => {
    s.built = true;
    await expect(call(buyShaman, buy)).rejects.toThrow("shaman.not_for_sale");
    expect(s.rpc).toEqual([]);
  });
  it("цена есть, хижины нет — отказ до базы", async () => {
    s.price = { price: { gold: 500 } };
    await expect(call(buyShaman, buy)).rejects.toThrow("shaman.not_built");
    expect(s.rpc).toEqual([]);
  });
  it("цена есть — одна функция базы по цене сервера и ключу нажатия, +1 шаман", async () => {
    Object.assign(s, { built: true, price: { price: { diamonds: 7 } } });
    expect(await call(buyShaman, buy)).toEqual({ count: 1, applied: true });
    expect(s.rpc).toEqual([
      {
        fn: "castle_shaman_buy",
        args: { p_account: "acc_me", p_price: { diamonds: 7 }, p_op: "shm:acc_me:op_12345678" },
      },
    ]);
  });
  it("нехватка и хижина пропала — отказ ключом перевода", async () => {
    Object.assign(s, { built: true, price: { price: { gold: 500 } } });
    s.rpcError = "res_move: в минус";
    await expect(call(buyShaman, buy)).rejects.toThrow("shaman.no_resources");
    s.rpcError = "shaman_no_hut";
    await expect(call(buyShaman, buy)).rejects.toThrow("shaman.not_built");
  });
  it("админ сменил цену, пока окно открыто, — отказ, ничего не списано", async () => {
    Object.assign(s, { built: true, price: { price: { gold: 700 } } });
    await expect(call(buyShaman, { ...buy, expect: { currency: "gold", amount: 500 } })).rejects.toThrow(
      "shaman.price_changed",
    );
    expect(s.rpc).toEqual([]);
    expect(await call(buyShaman, { ...buy, expect: { currency: "gold", amount: 700 } })).toMatchObject({
      applied: true,
    });
  });
  it("короткий ключ нажатия не принимаем", async () => {
    Object.assign(s, { built: true, price: { price: { gold: 500 } } });
    await expect(call(buyShaman, { opId: "x" })).rejects.toThrow();
  });
});
