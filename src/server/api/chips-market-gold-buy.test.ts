// Маркет фишек за золото (владелец, 21.10.2026): покупка одного лота и гонки
// с пачкой. Обе идут одним вызовом базы market_buy_batch — здесь он подделан
// памятью с той же семантикой (market-buy-batch.fake.ts). Проверяем: нехватка —
// «Не хватает золота: нужно N, у тебя M» без движений; продавцу 91 %, 9 % сгорает;
// параллельные покупки одного лота (двойное нажатие, пачка + одиночная, два
// кошелька одного аккаунта) платят один раз и не получают фишку даром.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, fakeRpc, resetDb, type FakeLot } from "./market-buy-batch.fake";

const notes = vi.hoisted(() => [] as Array<Record<string, unknown>>);

// Долг (§8.129): у покупателя в этих сценариях долга нет.
vi.mock("./debt/debt-read", () => ({ assertNoDebt: async () => {}, openDebt: async () => null }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "b.near" }));
vi.mock("../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("../chipRest", () => ({ CHIP_REST_MS: 3_600_000 }));
// b.near и b2.near — два кошелька одного аккаунта.
vi.mock("./user-shared", () => ({
  accountOf: async (w: string) => ({ "b.near": "acc_B", "b2.near": "acc_B", "c.near": "acc_C", "s.near": "acc_S" })[w] ?? `acc_${w}`,
}));
vi.mock("./gold-move", async () => {
  const f = await import("./market-buy-batch.fake");
  return { goldOf: async (acc: string) => f.db.gold.get(acc) ?? 0 };
});
vi.mock("./chips-market-lock", () => ({
  MARKET_LOCKED: "locked",
  marketLockState: async () => ({ locked: false }),
  marketLockedFor: async () => false,
}));
vi.mock("./beta-raid/econ/trade-hooks", () => ({
  noteChipMarketSale: async (n: Record<string, unknown>) => void notes.push(n),
}));
vi.mock("../db/pg", async () => {
  const f = await import("./market-buy-batch.fake");
  return {
    MARKET_FEES_WALLET: "_market_fees",
    sb: { rpc: f.fakeRpc },
    // Снимок строки, как у findOne: дальше лот меняет только «база».
    pg: { chipMarketListings: { findOne: async ({ id }: { id: string }) => {
      const l = f.db.lots.get(id);
      return l ? { ...l } : null;
    } } },
  };
});

const { buyListingAs } = await import("./chips-market-buy");
const { buyMarketListings } = await import("./market-batch-buy");
const { goldSplit, requireGoldPrice, goldPriceSchema } = await import("./chips-market-gold");

const lot = (extra: Partial<FakeLot> = {}): FakeLot => ({
  id: "L1", chip_id: "c1", status: "active", seller_account: "acc_S", seller_wallet: "s.near",
  buyer_account: null, price_tickets: 0, price_gold: 100, ...extra,
});
const buyKeys = () => [...db.keys].filter((k) => k.startsWith("chip_market_buy|"));

beforeEach(() => {
  resetDb();
  db.lots.set("L1", lot());
  db.gold.set("acc_B", 150);
  notes.length = 0;
});

describe("покупка лота за золото", () => {
  it("золото покупателя, фишка, 91 % продавцу, 9 % сгорает — одной транзакцией", async () => {
    const r = await buyListingAs("b.near", "L1");
    expect(r).toEqual({ ok: true, pricePaid: 100, sellerGot: 91, commission: 9 });
    expect(db.rpcCalls).toEqual([
      expect.objectContaining({
        fn: "market_buy_batch", p_buyer_account: "acc_B", p_buyer_wallet: "b.near",
        p_ids: ["L1"], p_expected: 100, p_fee_pct: 9, p_rest_seconds: 3600,
      }),
    ]);
    expect(db.gold.get("acc_B")).toBe(50);
    expect(db.gold.get("acc_S")).toBe(91);
    expect(db.gold.get("_market_fees")).toBeUndefined(); // комиссия никому не начислена
    expect(db.chips.get("c1")).toBe("acc_B");
    expect(db.ledger.map((x) => [x.kind, x.gold])).toEqual([["spend", 100], ["earned", 91], ["fee", 9]]);
    expect(db.audit).toEqual([{ id: "L1", price: 100, got: 91, fee: 9 }]);
    expect(notes).toEqual([expect.objectContaining({ priceCur: "gold", price: 100, sellerGot: 91, buyer: "acc_B" })]);
  });

  it("не хватает золота — отказ «нужно N, у тебя M» до базы", async () => {
    db.gold.set("acc_B", 50.7);
    await expect(buyListingAs("b.near", "L1")).rejects.toThrow("Не хватает золота: нужно 100, у тебя 50");
    expect(db.rpcCalls).toEqual([]);
    expect(db.lots.get("L1")?.status).toBe("active");
  });

  it("золото кончилось к моменту списания — откат всего, отказ той же формы", async () => {
    db.beforeRpc = () => db.gold.set("acc_B", 30);
    await expect(buyListingAs("b.near", "L1")).rejects.toThrow("Не хватает золота: нужно 100, у тебя 30");
    expect(db.lots.get("L1")?.status).toBe("active");
    expect(db.chips.size).toBe(0);
    expect(buyKeys()).toEqual([]);
  });

  it("повтор после покупки не задваивает: лот закрыт, база не вызывается", async () => {
    await buyListingAs("b.near", "L1");
    await expect(buyListingAs("b.near", "L1")).rejects.toThrow("Листинг уже закрыт");
    expect(db.rpcCalls).toHaveLength(1);
    expect(db.gold.get("acc_B")).toBe(50);
    expect(db.gold.get("acc_S")).toBe(91);
  });

  it("лот за билеты (до 21.10) золотом не продаётся; свой лот — нельзя", async () => {
    db.lots.set("L1", lot({ price_gold: null, price_tickets: 5 }));
    await expect(buyListingAs("b.near", "L1")).rejects.toThrow("Листинг уже закрыт");
    db.lots.set("L1", lot({ seller_account: "acc_B" }));
    await expect(buyListingAs("b.near", "L1")).rejects.toThrow("Нельзя купить свой листинг");
    expect(db.rpcCalls).toEqual([]);
  });
});

describe("гонки за один лот — платится один раз, фишка не даром", () => {
  it("двойное нажатие: второй запрос видит «уже твой», без списания", async () => {
    const rs = await Promise.all([buyListingAs("b.near", "L1"), buyListingAs("b.near", "L1")]);
    expect(rs.map((r) => r.ok)).toEqual([true, true]);
    expect(db.rpcCalls).toHaveLength(2);
    expect(buyKeys()).toHaveLength(1);
    expect(db.gold.get("acc_B")).toBe(50);
    expect(db.gold.get("acc_S")).toBe(91);
    expect(notes).toHaveLength(1);
  });

  it("два кошелька одного аккаунта — одно списание", async () => {
    await Promise.all([buyListingAs("b.near", "L1"), buyListingAs("b2.near", "L1")]);
    expect(buyKeys()).toHaveLength(1);
    expect(db.gold.get("acc_B")).toBe(50);
    expect(db.gold.get("acc_S")).toBe(91);
  });

  it("одиночная + пачка в замке — одно списание, пачка видит «уже твой»", async () => {
    db.gold.set("acc_B", 250); // хватает на обе — обе доходят до базы
    const [one, batch] = await Promise.all([
      buyListingAs("b.near", "L1"),
      buyMarketListings({ data: { listingIds: ["L1"], expectedTotal: 100, opId: "op-12345678" } }),
    ]);
    expect(one.ok).toBe(true);
    expect(batch).toEqual({ results: [{ id: "L1", status: "mine", price: 100 }], spent: 0 });
    expect(buyKeys()).toHaveLength(1);
    expect(db.gold.get("acc_B")).toBe(150);
    expect(db.gold.get("acc_S")).toBe(91);
  });

  it("лот перехватил другой покупатель — проигравший не платит", async () => {
    db.gold.set("acc_C", 500);
    const [c, b] = await Promise.allSettled([buyListingAs("c.near", "L1"), buyListingAs("b.near", "L1")]);
    expect(c.status).toBe("fulfilled");
    expect(b).toMatchObject({ status: "rejected", reason: new Error("Листинг уже купили — обнови маркет") });
    expect(db.gold.get("acc_B")).toBe(150);
    expect(db.gold.get("acc_C")).toBe(400);
    expect(db.chips.get("c1")).toBe("acc_C");
  });

  it("пачка: два лота, один уже ушёл — куплен один, списан один", async () => {
    db.lots.set("L2", lot({ id: "L2", chip_id: "c2", price_gold: 40 }));
    db.lots.set("L3", lot({ id: "L3", chip_id: "c3", status: "sold", buyer_account: "acc_X" }));
    const r = await buyMarketListings({ data: { listingIds: ["L2", "L3"], expectedTotal: 140, opId: "op-abcdefgh" } });
    expect(r.results).toEqual([
      { id: "L2", status: "bought", price: 40 },
      { id: "L3", status: "failed", reason: "gone" },
    ]);
    expect(db.gold.get("acc_B")).toBe(110);
    expect(db.gold.get("acc_S")).toBeCloseTo(36.4);
  });
});

describe("цена в золоте", () => {
  it("целое золото от 10 (с 22.10.2026); старая вкладка с билетами — «Обнови страницу»", () => {
    expect(goldPriceSchema.safeParse(10).success).toBe(true);
    expect(goldPriceSchema.safeParse(9).success).toBe(false);
    expect(goldPriceSchema.safeParse(1).success).toBe(false);
    expect(goldPriceSchema.safeParse(10.5).success).toBe(false);
    expect(goldPriceSchema.safeParse(1_000_001).success).toBe(false);
    expect(() => requireGoldPrice({ chipId: "c", priceTickets: 1 })).toThrow("Обнови страницу — цены теперь в золоте");
    expect(requireGoldPrice({ chipId: "c", priceGold: 10 })).toEqual({
      chipId: "c",
      priceGold: 10,
    });
  });

  it("ниже 10 — отказ ключом словаря с числом (ru/en), и для пачки тоже", () => {
    const min = 'market.price_min|{"n":10}';
    expect(() => requireGoldPrice({ chipId: "c", priceGold: 9 })).toThrow(min);
    expect(() => requireGoldPrice({ chipIds: ["a", "b"], priceGold: 5 })).toThrow(min);
  });

  it("продавцу 91 %, комиссия 9 % до сотых", () => {
    expect(goldSplit(100)).toEqual({ fee: 9, sellerGets: 91 });
    expect(goldSplit(1)).toEqual({ fee: 0.09, sellerGets: 0.91 });
    expect(goldSplit(333)).toEqual({ fee: 29.97, sellerGets: 303.03 });
  });
});
