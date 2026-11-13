// Долг за дыру грядки (§8.129): Казна видит долг, «Отдать» — через debt_pay, вывод
// должнику закрыт своим текстом. SQL самой механики (res_move, debt_pay,
// withdraw_unlisted) проверен на проде в транзакции с откатом 13.11.2026.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  debts: new Map<string, { total: number; paid: number }>(),
  listed: new Set<string>(),
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as string | null,
  wallet: "crazy.tg" as string | null,
}));

type Fn = (a: { data: unknown }) => unknown;
vi.mock("@tanstack/react-start", () => {
  const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
    fn({ data: v ? v(a?.data) : a?.data });
  return {
    createServerFn: () => ({
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    }),
  };
});
vi.mock("../../auth", () => ({
  getCurrentWallet: () => st.wallet,
  requireWallet: () => {
    if (!st.wallet) throw new Error("auth");
    return st.wallet;
  },
}));
vi.mock("../../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("../currency/move", () => ({ accAccountId: async (w: string) => `acc_${w}` }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const acc = /'(acc_[^']+)'/.exec(sql)?.[1] ?? "";
    if (/withdraw_unlisted/.test(sql)) return [{ ok: st.listed.has(acc) && !st.debts.has(acc) }];
    if (/FROM yuplink\.account_debt/.test(sql)) {
      const d = st.debts.get(acc);
      return d && d.paid < d.total ? [d] : [];
    }
    return [];
  },
}));
vi.mock("../../db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      st.rpc.push({ fn, args });
      if (st.rpcError) return { error: { message: st.rpcError }, data: null };
      return { error: null, data: [{ taken: args.p_amount, debt_left: 900 }] };
    },
  },
}));

const debt = await import("./debt");
const wl = await import("../withdraw-list/withdrawList");

beforeEach(() => {
  st.debts = new Map([["acc_crazy.tg", { total: 1000, paid: 0 }]]);
  st.listed = new Set(["acc_crazy.tg", "acc_honest.tg"]);
  st.rpc = [];
  st.rpcError = null;
  st.wallet = "crazy.tg";
  for (const a of ["acc_crazy.tg", "acc_honest.tg", "acc_new.tg"]) wl.forgetWithdrawListed(a);
});

describe("долг в Казне", () => {
  it("должник видит остаток; у честного — блока нет", async () => {
    await expect(debt.getMyDebt()).resolves.toEqual({ total: 1000, paid: 0, left: 1000 });
    st.wallet = "honest.tg";
    await expect(debt.getMyDebt()).resolves.toBeNull();
    st.wallet = null;
    await expect(debt.getMyDebt()).resolves.toBeNull();
  });

  it("«Отдать»: debt_pay со своим ключом нажатия, ответ — взято и осталось", async () => {
    const r = await debt.payDebt({ data: { amount: 100, op: "op_abcdefgh" } });
    expect(r).toEqual({ taken: 100, left: 900 });
    expect(st.rpc[0]).toEqual({
      fn: "debt_pay",
      args: { p_account: "acc_crazy.tg", p_amount: 100, p_ref: "acc_crazy.tg:op_abcdefgh" },
    });
  });

  it("золота не хватает — понятный отказ; сотые проходят, тысячные и ноль — нет", async () => {
    st.rpcError = "res_move: в минус";
    await expect(debt.payDebt({ data: { amount: 100, op: "op_abcdefgh" } })).rejects.toThrow(
      "debt.notEnoughGold",
    );
    const call = (amount: number) =>
      Promise.resolve().then(() => debt.payDebt({ data: { amount, op: "op_abcdefgh" } }));
    await expect(call(0.001)).rejects.toThrow();
    st.rpcError = null;
    await expect(call(0.5)).resolves.toEqual({ taken: 0.5, left: 900 });
    await expect(call(0)).rejects.toThrow();
  });
});

describe("вывод должнику", () => {
  it("закрыт своим текстом; честному — открыт; новому — прежний отказ списка", async () => {
    await expect(wl.assertWithdrawListed("crazy.tg")).rejects.toThrow("debt.withdrawClosed");
    await expect(wl.assertWithdrawListed("honest.tg")).resolves.toBeUndefined();
    await expect(wl.assertWithdrawListed("new.tg")).rejects.toThrow("withdraw.notListed");
  });

  it("долг отдан — вывод снова открыт", async () => {
    st.debts.set("acc_crazy.tg", { total: 1000, paid: 1000 });
    st.debts.delete("acc_crazy.tg");
    await expect(wl.assertWithdrawListed("crazy.tg")).resolves.toBeUndefined();
  });
});
