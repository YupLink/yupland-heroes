// Пак фишек за игровую цену (§8.61): золото ×500 списывает сама
// buy_chip_pack_atomic (ветка 'gold'); старый клиент шлёт 'tickets' — это тоже
// золото; нехватка — словами до первой покупки и из ответа базы.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ ev: [] as string[], gold: 10_000, rpcErr: null as string | null }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({
  pg: {
    chipPacks: { findOne: async () => ({ id: "cp1", price_tickets: 3, market_hidden: false }) },
  },
  sb: {
    rpc: async (fn: string, a: Record<string, unknown>) => {
      st.ev.push(`${fn}:${a.p_pay_with}`);
      if (st.rpcErr) return { data: null, error: { message: st.rpcErr } };
      return { data: [{ grant_id: `g${st.ev.length}`, gold_spent: 1500 }], error: null };
    },
  },
}));
vi.mock("./chips-mint-helpers", () => ({ requireWallet: () => "w1", DARAI_FT_CONTRACT: "d" }));
vi.mock("../buildGate", () => ({ requireFreshClient: () => {} }));
vi.mock("./chips-utils", () => ({ DARAI_DECIMALS: 18, DARAI_DEPOSIT_RECEIVER: "r" }));
vi.mock("./chips-pack-darai", () => ({ settleDaraiPackByTx: vi.fn() }));
vi.mock("./account-rollout", () => ({ assertWalletPurchaseAllowed: vi.fn() }));
vi.mock("./currency/move", () => ({ accAccountId: async () => "acc1" }));
vi.mock("./gold-move", () => ({ goldOf: async () => st.gold }));
vi.mock("../referralQualify", () => ({ noteReferralPurchase: async () => {} }));

const { buyChipPack } = await import("./chips-pack-buy");
const buy = buyChipPack as unknown as (a: {
  data: { packId: string; payWith: string; count: number };
}) => Promise<{ bought: number; goldSpent: number }>;

beforeEach(() => Object.assign(st, { ev: [], gold: 10_000, rpcErr: null }));

describe("пак фишек за золото", () => {
  it("2 пака по 3 билета — ветка gold, 3000 золота", async () => {
    expect(await buy({ data: { packId: "cp1", payWith: "gold", count: 2 } })).toMatchObject({
      bought: 2,
      goldSpent: 3000,
    });
    expect(st.ev).toEqual(["buy_chip_pack_atomic:gold", "buy_chip_pack_atomic:gold"]);
  });

  it("старый клиент шлёт tickets — отказ «обнови страницу», золото не трогается", async () => {
    await expect(
      buy({ data: { packId: "cp1", payWith: "tickets", count: 1 } }),
    ).rejects.toThrow("Обнови страницу — цены теперь в золоте");
    expect(st.ev).toEqual([]);
  });

  it("не хватает на все паки — отказ до первой покупки", async () => {
    st.gold = 2999;
    await expect(buy({ data: { packId: "cp1", payWith: "gold", count: 2 } })).rejects.toThrow(
      "Не хватает золота: нужно 3000, у тебя 2999",
    );
    expect(st.ev).toEqual([]);
  });

  it("отказ базы not_enough_gold — словами", async () => {
    st.rpcErr = "not_enough_gold:10:1500";
    await expect(buy({ data: { packId: "cp1", payWith: "gold", count: 1 } })).rejects.toThrow(
      "Не хватает золота: нужно 1500, у тебя 10",
    );
  });
});
