import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";

/**
 * АУДИТ клеймов и билетов — health-check на 3 типа аномалий:
 * 1. Overdrop: дропы где NFT-призов роздано больше чем оплачено билетов
 * 2. Lost claims: paid клики где amount=0 И nft_redemption нет
 * 3. Duplicate claims: одна и та же (campaign, contract, token) встречается более одного раза
 */
export const auditTicketsAndRewards = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();

    // 1. Overdrop per drop — сколько роздано NFT vs сколько оплачено
    const { data: paidPerDrop } = await pg.redemptions
      .raw()
      .select("campaign_id,ticket_cost")
      .gt("ticket_cost", 0);
    const paidMap = new Map<string, number>();
    for (const r of (paidPerDrop ?? []) as Array<{
      campaign_id: string | null;
    }>) {
      if (!r.campaign_id) continue;
      paidMap.set(r.campaign_id, (paidMap.get(r.campaign_id) ?? 0) + 1);
    }
    const { data: nftPerDrop } = await pg.nftRedemptions
      .raw()
      .select("campaign_id");
    const nftMap = new Map<string, number>();
    for (const r of (nftPerDrop ?? []) as Array<{
      campaign_id: string | null;
    }>) {
      if (!r.campaign_id) continue;
      nftMap.set(r.campaign_id, (nftMap.get(r.campaign_id) ?? 0) + 1);
    }
    const overdrop: Array<{
      cid: string;
      name: string | null;
      status: string | null;
      paid: number;
      given: number;
      extra: number;
    }> = [];
    for (const [cid, given] of nftMap.entries()) {
      const paid = paidMap.get(cid) ?? 0;
      if (given > paid) {
        const c = await pg.campaigns.findOne({ id: cid });
        overdrop.push({
          cid,
          name: c?.name ?? null,
          status: c?.status ?? null,
          paid,
          given,
          extra: given - paid,
        });
      }
    }
    overdrop.sort((a, b) => b.extra - a.extra);

    // 2. Lost claims (paid but no NFT prize)
    const { data: lostRows } = await pg.redemptions
      .raw()
      .select("id,wallet,campaign_id,ticket_cost,redeemed_at,amount")
      .gt("ticket_cost", 0)
      .eq("amount", 0);
    const lost: Array<{
      wallet: string;
      cid: string;
      lost: number;
    }> = [];
    if (lostRows && lostRows.length > 0) {
      const cids = Array.from(
        new Set(
          (lostRows as Array<{ campaign_id: string | null }>)
            .map((r) => r.campaign_id)
            .filter((x): x is string => !!x)
        )
      );
      const campsMode = new Map<string, string>();
      if (cids.length > 0) {
        const { data: cs } = await pg.campaigns
          .raw()
          .select("id,mode")
          .in("id", cids);
        for (const c of (cs ?? []) as Array<{ id: string; mode: string }>) {
          campsMode.set(c.id, c.mode);
        }
      }
      const lostAgg = new Map<string, number>();
      for (const r of lostRows as Array<{
        wallet: string;
        campaign_id: string | null;
      }>) {
        if (!r.campaign_id) continue;
        if (campsMode.get(r.campaign_id) !== "simple") continue;
        const key = `${r.wallet}::${r.campaign_id}`;
        lostAgg.set(key, (lostAgg.get(key) ?? 0) + 1);
      }
      for (const [key, cnt] of lostAgg.entries()) {
        const [wallet, cid] = key.split("::");
        const exists = await pg.nftRedemptions.findFirst({
          user_wallet: wallet,
          campaign_id: cid,
        });
        if (!exists) lost.push({ wallet, cid, lost: cnt });
      }
      lost.sort((a, b) => b.lost - a.lost);
    }

    // 3. Duplicate (campaign, contract, token)
    const dup: Array<{
      cid: string;
      contract: string;
      token_id: string;
      n: number;
    }> = [];
    const { data: allPaid } = await pg.redemptions
      .raw()
      .select("campaign_id,contract_id,token_id")
      .gt("ticket_cost", 0);
    const dupMap = new Map<string, number>();
    for (const r of (allPaid ?? []) as Array<{
      campaign_id: string | null;
      contract_id: string;
      token_id: string;
    }>) {
      if (!r.campaign_id) continue;
      const k = `${r.campaign_id}|${r.contract_id}|${r.token_id}`;
      dupMap.set(k, (dupMap.get(k) ?? 0) + 1);
    }
    for (const [k, n] of dupMap.entries()) {
      if (n > 1) {
        const [cid, contract, tid] = k.split("|");
        dup.push({ cid, contract, token_id: tid, n });
      }
    }

    return {
      overdrop,
      lostClaims: lost,
      duplicates: dup,
      summary: {
        overdrop_total_extra: overdrop.reduce((s, r) => s + r.extra, 0),
        lost_total: lost.reduce((s, r) => s + r.lost, 0),
        duplicates_count: dup.length,
      },
    };
  }
);
