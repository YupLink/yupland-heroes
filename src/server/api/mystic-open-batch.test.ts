// Bonus Box пачкой до 50 (владелец, 28.10.2026): то же одиночное открытие,
// повторённое подряд. Сбой выдачи посреди пачки — открытые остаются выданными,
// сорвавшийся бокс откатан, пачка стоп. Одиночное открытие не изменилось.
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { REF_BOX_PACK_ID } from "@/lib/referralRewards";

type Grant = { id: string; pack: string; opened: boolean; result_chips: unknown };
const st = {
  grants: [] as Grant[],
  packKind: "mystic",
  failOn: null as string | null,
  delivered: [] as string[],
  captures: 0,
};
const pool = [{ kind: "resource", weight: 100, resource: "gold", amountMin: 1, amountMax: 1000 }];
const grant = (id: string) => st.grants.find((g) => g.id === id)!;

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    // async — как у настоящего server fn: отказ валидатора приходит отклонённым промисом.
    const wrap =
      (fn: Fn, validate?: (d: unknown) => unknown) => async (args?: { data?: unknown }) =>
        fn({ data: validate ? validate(args?.data) : args?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (validate: (d: unknown) => unknown) => ({
        handler: (fn: Fn) => wrap(fn, validate),
      }),
    };
  },
}));
const packs = {
  raw: () => ({
    select: () => ({
      eq: (_c: string, id: string) => ({
        maybeSingle: async () => ({ data: { id, kind: st.packKind, mystic_pool: pool } }),
      }),
    }),
  }),
};
const grants = {
  raw: () => ({
    select: () => ({
      eq: (_c: string, id: string) => ({
        maybeSingle: async () => ({ data: { result_chips: grant(id).result_chips } }),
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: async (_c: string, id: string) => {
        if ("result_chips" in patch) grant(id).result_chips = patch.result_chips;
        if ("opened_at" in patch) grant(id).opened = patch.opened_at !== null;
      },
    }),
  }),
};
vi.mock("../db/pg", () => ({
  pg: { chipPacks: packs, chipPackGrants: grants },
  sb: {
    // capture_mystic_grant: первый свободный бокс пака помечается открытым.
    rpc: async (_fn: string, args: { p_pack: string }) => {
      st.captures++;
      const g = st.grants.find((x) => x.pack === args.p_pack && !x.opened);
      if (!g) return { data: [], error: null };
      g.opened = true;
      return { data: [{ gid: g.id }], error: null };
    },
  },
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w.near", isAdminWallet: () => false }));
vi.mock("./user", () => ({ getSisterWallets: async () => ["w.near"] }));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_A" }));
vi.mock("./mystic-grant", async (orig) => ({
  ...(await orig<typeof import("./mystic-grant")>()),
  deliverMysticTier: async (_w: string, gid: string, tier: { kind: string }, amount: number) => {
    if (st.failOn === gid) throw new Error("market.need_hero");
    st.delivered.push(gid);
    return { kind: tier.kind, amount, code: "gold" };
  },
}));

const { openMysticBoxes } = await import("./mystic-open-batch");
const { openMysticBox } = await import("./mystic-open");

function stock(n: number, pack = REF_BOX_PACK_ID) {
  for (let i = 1; i <= n; i++)
    st.grants.push({ id: `g${i}`, pack, opened: false, result_chips: null });
}
const open = (count: number, packId = REF_BOX_PACK_ID) =>
  openMysticBoxes({ data: { packId, count } });

beforeEach(() => {
  st.grants = [];
  st.packKind = "mystic";
  st.failOn = null;
  st.delivered = [];
  st.captures = 0;
});

describe("Bonus Box пачкой", () => {
  it("пачка из 10: десять отдельных захватов и выдач, остальные боксы целы", async () => {
    stock(12);
    const r = await open(10);
    expect(r.prizes).toHaveLength(10);
    expect(r.stopped).toBeUndefined();
    expect(st.delivered).toEqual(["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10"]);
    expect(st.captures).toBe(10);
    expect(st.grants.filter((g) => !g.opened).map((g) => g.id)).toEqual(["g11", "g12"]);
    // приз записан на каждый бокс
    expect(grant("g10").result_chips).toEqual(r.prizes[9]);
  });

  it("пачка из 50 при 120 боксах: 50 отдельных бросков, 70 боксов целы", async () => {
    stock(120);
    const r = await open(50);
    expect(r.prizes).toHaveLength(50);
    expect(st.captures).toBe(50);
    expect(st.delivered).toHaveLength(50);
    expect(st.grants.filter((g) => !g.opened)).toHaveLength(70);
    // у каждого бокса — свой бросок, записанный на него
    expect(st.grants.slice(0, 50).every((g, i) => g.result_chips === r.prizes[i])).toBe(true);
  });

  it("боксов меньше, чем просили, — открыты все, что были", async () => {
    stock(3);
    const r = await open(10);
    expect(r.prizes).toHaveLength(3);
    expect(r.stopped).toBeUndefined();
    expect(st.grants.every((g) => g.opened)).toBe(true);
  });

  it("сбой на 3-м: два выданы, третий откатан с выпавшим призом, пачка стоп", async () => {
    stock(10);
    st.failOn = "g3";
    const r = await open(10);
    expect(r.prizes).toHaveLength(2);
    expect(r.stopped).toBe("market.need_hero");
    expect(st.delivered).toEqual(["g1", "g2"]);
    expect(grant("g3").opened).toBe(false);
    expect((grant("g3").result_chips as { rolled?: unknown }).rolled).toBeTruthy();
    // дальше третьего пачка не пошла
    expect(st.grants.slice(3).every((g) => !g.opened && g.result_chips === null)).toBe(true);
  });

  it("сбой на первом — та же ошибка, что у одиночного; бокс закрыт", async () => {
    stock(5);
    st.failOn = "g1";
    await expect(open(5)).rejects.toThrow("market.need_hero");
    expect(grant("g1").opened).toBe(false);
  });

  it("боксов нет — та же ошибка, что у одиночного", async () => {
    await expect(open(10)).rejects.toThrow("Нет боксов для открытия");
  });

  it("другой мистический бокс пачкой не открывается — отказ до захвата", async () => {
    stock(5, "cp_other");
    await expect(open(5, "cp_other")).rejects.toThrow("chips.mystic_batch_only");
    expect(st.captures).toBe(0);
    expect(st.grants.every((g) => !g.opened)).toBe(true);
  });

  it("не мистический пак — отказ; больше 50 и меньше 1 — отказ", async () => {
    stock(60);
    st.packKind = "chips";
    await expect(open(2)).rejects.toThrow("Это не мистический бокс");
    st.packKind = "mystic";
    await expect(open(51)).rejects.toThrow();
    await expect(open(0)).rejects.toThrow();
    expect(st.captures).toBe(0);
  });
});

describe("одиночное открытие не изменилось", () => {
  it("открывает ровно один бокс и отдаёт { prize }", async () => {
    stock(3);
    const r = await openMysticBox({ data: { packId: REF_BOX_PACK_ID } });
    expect(r.prize).toMatchObject({ kind: "resource", code: "gold" });
    expect(st.delivered).toEqual(["g1"]);
    expect(st.grants.filter((g) => g.opened)).toHaveLength(1);
  });

  it("любой мистический бокс по-прежнему открывается по одному", async () => {
    stock(2, "cp_other");
    const r = await openMysticBox({ data: { packId: "cp_other" } });
    expect(r.prize.kind).toBe("resource");
    expect(st.delivered).toEqual(["g1"]);
  });
});
