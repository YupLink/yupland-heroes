// Банк замка: с 21.10.2026 у всех построен сразу — обмен, вклад и лицензия доходят
// до базы без проверки постройки. Инструменты пулов остаются только админу; отмена
// своего вывода холдеров — игроку. Снятие вклада несёт подтверждённое золото в базу.
// База, счёт и вход подменены памятью.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { licensePrice, licenseTier } from "@/lib/bankLicense";

const st = vi.hoisted(() => ({
  admin: false,
  built: false,
  acc: "acc_P" as string | null,
  sql: [] as string[],
  rpc: [] as string[],
  args: [] as Array<Record<string, unknown>>,
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
vi.mock("../../auth", () => ({
  isAdminWallet: () => st.admin,
  isAdminWalletLinked: async () => st.admin,
  requireWallet: () => "p.near",
  requireAdmin: () => {
    if (!st.admin) throw new Error("Доступ запрещён: требуется admin-кошелёк");
    return "p.near";
  },
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sql.push(sql);
    return /yuplink\.castle_bank/.test(sql) ? [{ built: st.built }] : [];
  },
}));
vi.mock("../../db/pg", () => ({
  pg: {},
  sb: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      st.rpc.push(name);
      st.args.push(args);
      return {
        error: null,
        data: [{ amount_out: 5, applied: true, stake_id: "stk_1", ends_at: "2026-11-19" }],
      };
    },
  },
}));
vi.mock("../currency/move", () => ({
  accAccountId: async () => st.acc,
  accBalance: async () => 0,
  humanizeAccError: (s: string) => s,
}));
vi.mock("./license-money", () => ({
  runBuyback: async () => {},
  bookLicenseMoney: async () => {},
}));

const { bankAccount, bankBuiltFor } = await import("./bank-access");
const { swapBank, fundBankPool } = await import("./bank-swap");
const { openBankStake, closeBankStake, cancelHolderWithdraw } = await import("./bank-stake");
const { buyBankLicense } = await import("./bank-license");
const { listBankPools, createBankPool, deleteBankPool } = await import("./bank-pools");

const op = "op-12345678";
const swap = () =>
  swapBank({ data: { poolId: "bp_1", tokenIn: "wood", amount: 10, minOut: 0, opId: op } });
const stake = () => openBankStake({ data: { amount: 100, plan: "free", opId: op } });
/** Цена с экрана — та, что в правилах лицензии (не совпала — сервер откажет раньше гейта денег). */
const shown = licensePrice(licenseTier("small")!, "Darai")!;
const license = () =>
  buyBankLicense({ data: { tier: "small", currency: "Darai", expectPrice: shown, opId: op } });

beforeEach(() => {
  st.admin = false;
  st.built = false;
  st.acc = "acc_P";
  st.sql = [];
  st.rpc = [];
  st.args = [];
});

describe("банк у всех (21.10.2026)", () => {
  it("постройку не спрашиваем: банк есть у любого аккаунта", async () => {
    await expect(bankBuiltFor("acc_P")).resolves.toBe(true);
    await expect(bankAccount("p.near")).resolves.toBe("acc_P");
    expect(st.sql.some((q) => /castle_bank/.test(q))).toBe(false);
  });

  it("нет счёта аккаунта — отказ", async () => {
    st.acc = null;
    await expect(bankAccount("p.near")).rejects.toThrow("Не найден счёт аккаунта");
  });
});

describe("ручки банка для игроков", () => {
  it("игрок без постройки: обмен, вклад и лицензия доходят до функций базы", async () => {
    await expect(swap()).resolves.toEqual({ out: 5, applied: true });
    await expect(stake()).resolves.toMatchObject({ applied: true });
    await expect(license()).resolves.toMatchObject({ applied: true });
    expect(st.rpc).toEqual(["bank_swap_run", "bank_stake_open", "bank_license_purchase"]);
  });

  it("инструменты пулов — только админу", async () => {
    st.built = true;
    const admin = /admin-кошелёк/;
    await expect(fundBankPool({ data: { poolId: "bp_1", amountA: 1, opId: op } })).rejects.toThrow(
      admin,
    );
    await expect(
      createBankPool({
        data: { tokenA: "gold", tokenB: "Darai", weightA: 1, weightB: 200, feePct: 10 },
      }),
    ).rejects.toThrow(admin);
    await expect(deleteBankPool({ data: { id: "bp_1" } })).rejects.toThrow(admin);
    expect(st.rpc).toHaveLength(0);
  });

  it("отмена своего вывода холдеров — игроку, база отменяет только по его аккаунту", async () => {
    await cancelHolderWithdraw({ data: { holdId: "hw_1" } });
    expect(st.rpc).toEqual(["holder_withdraw_cancel"]);
    expect(st.args[0]).toEqual({ p_id: "hw_1", p_account: "acc_P" });
  });

  it("снятие вклада: показанное золото уходит в базу пределом; старое окно без суммы — 0", async () => {
    st.built = true;
    await closeBankStake({ data: { stakeId: "stk_1", confirmGold: 12.5 } });
    await closeBankStake({ data: { stakeId: "stk_1" } });
    expect(st.rpc).toEqual(["bank_stake_close", "bank_stake_close"]);
    expect(st.args[0]).toMatchObject({ p_stake: "stk_1", p_account: "acc_P", p_max_gold: 12.5 });
    expect(st.args[1]).toMatchObject({ p_max_gold: 0 });
  });
});

describe("ошибки снятия вклада", () => {
  it("сумма выросла после окна — «открой заново»; не хватает золота — «нужно N»", async () => {
    const { humanStakeError, STAKE_GOLD_CHANGED } = await import("./bank-stake");
    expect(humanStakeError("bank_stake_gold_changed:12.5")).toBe(STAKE_GOLD_CHANGED);
    expect(STAKE_GOLD_CHANGED).toBe("Сумма изменилась — открой окно заново");
    expect(humanStakeError("bank_stake_gold:1500")).toBe("Не хватает золота: нужно 1\u00a0500");
  });
});
