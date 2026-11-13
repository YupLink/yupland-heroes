// «Метеостанция» в Ратуше (28.10.2026): покупка — та же функция базы, что у
// «Управления шахтами» (castle_building_buy: списание до постройки, всё или
// ничего), дешёвая цена владельца 1 000 дерева + 500 камня + 500 золота, одна на
// аккаунт, с 1-го уровня Ратуши; повтор нажатия не задваивает; без здания окно
// погоды не открывается.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEATHER_STATION_KIND } from "@/lib/townHallCatalog";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as string | null,
  applied: true,
  row: {} as Record<string, unknown>,
  built: false,
  forecasts: 0,
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
  requireAdmin: () => "w_me",
  isAdminWallet: () => false,
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/weather/weather-odds", () => ({
  readWeatherOdds: async () => ({}),
  weatherForecastOf: async () => {
    s.forecasts++;
    return null;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (/townhall_prices_open/.test(sql)) return [{ value: true }];
    if (/FROM yuplink.settings/.test(sql) && !/raid_maps/.test(sql)) return [];
    if (/castle_slots_used/.test(sql)) return [s.row];
    if (/FROM yuplink.castle_building/.test(sql)) return [{ owned: s.built }];
    if (/FROM yuplink.raid_maps/.test(sql)) return [{ id: "map_a", name: "Мир Альфа" }];
    return [];
  },
}));
vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      s.rpc.push({ fn, args });
      if (s.rpcError) return { error: { message: s.rpcError }, data: null };
      if (s.applied) s.built = true;
      return { error: null, data: [{ building_id: "cb_ws", applied: s.applied }] };
    },
  },
}));

const { buyCastleBuilding } = await import("@/server/api/castle-townhall/townhall-buy");
const { getTownHall } = await import("@/server/api/castle-townhall/townhall-state");
const { dropTownHallConfigCache } = await import("@/server/api/castle-townhall/townhall-config");
const { getWeatherStationOwned } = await import("./wstation-own");
const { getWeatherStation } = await import("./wstation-list");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const buy = { kind: WEATHER_STATION_KIND, opId: "op_12345678" };
const COST = { wood: 1_000, stone: 500, gold: 500, diamonds: 0 };

beforeEach(() => {
  Object.assign(s, { rpc: [], rpcError: null, applied: true, built: false, forecasts: 0 });
  s.row = { level: 1, purchased: 0, buildings: [], resources: {} };
  dropTownHallConfigCache();
});

describe("Ратуша продаёт «Метеостанцию»", () => {
  it("в каталоге: дешёвая цена владельца, одна, с 1-го уровня, место свободно", async () => {
    const v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === WEATHER_STATION_KIND)).toMatchObject({
      cost: COST,
      max: 1,
      needLevel: 1,
      owned: 0,
      problem: null,
    });
  });
  it("куплена — вторая не предлагается; нет места — «улучши Ратушу»", async () => {
    s.row = { level: 1, purchased: 1, buildings: [{ id: "cb_ws", kind: WEATHER_STATION_KIND }] };
    let v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === WEATHER_STATION_KIND)?.problem).toBe("max");
    s.row = { level: 1, purchased: 8, buildings: [] };
    v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === WEATHER_STATION_KIND)?.problem).toBe("slot");
  });
  it("покупка: одна функция базы — цена с сервера, потолок 1, ключ аккаунта", async () => {
    expect(await call(getWeatherStationOwned)).toEqual({ owned: false });
    expect(await call(buyCastleBuilding, buy)).toEqual({
      id: "cb_ws",
      kind: WEATHER_STATION_KIND,
      applied: true,
    });
    expect(s.rpc).toEqual([
      {
        fn: "castle_building_buy",
        args: expect.objectContaining({
          p_account: "acc_me",
          p_kind: WEATHER_STATION_KIND,
          p_cost: COST,
          p_max: 1,
          p_need_level: 1,
          p_op: "bld:acc_me:op_12345678",
        }),
      },
    ]);
    expect(await call(getWeatherStationOwned)).toEqual({ owned: true });
  });
  it("повтор нажатия — тот же ключ, applied=false, не ошибка", async () => {
    s.applied = false;
    expect(await call(buyCastleBuilding, buy)).toMatchObject({ applied: false });
    expect(s.rpc[0].args.p_op).toBe("bld:acc_me:op_12345678");
  });
  it("нехватка и вторая станция — отказ ключом, здания нет", async () => {
    s.rpcError = "res_move: в минус";
    await expect(call(buyCastleBuilding, buy)).rejects.toThrow("townhall.no_resources");
    s.rpcError = "townhall_kind_max:1";
    await expect(call(buyCastleBuilding, buy)).rejects.toThrow("townhall.kind_max");
    expect(await call(getWeatherStationOwned)).toEqual({ owned: false });
  });
});

describe("окно погоды", () => {
  it("без здания — отказ, прогноз не считаем", async () => {
    await expect(call(getWeatherStation)).rejects.toThrow("wstation.not_built");
    expect(s.forecasts).toBe(0);
  });
  it("со зданием — открывается (в замке стоять не нужно)", async () => {
    s.built = true;
    const v = (await call(getWeatherStation)) as { worlds: unknown[]; serverNow: number };
    expect(s.forecasts).toBe(1);
    expect(v.worlds).toEqual([]);
    expect(v.serverNow).toBeGreaterThan(0);
  });
});
