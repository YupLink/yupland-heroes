// Витрина золота: цены от $ по курсу, доступность способов по правилам Казны,
// вид звездочника. И главное — старые ручки билетов остаются закрытыми.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, db } from "./gold-shop.fake";

const st = vi.hoisted(() => ({
  wallet: "w1.near" as string | null,
  account: true,
  rate: 1_611_172.5146858376 as number | null,
}));

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
vi.mock("../../auth", () => ({ getCurrentWallet: () => st.wallet }));
vi.mock("../account-rollout", () => ({
  requireAccountUser: async () => {
    if (!st.account) throw new Error("Доступ запрещён");
    return st.wallet;
  },
}));
vi.mock("../energy-sub/rate", () => ({
  daraiPerUsd: async () => (st.rate ? { rate: st.rate, ageMs: 0 } : null),
}));
vi.mock("./gold-sql", async () => (await import("./gold-shop.fake")).fakeSql);

const { getGoldOffers } = await import("./gold-offers");

beforeEach(() => {
  resetDb();
  st.wallet = "w1.near";
  st.account = true;
  st.rate = 1_611_172.5146858376;
});

describe("витрина золота", () => {
  it("пакеты с ценами во всех валютах от $", async () => {
    const shop = await getGoldOffers();
    expect(shop.offers.map((o) => [o.id, o.gold, o.discountPct, o.prices])).toEqual([
      ["gold_100", 100, 0, { USDT: 1, Darai: 1_450_056, STARS: 85 }],
      ["gold_1k", 1_000, 50, { USDT: 5, Darai: 7_250_277, STARS: 424 }],
      ["gold_5k", 5_000, 70, { USDT: 15, Darai: 21_750_829, STARS: 1_270 }],
    ]);
    expect(shop.methods).toEqual({ STARS: null, USDT: null, Darai: null });
    expect(shop.starOnly).toBe(false);
  });

  it("выключенный пакет не показывается", async () => {
    db.offers.get("gold_5k")!.active = false;
    expect((await getGoldOffers()).offers.map((o) => o.id)).toEqual(["gold_100", "gold_1k"]);
  });

  it("звездочник видит все способы со счёта, звёзды — его вид", async () => {
    st.wallet = "tg123456";
    const shop = await getGoldOffers();
    expect(shop.starOnly).toBe(true);
    expect(shop.methods).toEqual({ STARS: null, USDT: null, Darai: null });
  });

  it("без курса DARAI недоступна, остальное — да", async () => {
    st.rate = null;
    const shop = await getGoldOffers();
    expect(shop.methods).toEqual({ STARS: null, USDT: null, Darai: "no_rate" });
    expect(shop.offers[1].prices.Darai).toBeNull();
  });

  it("не вошёл — витрина видна, платить нечем; счёт закрыт — тоже", async () => {
    st.wallet = null;
    expect((await getGoldOffers()).methods).toEqual({
      STARS: "login",
      USDT: "login",
      Darai: "login",
    });
    st.wallet = "w1.near";
    st.account = false;
    expect((await getGoldOffers()).methods.USDT).toBe("account");
  });
});
