// Оплата клейма дропа золотом (§8.61): цена дропа в билетах × 500, вид
// drop_claim; ключ уже проведён — «не оплачено»; возврат — drop_claim_undo тем
// же ключом; бюджет — сколько клеймов покрывает золото, нехватка — словами.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  ev: [] as string[],
  gold: 0,
  applied: true,
  acc: "acc1" as string | null,
}));

vi.mock("../db/pg", () => ({
  sb: {
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      st.ev.push(`${a.p_kind}:${a.p_resource}:${a.p_delta}:${a.p_ref}`);
      return { data: [{ amount: 0, applied: st.applied }], error: null };
    },
  },
}));
vi.mock("../db/mcpClient", () => ({ mcpExec: async () => [{ amount: st.gold }] }));
vi.mock("./currency/move", () => ({ accAccountId: async () => st.acc }));

const { debitClaim, refundClaim, claimBudget } = await import("./claim-ticket-debit");

beforeEach(() => {
  Object.assign(st, { ev: [], gold: 0, applied: true, acc: "acc1" });
});

describe("debitClaim / refundClaim", () => {
  it("цена 2 билета — списывает 1000 золота видом drop_claim", async () => {
    expect(await debitClaim({ wallet: "w", cost: 2, ref: "redeem:r1" })).toBe(true);
    expect(st.ev).toEqual(["drop_claim:gold:-1000:redeem:r1"]);
  });

  it("бесплатный клейм (0) — ничего не двигает", async () => {
    expect(await debitClaim({ wallet: "w", cost: 0, ref: "redeem:r1" })).toBe(true);
    expect(st.ev).toEqual([]);
  });

  it("ключ уже проведён — false: выдавать нечего", async () => {
    st.applied = false;
    expect(await debitClaim({ wallet: "w", cost: 1, ref: "redeem:r1" })).toBe(false);
  });

  it("нет аккаунта — false, золото не трогаем", async () => {
    st.acc = null;
    expect(await debitClaim({ wallet: "w", cost: 1, ref: "redeem:r1" })).toBe(false);
    expect(st.ev).toEqual([]);
  });

  it("возврат — тем же золотом и ключом, вид drop_claim_undo", async () => {
    await refundClaim({ wallet: "w", cost: 1, ref: "combo:r2" });
    expect(st.ev).toEqual(["drop_claim_undo:gold:500:combo:r2"]);
  });
});

describe("claimBudget", () => {
  it("сколько клеймов покрывает золото", async () => {
    st.gold = 1600;
    expect(await claimBudget("w", 1)).toBe(3);
  });

  it("не хватает на один — «Не хватает золота: нужно N, у тебя M»", async () => {
    st.gold = 499.5;
    await expect(claimBudget("w", 1)).rejects.toThrow("Не хватает золота: нужно 500, у тебя 499");
  });

  it("бесплатный — без ограничения", async () => {
    expect(await claimBudget("w", 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
