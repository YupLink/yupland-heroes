// Покупка дерева в лавке (товар вида tree): место в рюкзаке проверяется ДО
// денег; сначала оплата, потом выдача в рюкзак стопкой tree:<шаблон>; выдача
// сорвалась — цена возвращается тем же ключом оплаты, запас — назад. Ключ
// стопки — настоящий (item-alias), выдача — настоящая ветка рюкзака.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketItem } from "@/lib/marketItem";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  log: [] as string[],
  roomFail: null as string | null,
  deliverFail: null as string | null,
  realDeliver: false,
  /** Шаблон больше не срубаемый: отказ проверки товара до денег. */
  gone: false,
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
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async () => [] }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ myMapId: async () => "rmap_1" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc1" }));
vi.mock("@/server/api/beta-raid/market-admin", () => ({
  marketItemById: async () => tree,
}));
vi.mock("@/server/api/beta-raid/market-shop", () => ({ assertShopAllowed: async () => {} }));
// «Стоишь у лавки» — отдельная проверка (market-near); здесь герой рядом.
vi.mock("@/server/api/beta-raid/market-near", () => ({ requireShopNear: async () => {} }));
vi.mock("@/server/api/beta-raid/market-chest-buyer", () => ({ assertChestGood: async () => {} }));
vi.mock("@/server/api/beta-raid/tree/tree-admin", () => ({
  assertTreeForSale: async (ref: string | null) => {
    s.log.push(`tree ${ref}`);
    if (s.gone) throw new Error("tree.gone_kind");
  },
}));
vi.mock("@/server/api/beta-raid/market-money", () => ({
  spend: async (_w: string, _a: string, res: string, _t: unknown, n: number, ref: string) => {
    s.log.push(`spend ${res} ${n} ${ref}`);
    return { ref };
  },
  credit: async (_w: string, _a: string, res: string, _t: unknown, n: number, ref: string) => {
    s.log.push(`credit ${res} ${n} ${ref}`);
  },
}));
vi.mock("@/server/api/beta-raid/market-stock", () => ({
  reserveStock: async (_id: string, _m: string, n: number) => {
    s.log.push(`reserve ${n}`);
    return true;
  },
  releaseStock: async (_id: string, _m: string, n: number) => {
    s.log.push(`release ${n}`);
  },
}));
vi.mock("@/server/api/beta-raid/market-deliver", async (orig) => {
  const real = await orig<typeof import("@/server/api/beta-raid/market-deliver")>();
  return {
    deliverGood: async (o: Parameters<typeof real.deliverGood>[0]) => {
      if (s.realDeliver) return real.deliverGood(o);
      s.log.push("deliver");
      if (s.deliverFail) throw new Error(s.deliverFail);
      return { target: "backpack", delivered: o.qty };
    },
  };
});
vi.mock("@/server/api/beta-raid/market-backpack", async () => {
  const alias = await vi.importActual<typeof import("@/server/api/beta-raid/item-alias")>(
    "@/server/api/beta-raid/item-alias",
  );
  return {
    resolveBackpack: async () => ({ heroId: "h1", capacity: 8, potionCapacity: 2 }),
    assertBackpackRoom: async (_bp: unknown, key: string, qty: number) => {
      s.log.push(`room ${key} ${qty}`);
      if (s.roomFail) throw new Error(s.roomFail);
    },
    // Предпроверка покупки (market-buy-room): цена дерева — золото, рюкзак не платит.
    assertTradeRoom: async (_bp: unknown, want: Array<{ stackKey: string; qty: number }>) => {
      s.log.push(`room ${want[0].stackKey} ${want[0].qty}`);
      if (s.roomFail) throw new Error(s.roomFail);
    },
    stackKeyFor: alias.stackKeyFor,
    depositToBackpack: async (o: { heroId: string; item: MarketItem; qty: number }) => {
      s.log.push(`deposit ${o.heroId} ${await alias.stackKeyFor(o.item)} ${o.qty}`);
    },
  };
});
vi.mock("@/server/raidLive", () => ({ publishRaid: () => {} }));
vi.mock("@/server/api/beta-raid/market-buy-limit", () => ({
  holdBuyerLimit: async () => null,
  withBuyerLimit: async (_h: unknown, _q: number, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/server/api/beta-raid/market-undo-alert", () => ({
  undoFailReporter: () => () => () => {},
}));
vi.mock("@/server/api/beta-raid/econ/exchange-note", () => ({ noteMarketBuy: async () => {} }));
vi.mock("@/server/api/beta-raid/town-shop", () => ({ cityShopAt: async () => null }));

const tree = {
  id: "mkt_tree",
  q: 3,
  r: 4,
  pos: 0,
  side: "buy",
  kind: "tree",
  refId: "decoration_oak",
  giveAmount: 1,
  giveToken: null,
  name: "Дуб",
  image: "/oak.png",
  priceResource: "gold",
  priceToken: null,
  priceAmount: 50,
  price2Resource: null,
  price2Token: null,
  price2Amount: null,
  stock: null,
  sold: 0,
  perAccountLimit: null,
  buyerMode: "all",
  buyerRaces: [],
  buyerSpecs: [],
} as MarketItem;

const { buyMarketItem } = await import("@/server/api/beta-raid/market-buy");
const buy = (qty = 2) =>
  (buyMarketItem as unknown as Fn)({ data: { q: 3, r: 4, itemId: "mkt_tree", qty } });

beforeEach(() => {
  s.log.length = 0;
  s.roomFail = null;
  s.deliverFail = null;
  s.realDeliver = false;
  s.gone = false;
});

describe("покупка дерева", () => {
  it("место в рюкзаке — до денег, потом оплата, потом выдача", async () => {
    await expect(buy()).resolves.toMatchObject({ ok: true, qty: 2, delivery: "backpack" });
    expect(s.log[0]).toBe("tree decoration_oak");
    expect(s.log[1]).toBe("room tree:decoration_oak 2");
    expect(s.log[2]).toBe("reserve 2");
    expect(s.log[3]).toMatch(/^spend gold 100 mkt:mkt_tree:acc1:/);
    expect(s.log[4]).toBe("deliver");
  });

  it("шаблон больше не срубаемый — отказ до запаса и денег", async () => {
    s.gone = true;
    await expect(buy()).rejects.toThrow("tree.gone_kind");
    expect(s.log).toEqual(["tree decoration_oak"]);
  });

  it("рюкзак полон — отказ, ни запаса, ни денег", async () => {
    s.roomFail = "market.backpack_need:1:0";
    await expect(buy()).rejects.toThrow("market.backpack_need:1:0");
    expect(s.log).toEqual(["tree decoration_oak", "room tree:decoration_oak 2"]);
  });

  it("выдача сорвалась — цена назад тем же ключом оплаты, запас назад", async () => {
    s.deliverFail = "market.need_hero";
    await expect(buy()).rejects.toThrow("market.need_hero");
    const ref = /^spend gold 100 (\S+)$/.exec(s.log.find((x) => x.startsWith("spend"))!)![1];
    expect(s.log.slice(-2)).toEqual([`credit gold 100 ${ref}:undo`, "release 2"]);
  });

  it("настоящая выдача: рюкзак героя, стопка tree:<шаблон>", async () => {
    s.realDeliver = true;
    await expect(buy(3)).resolves.toMatchObject({ ok: true, qty: 3, delivery: "backpack" });
    expect(s.log).toContain("deposit h1 tree:decoration_oak 3");
  });
});
