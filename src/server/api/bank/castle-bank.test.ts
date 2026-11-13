// Банк у всех построен (21.10.2026); строившему раньше — возврат ресурсов по «ОК»:
// окно знает сумму, «ОК» зовёт функцию базы, второй раз возвращать нечего.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  cost: { wood: 1500, stone: 300, gold: 7500, diamonds: 50 } as Record<string, number> | null,
  rpc: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => () => fn() }),
}));
vi.mock("../../auth", () => ({ requireWallet: () => "p.near" }));
vi.mock("../beta-raid/owner", () => ({ raidOwner: async () => "acc_P" }));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${v}'` }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) =>
    /refunded_at IS NULL/.test(sql) && /'acc_P'/.test(sql) && st.cost ? [{ cost: st.cost }] : [],
}));
vi.mock("../../db/pg", () => ({
  sb: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      st.rpc.push({ name, args });
      const data = st.cost;
      st.cost = null; // вернули — больше нечего
      return { error: null, data };
    },
  },
}));

const { getCastleBank, claimBankRefund } = await import("./castle-bank");

beforeEach(() => {
  st.cost = { wood: 1500, stone: 300, gold: 7500, diamonds: 50 };
  st.rpc = [];
});

describe("банк у всех и возврат строившим", () => {
  it("банк построен у всех; строившему окно знает, сколько вернуть", async () => {
    await expect(getCastleBank()).resolves.toEqual({
      built: true,
      refund: { wood: 1500, stone: 300, gold: 7500, diamonds: 50 },
    });
  });

  it("«ОК» — возврат функцией базы по его аккаунту; потом окна нет", async () => {
    await expect(claimBankRefund()).resolves.toEqual({
      refunded: { wood: 1500, stone: 300, gold: 7500, diamonds: 50 },
    });
    expect(st.rpc).toEqual([{ name: "castle_bank_refund", args: { p_account: "acc_P" } }]);
    await expect(getCastleBank()).resolves.toEqual({ built: true, refund: null });
    await expect(claimBankRefund()).resolves.toEqual({ refunded: null });
  });

  it("не строил — окна нет", async () => {
    st.cost = null;
    await expect(getCastleBank()).resolves.toEqual({ built: true, refund: null });
  });
});
