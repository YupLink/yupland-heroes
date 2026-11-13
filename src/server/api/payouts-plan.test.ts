// «Раздача DARAI»: 12,5 % партнёру и владельцу — кошельки из env; не заданы —
// превью показывает пусто, а список перевода не собирается.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DaraiPools } from "./darai-pools";

vi.mock("./payouts-legendary", () => ({
  LEGENDARY_NFT_NAME: "legendary",
  LEGENDARY_NFT_CONTRACT: "nft.near",
  SYSTEM_WALLETS_EXCLUDED_FROM_HOLDERS: new Set<string>(),
  fetchLegendaryHolders: async () => ({
    source: "sendler",
    totalFound: 2,
    holders: [{ wallet: "h1.near", qty: 2 }],
  }),
}));

const { distributionItems, distributionPreview } = await import("./payouts-plan");
const pools = { walletBalance: 1000, payoutAvailable: 800 } as DaraiPools;

afterEach(() => vi.unstubAllEnvs());

describe("раздача DARAI: доли команды", () => {
  it("кошельки и теги — из env, по 12,5 %", async () => {
    vi.stubEnv("TEAM_OWNER_WALLET", "owner.tg");
    vi.stubEnv("TEAM_PARTNER_WALLET", "partner.tg");
    const p = await distributionPreview(pools, 800);
    expect(p.partner).toMatchObject({ title: "partner", wallet: "partner.tg", amountHuman: 100 });
    expect(p.owner).toMatchObject({ title: "owner", wallet: "owner.tg", amountHuman: 100 });
    expect(distributionItems(p).slice(0, 3)).toEqual([
      { recipient: "darai_duplo.near", amountHuman: 400, tag: "duplo 50%" },
      { recipient: "partner.tg", amountHuman: 100, tag: "partner 12.5%" },
      { recipient: "owner.tg", amountHuman: 100, tag: "owner 12.5%" },
    ]);
  });

  it("кошелёк команды не задан — перевод не собирается", async () => {
    vi.stubEnv("TEAM_OWNER_WALLET", "");
    vi.stubEnv("TEAM_PARTNER_WALLET", "partner.tg");
    const p = await distributionPreview(pools, 800);
    expect(p.owner.wallet).toBe("");
    expect(() => distributionItems(p)).toThrow("TEAM_OWNER_WALLET не задан");
  });
});
