// Покупка золота: цена от $ по правилам подписки → одна транзакция (деньги,
// золото, квитанция, корзины). SQL подменён памятью с той же семантикой
// (gold-shop.fake.ts). Проверяем суммы по валютам, раскладку денег по рельсам,
// что повтор и двойное нажатие не списывают дважды, а отказы ничего не двигают.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { priceIn } from "@/lib/energySub";
import { db, resetDb } from "./gold-shop.fake";

const st = vi.hoisted(() => ({
  rate: 1_611_172.5146858376 as number | null,
  ref: null as { inviter: string; pct: number } | null,
}));
const runDue = vi.hoisted(() => vi.fn(async () => [] as string[]));

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
vi.mock("../../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("../../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("../account-rollout", () => ({ requireAccountUser: async () => "w1.near" }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_A" }));
vi.mock("../energy-sub/rate", () => ({
  daraiPerUsd: async () => (st.rate ? { rate: st.rate, ageMs: 0 } : null),
}));
vi.mock("../energy-sub/batch", () => ({ runDueBatches: runDue }));
vi.mock("./gold-sql", async () => (await import("./gold-shop.fake")).fakeSql);
vi.mock("../referral-gold/ref-context", () => ({ refContextFor: async () => st.ref }));
vi.mock("../../referralQualify", () => ({ noteReferralPurchase: async () => {} }));
vi.mock("../bank/license-money", () => ({ runBuyback: async () => {} }));

const { buyGold } = await import("./gold-buy");

type Input = {
  offerId: string;
  token: "USDT" | "Darai" | "STARS";
  shown: number;
  gold: number;
  opId: string;
};
const buy = (over: Partial<Input> = {}) =>
  buyGold({
    data: {
      offerId: "gold_1k",
      token: "USDT",
      shown: 5,
      gold: 1_000,
      opId: "op_12345678",
      ...over,
    },
  });
const bal = (t: string) => db.balance.get(`acc_A:${t}`);

beforeEach(() => {
  st.ref = null;
  resetDb();
  st.rate = 1_611_172.5146858376;
  runDue.mockClear();
});

describe("суммы и зачисление", () => {
  it("USDT: $5 → 5 USDT, +1 000 золота, деньги 30/70 по корзинам $", async () => {
    const r = await buy();
    expect(r).toEqual({ ok: true, gold: 1_000, token: "USDT", spent: 5, applied: true });
    expect(bal("USDT")).toBe(95);
    expect(db.gold.get("acc_A")).toBe(1_000);
    expect([...db.receipts.values()][0].money).toEqual([
      { bucket: "sub_usd_map", token: "USDT", amount: 1.5 },
      { bucket: "sub_usd", token: "USDT", amount: 3.5 },
    ]);
    await vi.waitFor(() => expect(runDue).toHaveBeenCalledWith("auto"));
  });

  it("DARAI: по курсу со скидкой 10 %, 60 % в пул карты, 15 % сжечь, 25 % разработчикам", async () => {
    const price = priceIn(15, "Darai", st.rate)!;
    const r = await buy({ offerId: "gold_5k", token: "Darai", shown: price, gold: 5_000 });
    expect(r.spent).toBe(21_750_829);
    expect(r.gold).toBe(5_000);
    expect(bal("Darai")).toBe(100_000_000 - price);
    const money = [...db.receipts.values()][0].money;
    expect(money.map((l) => l.bucket)).toEqual(["map", "sub_burn", "sub_dev"]);
    expect(money[0].amount).toBeCloseTo(price * 0.6, 6);
    expect(money.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(price, 8);
  });

  it("звёзды: $5 × 1,1 ÷ 0,013 = 424 ★, корзина звёзд, пачек не трогаем", async () => {
    const r = await buy({ token: "STARS", shown: 424 });
    expect(r.spent).toBe(424);
    expect(bal("STARS")).toBe(5_000 - 424);
    expect([...db.receipts.values()][0].money).toEqual([
      { bucket: "sub_stars", token: "STARS", amount: 424 },
    ]);
    expect(runDue).not.toHaveBeenCalled();
  });
});

describe("повтор и двойное нажатие", () => {
  it("повтор того же нажатия — та же квитанция, второго списания нет", async () => {
    await buy();
    const again = await buy();
    expect(again).toEqual({ ok: true, gold: 1_000, token: "USDT", spent: 5, applied: false });
    expect(db.charges).toBe(1);
    expect(bal("USDT")).toBe(95);
    expect(db.gold.get("acc_A")).toBe(1_000);
  });

  it("двойное нажатие одновременно — одно списание и одно золото", async () => {
    const [a, b] = await Promise.all([buy(), buy()]);
    expect([a.applied, b.applied].sort()).toEqual([false, true]);
    expect(db.charges).toBe(1);
    expect(db.gold.get("acc_A")).toBe(1_000);
  });

  it("ответ потерялся после проведения — повтор отдаёт зачисленное, не покупает снова", async () => {
    db.loseAnswer = true;
    await expect(buy()).rejects.toThrow(/MCP timeout/);
    expect(db.charges).toBe(1);
    const again = await buy();
    expect(again.applied).toBe(false);
    expect(again.gold).toBe(1_000);
    expect(db.charges).toBe(1);
  });

  it("повтор находит квитанцию, даже если курс с тех пор вырос", async () => {
    const price = priceIn(5, "Darai", st.rate)!;
    await buy({ token: "Darai", shown: price });
    st.rate = st.rate! * 1.5;
    const again = await buy({ token: "Darai", shown: price });
    expect(again).toMatchObject({ applied: false, spent: price, gold: 1_000 });
  });

  it("новое нажатие — новая покупка", async () => {
    await buy();
    await buy({ opId: "op_87654321" });
    expect(db.charges).toBe(2);
    expect(db.gold.get("acc_A")).toBe(2_000);
  });
});

describe("отказы ничего не двигают", () => {
  const untouched = () => {
    expect(db.charges).toBe(0);
    expect(db.gold.get("acc_A")).toBe(0);
    expect(db.receipts.size).toBe(0);
  };

  it("не хватает — ключ с числами, без списания", async () => {
    db.balance.set("acc_A:USDT", 2.07);
    await expect(buy()).rejects.toThrow(
      'gshop.err_money|{"token":"USDT","need":"5","have":"2.07"}',
    );
    expect(bal("USDT")).toBe(2.07);
    untouched();
  });

  it("цена выросла больше допуска 2 % — отказ до денег", async () => {
    const price = priceIn(5, "Darai", st.rate)!;
    await expect(buy({ token: "Darai", shown: Math.floor(price / 1.03) })).rejects.toThrow(
      "gshop.err_price_changed",
    );
    untouched();
  });

  it("DARAI без курса — отказ, USDT и звёзды работают", async () => {
    st.rate = null;
    await expect(buy({ token: "Darai", shown: 7_000_000 })).rejects.toThrow("gshop.err_no_rate");
    untouched();
    await expect(buy({ token: "STARS", shown: 424 })).resolves.toMatchObject({ applied: true });
  });

  it("пакет выключен или поменялся с показа", async () => {
    db.offers.get("gold_1k")!.active = false;
    await expect(buy()).rejects.toThrow("gshop.err_off");
    db.offers.get("gold_1k")!.active = true;
    await expect(buy({ gold: 2_000 })).rejects.toThrow("gshop.err_changed");
    untouched();
  });

  it("чужие валюты и кривой ключ не проходят проверку входа", async () => {
    // Проверка входа в заглушке бросает сразу — оборачиваем в обещание, как у сервера.
    const later = (over: Partial<Input>) => Promise.resolve().then(() => buy(over));
    await expect(later({ token: "GJ" } as unknown as Partial<Input>)).rejects.toThrow();
    await expect(later({ opId: "op:1:2:3:4" })).rejects.toThrow();
    untouched();
  });
});

describe("рефка золотом (§8.101)", () => {
  it("есть пригласивший: тот же % оплаты — строкой фонда выкупа, остальное — по корзинам", async () => {
    st.ref = { inviter: "acc_I", pct: 10 };
    await buy({ offerId: "gold_1k", token: "USDT", shown: 5, gold: 1_000, opId: "op-ref-0001" });
    const money = [...db.receipts.values()][0].money;
    expect(money.find((l) => l.bucket === "ref_bb")).toEqual({
      bucket: "ref_bb",
      token: "USDT",
      amount: 0.5,
    });
    const rest = money.filter((l) => l.bucket !== "ref_bb").reduce((s, l) => s + l.amount, 0);
    expect(Math.round(rest * 1e6) / 1e6).toBe(4.5);
  });

  it("нет пригласившего — строки фонда нет", async () => {
    await buy({ offerId: "gold_1k", token: "USDT", shown: 5, gold: 1_000, opId: "op-ref-0002" });
    expect([...db.receipts.values()][0].money.some((l) => l.bucket === "ref_bb")).toBe(false);
  });
});
