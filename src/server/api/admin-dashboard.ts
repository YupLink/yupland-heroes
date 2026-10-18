import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";

export const getDashboard = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();

    const allRed = await pg.redemptions.findMany();
    const totalRedemptions = allRed.length;
    const totalGD = allRed.reduce((s, r) => s + (r.amount ?? 0), 0);

    const campaignRows = await pg.campaigns.findMany();
    const activeCampaigns = campaignRows.filter(
      (c) => c.status === "active"
    ).length;

    const recent = await pg.redemptions.findMany(undefined, {
      orderBy: { column: "redeemed_at", ascending: false },
      limit: 5,
    });

    const allSettings = await pg.settings.findMany();
    const map = new Map(allSettings.map((s) => [s.key, s.value]));
    const treasury = Number(map.get("treasury.balance") ?? 0);
    const lowThreshold = Number(map.get("treasury.lowThreshold") ?? 0);

    const campaignNameById = new Map(campaignRows.map((c) => [c.id, c.name]));

    return {
      kpis: {
        totalRedemptions,
        totalGD,
        activeCampaigns,
        totalCampaigns: campaignRows.length,
        treasury,
        treasuryLow: treasury < lowThreshold,
      },
      recent: recent.map((r) => ({
        id: r.id,
        nftId: `${r.contract_id} ${r.token_id}`,
        wallet: r.wallet,
        amount: r.amount,
        status: r.status,
        timestamp: r.redeemed_at,
        campaign: r.campaign_id
          ? (campaignNameById.get(r.campaign_id) ?? "")
          : "",
      })),
    };
  }
);
