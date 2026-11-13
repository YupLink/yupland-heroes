// Награда дропа «Товар»: погашение → золото → подарок (не сгорает, без письма);
// подарок не лёг — погашение снято, золото вернули; не хватило золота — подарка нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  insert: vi.fn(async () => undefined),
  del: vi.fn(async () => undefined),
  mcp: vi.fn(async () => [{ name: "Факел", image: "https://x/torch.webp" }]),
  debit: vi.fn(async () => true),
  refund: vi.fn(async () => undefined),
  gift: vi.fn(async () => true),
}));
vi.mock("../db/pg", () => ({ pg: { redemptions: { insert: m.insert, delete: m.del } } }));
vi.mock("../db/mcpClient", () => ({ mcpExec: m.mcp }));
vi.mock("./claim-ticket-debit", () => ({ debitClaim: m.debit, refundClaim: m.refund }));
vi.mock("./gifts-create", () => ({ createGift: m.gift }));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_1" }));

const { creditDropGoods } = await import("./user-claims-goods");
const tier = {
  weight: 100,
  kind: "custom" as const,
  rewardMin: 1,
  rewardMax: 3,
  rewardToken: "custom",
  itemId: "cst_torch",
};
const run = (over: Partial<Parameters<typeof creditDropGoods>[0]> = {}) =>
  creditDropGoods({
    wallet: "w.near",
    campaign: { id: "c1", contract_id: "nft.near" },
    tokenId: "7",
    tier,
    amount: 2.4,
    ticketCost: 1,
    ...over,
  });

beforeEach(() => vi.clearAllMocks());

describe("creditDropGoods", () => {
  it("погашение с reward_token 'custom', золото, подарок без срока и без письма", async () => {
    await expect(run()).resolves.toEqual({ qty: 2, name: "Факел" });
    expect(m.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reward_token: "custom", status: "paid", amount: 2, token_id: "7" }),
    );
    const ref = (m.debit.mock.calls[0] as unknown as [{ ref: string }])[0].ref;
    expect(ref).toMatch(/^goodsdrop:/);
    expect(m.gift).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc_1",
        kind: "custom",
        amount: 2,
        refId: "cst_torch",
        sourceRef: ref,
        expiresNever: true,
      }),
      { notify: false },
    );
    expect(m.refund).not.toHaveBeenCalled();
  });

  it("подарок не лёг — погашение снято, золото вернули", async () => {
    m.gift.mockResolvedValueOnce(false);
    await expect(run()).rejects.toThrow("Не удалось выдать товар");
    expect(m.del).toHaveBeenCalled();
    expect(m.refund).toHaveBeenCalled();
  });

  it("не хватило золота — без подарка, погашение снято", async () => {
    m.debit.mockResolvedValueOnce(false);
    await expect(run()).rejects.toThrow("Не хватает золота");
    expect(m.gift).not.toHaveBeenCalled();
    expect(m.del).toHaveBeenCalled();
  });

  it("товара нет в справочнике или не cst_ — ничего не пишем", async () => {
    m.mcp.mockResolvedValueOnce([]);
    await expect(run()).rejects.toThrow("не найден");
    await expect(run({ tier: { ...tier, itemId: "pk_1" } })).rejects.toThrow("не задан");
    expect(m.insert).not.toHaveBeenCalled();
  });
});
