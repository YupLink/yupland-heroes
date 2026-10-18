// Открытие бокса: приз бросается один раз и записывается на бокс. Сорвалась
// выдача — бокс снова закрыт, повтор выдаёт ТОТ ЖЕ приз (перебросить нельзя).
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = {
  grant: { result_chips: null as unknown, opened: true },
  deliverFails: false,
  delivered: [] as Array<{ kind: string; amount: number }>,
};
const pool = [{ kind: "resource", weight: 100, resource: "gold", amountMin: 1, amountMax: 1000 }];

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, validate?: (d: unknown) => unknown) => (args?: { data?: unknown }) =>
      fn({ data: validate ? validate(args?.data) : args?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (validate: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, validate) }),
    };
  },
}));
const chain = (table: string) => ({
  select: () => ({
    eq: () => ({
      maybeSingle: async () =>
        table === "packs"
          ? { data: { id: "cp_1", kind: "mystic", mystic_pool: pool } }
          : { data: { result_chips: st.grant.result_chips } },
    }),
  }),
  update: (patch: Record<string, unknown>) => ({
    eq: async () => {
      if ("result_chips" in patch) st.grant.result_chips = patch.result_chips;
      if ("opened_at" in patch) st.grant.opened = patch.opened_at !== null;
    },
  }),
});
vi.mock("../db/pg", () => ({
  pg: {
    chipPacks: { raw: () => chain("packs") },
    chipPackGrants: { raw: () => chain("grants") },
  },
  sb: { rpc: async () => ({ data: [{ gid: "g1" }], error: null }) },
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w.near", isAdminWallet: () => false }));
vi.mock("./user", () => ({ getSisterWallets: async () => ["w.near"] }));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_A" }));
vi.mock("./mystic-grant", async (orig) => ({
  ...(await orig<typeof import("./mystic-grant")>()),
  deliverMysticTier: async (_w: string, _g: string, tier: { kind: string }, amount: number) => {
    if (st.deliverFails) throw new Error("market.need_hero");
    st.delivered.push({ kind: tier.kind, amount });
    return { kind: tier.kind, amount };
  },
}));

const { openMysticBox } = await import("./mystic-open");

beforeEach(() => {
  st.grant = { result_chips: null, opened: true };
  st.deliverFails = false;
  st.delivered = [];
});

describe("открытие бокса", () => {
  it("сбой выдачи — бокс закрыт, выпавший приз за ним; повтор — тот же приз", async () => {
    st.deliverFails = true;
    await expect(openMysticBox({ data: { packId: "cp_1" } })).rejects.toThrow("market.need_hero");
    expect(st.grant.opened).toBe(false);
    const rolled = (st.grant.result_chips as { rolled: { amount: number } }).rolled;
    expect(rolled.amount).toBeGreaterThanOrEqual(1);

    st.deliverFails = false;
    const r = await openMysticBox({ data: { packId: "cp_1" } });
    expect(st.delivered).toEqual([{ kind: "resource", amount: rolled.amount }]);
    expect(r.prize).toEqual({ kind: "resource", amount: rolled.amount });
    expect(st.grant.result_chips).toEqual({ kind: "resource", amount: rolled.amount });
  });
});
