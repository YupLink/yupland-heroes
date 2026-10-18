// Покупка набора на краях: гонка за тираж и лимит, неясный исход оплаты
// (таймаут моста), негодный ключ нажатия и валюта, отказы оплаты → ключи
// словаря. База и счёт подменены памятью (kit-buy.fake.ts), основные пути —
// в kit-buy.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bal, db, fakeOrder, granted, resetDb } from "./kit-buy.fake";

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
vi.mock("../../auth", () => ({ isAdminWallet: () => true }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_A" }));
vi.mock("../energy-sub/rate", () => ({ daraiPerUsd: async () => ({ rate: 2_601_118, ageMs: 0 }) }));
vi.mock("../energy-sub/batch", () => ({ runDueBatches: async () => [] }));
vi.mock("./kit-order", async () => (await import("./kit-buy.fake")).fakeOrder);

const { buyKit, purchaseKit, payError } = await import("./kit-buy");

const input = (over: Record<string, unknown> = {}) => ({
  kitId: "kit_1",
  token: "USDT" as const,
  expected: 10,
  boxId: "cp_box",
  boxCount: 3,
  opId: "op_12345678",
  ...over,
});
const buy = (over: Record<string, unknown> = {}) => buyKit({ data: input(over) });

beforeEach(resetDb);

describe("гонка за тираж и лимит", () => {
  it("тираж 2, пятеро разом — купили двое, остальным «распродано» без списаний", async () => {
    db.kit.stock = 2;
    const accs = ["a1", "a2", "a3", "a4", "a5"];
    for (const a of accs) db.balance.set(`${a}:USDT`, 50);
    const res = await Promise.allSettled(accs.map((a) => purchaseKit(`${a}.near`, a, input())));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    for (const r of res) {
      if (r.status === "rejected") expect(String(r.reason)).toContain("kits.err_sold_out");
    }
    expect(accs.reduce((s, a) => s + bal(a, "USDT"), 0)).toBe(250 - 20);
    expect(db.kit.sold).toBe(2);
  });

  it("лимит 1 на аккаунт, четыре нажатия разом — один набор, одно списание", async () => {
    db.kit.per = 1;
    const ops = ["op_aaaaaaa1", "op_aaaaaaa2", "op_aaaaaaa3", "op_aaaaaaa4"];
    const res = await Promise.allSettled(ops.map((op) => buy({ opId: op })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(bal("acc_A", "USDT")).toBe(90);
    expect(granted()).toHaveLength(1);
  });

  it("последняя единица и сорвавшаяся выдача — единица возвращается в продажу", async () => {
    db.kit.stock = 1;
    db.failGrant = 1;
    await expect(buy({ opId: "op_fail_001" })).rejects.toThrow();
    await expect(buy({ opId: "op_next_002" })).resolves.toMatchObject({ ok: true });
    expect(db.kit.sold).toBe(1);
  });
});

describe("неясный исход оплаты (таймаут моста)", () => {
  it("бронь не снимается; запоздавшая оплата прошла — набор выдаёт самопочинка", async () => {
    db.payTimeout = true;
    await expect(buy()).rejects.toThrow("MCP timeout");
    expect([...db.orders.values()][0].status).toBe("reserved");
    await db.inflight!();
    expect(bal("acc_A", "USDT")).toBe(90);
    // Самопочинка: оплаченную бронь — выдать (выдача сама проверяет оплату).
    await fakeOrder.grantOrder({ id: "ko_1" });
    expect(granted()).toHaveLength(1);
  });

  it("запоздавшая оплата после снятия брони — отказ, деньги не списаны", async () => {
    db.payTimeout = true;
    await expect(buy()).rejects.toThrow("MCP timeout");
    // Самопочинка сняла неоплаченную бронь, и только потом доехала оплата.
    await fakeOrder.releaseOrder("ko_1");
    await expect(db.inflight!()).rejects.toThrow("kit_released");
    expect(bal("acc_A", "USDT")).toBe(100);
    expect(db.spent.size).toBe(0);
    expect(db.kit.sold).toBe(0);
  });
});

describe("ключ нажатия и валюта", () => {
  it("с «:» или другими знаками, чужая валюта, негодный бокс — отказ до брони и денег", async () => {
    // Проверка входа бросает синхронно — оборачиваем, чтобы ловить и отказ промиса.
    const attempt = (over: Record<string, unknown>) => (async () => buy(over))();
    await expect(attempt({ opId: "op_1234:give" })).rejects.toThrow();
    await expect(attempt({ kitId: "kit_1:x" })).rejects.toThrow();
    await expect(attempt({ token: "TON" })).rejects.toThrow();
    await expect(attempt({ boxId: "cp_x:y" })).rejects.toThrow();
    await expect(attempt({ boxCount: 0 })).rejects.toThrow();
    expect(db.orders.size).toBe(0);
    expect(db.spent.size).toBe(0);
  });
});

describe("отказы оплаты → ключи словаря", () => {
  it("«не хватает», «уже был возврат», «бронь снята»; прочее — как есть", () => {
    expect(payError(new Error("ERROR: not_enough_currency:Darai:12:5000000")).message).toBe(
      'kits.err_money|{"token":"DARAI","need":"5000000","have":"12"}',
    );
    expect(payError(new Error("not_enough_currency:STARS:10:847")).message).toBe(
      'kits.err_money|{"token":"STARS","need":"847","have":"10"}',
    );
    expect(payError(new Error("ref_refunded:kit:acc_A:kit_1:op_1")).message).toBe("kits.err_retry");
    expect(payError(new Error("kit_released")).message).toBe("kits.err_retry");
    expect(payError(new Error("MCP timeout")).message).toBe("MCP timeout");
  });
});
