// «Газетный киоск» в Ратуше (30.10.2026): покупка — та же функция базы, что у
// «Хижины шаманов» (castle_building_buy: списание до постройки, всё или ничего),
// цена Кай 500 золота + 1 000 дерева + 1 000 камня, один на аккаунт, с 1-го
// уровня Ратуши; повтор нажатия не задваивает; право «строить бесплатно» —
// киоск есть без покупки. Миграция kiosk-01 — страховка «один на аккаунт».
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEWSPAPER_KIOSK_KIND } from "@/lib/townHallCatalog";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as string | null,
  applied: true,
  row: {} as Record<string, unknown>,
  built: false,
  free: null as string | null,
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
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (/townhall_prices_open/.test(sql)) return [{ value: true }];
    if (/castle_free_build/.test(sql)) return s.free ? [{ value: s.free }] : [];
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
      return { error: null, data: [{ building_id: "cb_nk", applied: s.applied }] };
    },
  },
}));

const { buyCastleBuilding } = await import("@/server/api/castle-townhall/townhall-buy");
const { getTownHall } = await import("@/server/api/castle-townhall/townhall-state");
const { dropTownHallConfigCache } = await import("@/server/api/castle-townhall/townhall-config");
const { dropFreeBuildCache } = await import("@/server/api/castle-townhall/free-build");
const { getNewspaperKioskOwned, requireNewspaperKiosk } = await import("./kiosk-own");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const buy = { kind: NEWSPAPER_KIOSK_KIND, opId: "op_12345678" };
const COST = { wood: 1_000, stone: 1_000, gold: 500, diamonds: 0 };

beforeEach(() => {
  Object.assign(s, { rpc: [], rpcError: null, applied: true, built: false, free: null });
  s.row = { level: 1, purchased: 0, buildings: [], resources: {} };
  dropTownHallConfigCache();
  dropFreeBuildCache();
});

describe("Ратуша продаёт «Газетный киоск»", () => {
  it("в каталоге: цена Кай, один, с 1-го уровня, место свободно", async () => {
    const v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === NEWSPAPER_KIOSK_KIND)).toMatchObject({
      cost: COST,
      max: 1,
      needLevel: 1,
      owned: 0,
      problem: null,
    });
  });
  it("куплен — второй не предлагается", async () => {
    s.row = { level: 1, purchased: 1, buildings: [{ id: "cb_nk", kind: NEWSPAPER_KIOSK_KIND }] };
    const v = (await call(getTownHall)) as Awaited<ReturnType<typeof getTownHall>>;
    expect(v.catalog.find((c) => c.kind === NEWSPAPER_KIOSK_KIND)?.problem).toBe("max");
  });
  it("покупка: одна функция базы — цена с сервера, потолок 1, ключ аккаунта", async () => {
    expect(await call(getNewspaperKioskOwned)).toEqual({ owned: false });
    await expect(requireNewspaperKiosk("acc_me")).rejects.toThrow("kiosk.not_built");
    expect(await call(buyCastleBuilding, buy)).toEqual({
      id: "cb_nk",
      kind: NEWSPAPER_KIOSK_KIND,
      applied: true,
    });
    expect(s.rpc).toEqual([
      {
        fn: "castle_building_buy",
        args: expect.objectContaining({
          p_account: "acc_me",
          p_kind: NEWSPAPER_KIOSK_KIND,
          p_cost: COST,
          p_max: 1,
          p_need_level: 1,
          p_op: "bld:acc_me:op_12345678",
        }),
      },
    ]);
    expect(await call(getNewspaperKioskOwned)).toEqual({ owned: true });
  });
  it("повтор нажатия — тот же ключ, applied=false; нехватка — отказ ключом", async () => {
    s.applied = false;
    expect(await call(buyCastleBuilding, buy)).toMatchObject({ applied: false });
    s.rpcError = "res_move: в минус";
    await expect(call(buyCastleBuilding, buy)).rejects.toThrow("townhall.no_resources");
    expect(await call(getNewspaperKioskOwned)).toEqual({ owned: false });
  });
  it("право «строить бесплатно» — киоск есть без покупки и без списания", async () => {
    s.free = JSON.stringify({ accounts: ["acc_me"] });
    expect(await call(getNewspaperKioskOwned)).toEqual({ owned: true });
    expect(await call(buyCastleBuilding, buy)).toMatchObject({ applied: false });
    expect(s.rpc).toEqual([]);
  });
});

describe("миграция kiosk-01", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../../migrations/kiosk-01-one-per-account.sql", import.meta.url)),
    "utf8",
  );
  it("одной транзакцией, повтор безвреден, индекс по виду из кода", () => {
    expect(sql).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_newspaper_kiosk\n" +
        `  ON yuplink.castle_building (account_id) WHERE kind = '${NEWSPAPER_KIOSK_KIND}';`,
    );
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE)\b/);
  });
});
