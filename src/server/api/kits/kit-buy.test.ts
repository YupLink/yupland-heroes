// Покупка набора: цена как у подписки → бронь → деньги → выдача → откат. База
// и счёт подменены памятью с той же семантикой, что у SQL (kit-buy.fake.ts).
// Проверяем, что сумма считается по правилам подписки, путь покупки не тратит
// денег без брони, не выдаёт без денег и возвращает ровно один раз, а повтор
// нажатия не списывает дважды. Гонки и таймауты — в kit-buy-edge.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { priceIn } from "@/lib/energySub";
import { bal, db, granted, resetDb } from "./kit-buy.fake";

const st = { rate: 2_601_118 as number | null };
const runDue = vi.fn(async () => []);

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
/** Наборы пока только админам (featureGates): покупатель в тестах — админ, кроме проверки ворот. */
const gate = vi.hoisted(() => ({ admin: true }));
vi.mock("../../auth", () => ({ isAdminWallet: () => gate.admin }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_A" }));
vi.mock("../energy-sub/rate", () => ({
  daraiPerUsd: async () => (st.rate ? { rate: st.rate, ageMs: 0 } : null),
}));
vi.mock("../energy-sub/batch", () => ({ runDueBatches: runDue }));
vi.mock("./kit-order", async () => (await import("./kit-buy.fake")).fakeOrder);

const { buyKit } = await import("./kit-buy");

/** Цены набора за $10 — те же, что у тарифа подписки за $10. */
const DARAI = priceIn(10, "Darai", 2_601_118)!;
const STARS = priceIn(10, "STARS", null)!;

/** Нажатие «Купить»: что игрок видел на карточке — цена, бокс ×3. */
const buy = (over: Record<string, unknown> = {}) =>
  buyKit({
    data: {
      kitId: "kit_1",
      token: "USDT" as const,
      expected: 10,
      boxId: "cp_box",
      boxCount: 3,
      opId: "op_12345678",
      ...over,
    },
  });

beforeEach(() => {
  resetDb();
  st.rate = 2_601_118;
  runDue.mockClear();
  gate.admin = true;
});

describe("пока только админам", () => {
  it("не админ — «набор не продаётся», до брони и денег", async () => {
    gate.admin = false;
    await expect(buy()).rejects.toThrow("kits.err_off");
  });
});

describe("цена — как у подписки", () => {
  it("USDT — цена в $, ключ оплаты — аккаунт + набор + нажатие", async () => {
    await expect(buy()).resolves.toMatchObject({ ok: true, token: "USDT", spent: 10 });
    expect(bal("acc_A", "USDT")).toBe(90);
    expect([...db.spent.keys()]).toEqual(["kit:acc_A:kit_1:op_12345678"]);
    expect(granted()).toHaveLength(1);
    expect(db.kit.sold).toBe(1);
  });

  it("DARAI — по курсу со скидкой подписки, Stars — с наценкой; сумма — в снимке брони", async () => {
    expect(DARAI).toBe(23_410_062);
    expect(STARS).toBe(847);
    await expect(
      buy({ token: "Darai", expected: DARAI, opId: "op_darai_1" }),
    ).resolves.toMatchObject({ token: "Darai", spent: DARAI });
    await expect(
      buy({ token: "STARS", expected: STARS, opId: "op_stars_1" }),
    ).resolves.toMatchObject({ token: "STARS", spent: STARS });
    expect(bal("acc_A", "Darai")).toBe(100_000_000 - DARAI);
    expect(bal("acc_A", "STARS")).toBe(5000 - STARS);
    expect([...db.orders.values()].map((o) => [o.token, o.amount, o.priceUsd])).toEqual([
      ["Darai", DARAI, 10],
      ["STARS", STARS, 10],
    ]);
  });

  it("курс вырос сверх 2 % — отказ ДО брони и денег; в пределах 2 % — по новой цене", async () => {
    await expect(buy({ token: "Darai", expected: Math.floor(DARAI / 1.03) })).rejects.toThrow(
      "kits.err_price_changed",
    );
    expect(db.orders.size).toBe(0);
    await expect(buy({ token: "Darai", expected: Math.ceil(DARAI / 1.01) })).resolves.toMatchObject(
      { spent: DARAI },
    );
  });

  it("нет курса — DARAI не продаётся, USDT и Stars — да", async () => {
    st.rate = null;
    await expect(buy({ token: "Darai", expected: DARAI })).rejects.toThrow("kits.err_no_rate");
    expect(db.orders.size).toBe(0);
    await expect(buy({ opId: "op_usdt_01" })).resolves.toMatchObject({ spent: 10 });
    await expect(
      buy({ token: "STARS", expected: STARS, opId: "op_stars_1" }),
    ).resolves.toMatchObject({ spent: STARS });
  });

  it("цена в $ выросла с показа — отказ до брони", async () => {
    db.kit.priceUsd = 12;
    await expect(buy({ expected: 10 })).rejects.toThrow("kits.err_price_changed");
    expect(db.orders.size).toBe(0);
  });

  it("цену в $ поменяли между расчётом и бронью — бронь отказывает, денег не трогаем", async () => {
    db.priceBumpTo = 9;
    await expect(buy()).rejects.toThrow("kits.err_price_changed");
    expect(db.orders.size).toBe(0);
    expect(db.spent.size).toBe(0);
  });

  it("набора нет — отказ до брони", async () => {
    db.kit.exists = false;
    await expect(buy()).rejects.toThrow("kits.err_not_found");
    expect(db.orders.size).toBe(0);
  });

  it("админ сменил бокс или количество при той же цене — отказ до денег", async () => {
    db.kit.boxCount = 1;
    await expect(buy()).rejects.toThrow("kits.err_changed");
    db.kit.boxCount = 3;
    db.kit.boxId = "cp_other";
    await expect(buy({ opId: "op_second_2" })).rejects.toThrow("kits.err_changed");
    expect(db.orders.size).toBe(0);
    expect(db.spent.size).toBe(0);
    // Свежая витрина — свежий бокс: покупка проходит, в снимке — то, что видел игрок.
    await expect(buy({ boxId: "cp_other", opId: "op_third_33" })).resolves.toMatchObject({
      ok: true,
    });
    expect([...db.orders.values()][0]).toMatchObject({ boxId: "cp_other", boxCount: 3 });
  });
});

describe("покупка набора", () => {
  it("не хватает денег — бронь снята, тираж цел, отказ ключом с числами", async () => {
    db.balance.set("acc_A:USDT", 5);
    await expect(buy()).rejects.toThrow('kits.err_money|{"token":"USDT","need":"10","have":"5"}');
    expect(db.kit.sold).toBe(0);
    expect([...db.orders.values()][0].status).toBe("released");
    expect(db.spent.size).toBe(0);
  });

  it("выдача сорвалась — бронь снята, деньги вернулись ровно один раз", async () => {
    db.failGrant = 1;
    await expect(buy({ token: "Darai", expected: DARAI })).rejects.toThrow("MCP timeout");
    expect(bal("acc_A", "Darai")).toBe(100_000_000);
    expect(db.refunded.size).toBe(1);
    expect(db.kit.sold).toBe(0);
    expect(granted()).toHaveLength(0);
  });

  it("выдача прошла, но ответ потерялся — это успех, возврата нет", async () => {
    db.loseGrantAnswer = true;
    await expect(buy()).resolves.toMatchObject({ ok: true });
    expect(bal("acc_A", "USDT")).toBe(90);
    expect(db.refunded.size).toBe(0);
    expect(granted()).toHaveLength(1);
  });

  it("распродан или лимит — отказ ДО денег", async () => {
    db.kit.stock = 0;
    await expect(buy()).rejects.toThrow("kits.err_sold_out");
    db.kit.stock = null;
    db.kit.per = 1;
    await buy({ opId: "op_first_1" });
    await expect(buy({ opId: "op_second_2" })).rejects.toThrow("kits.err_limit");
    expect(bal("acc_A", "USDT")).toBe(90);
  });

  it("после покупки корзины проверяются пачкой — как после подписки", async () => {
    await buy();
    await vi.waitFor(() => expect(runDue).toHaveBeenCalledWith("auto"));
  });
});

describe("повтор нажатия", () => {
  it("после успеха: второго списания и второго набора нет", async () => {
    await buy();
    await expect(buy()).resolves.toMatchObject({ ok: true });
    expect(bal("acc_A", "USDT")).toBe(90);
    expect(db.orders.size).toBe(1);
    expect(granted()).toHaveLength(1);
  });

  it("после отката — отказ «начни заново», набора даром нет", async () => {
    db.failGrant = 1;
    await expect(buy()).rejects.toThrow();
    await expect(buy()).rejects.toThrow("kits.err_retry");
    expect(bal("acc_A", "USDT")).toBe(100);
    expect(granted()).toHaveLength(0);
  });

  it("одно нажатие пришло трижды разом — списано один раз, бронь одна", async () => {
    const res = await Promise.allSettled([buy(), buy(), buy()]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(bal("acc_A", "USDT")).toBe(90);
    expect(db.orders.size).toBe(1);
  });
});
