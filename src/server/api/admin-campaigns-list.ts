import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireAdmin } from "../auth";
import { PgCampaign } from "../db/pg";
import { SENDLER_DEFAULT_CONTRACT } from "./admin-helpers";

export const listDropEvents = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const rows =
      ((
        await pg.campaigns
          .raw()
          .select("*")
          .neq("status", "ended")
          .order("created_at", { ascending: false })
      ).data as PgCampaign[]) ?? [];

    type Stat = {
      count: number;
      sum: number;
      uniqueWallets: number;
      byToken: Map<string, number>;
    };
    const statsMap = new Map<string, Stat>();
    const ensureStat = (cid: string): Stat => {
      let s = statsMap.get(cid);
      if (!s) {
        s = { count: 0, sum: 0, uniqueWallets: 0, byToken: new Map() };
        statsMap.set(cid, s);
      }
      return s;
    };
    const [redAgg, tokAgg, packAgg, uniqAgg] = await Promise.all([
      mcpExec(
        `SELECT campaign_id, count(*)::int AS cnt, COALESCE(sum(amount),0)::float8 AS s
           FROM yuplink.redemptions
          WHERE ticket_cost > 0 AND campaign_id IS NOT NULL
          GROUP BY campaign_id;`,
        { wrapJson: true }
      ) as Promise<Array<{ campaign_id: string; cnt: number; s: number }>>,
      mcpExec(
        `SELECT campaign_id, reward_token, COALESCE(sum(amount),0)::float8 AS s
           FROM yuplink.redemptions
          WHERE ticket_cost > 0 AND amount > 0 AND campaign_id IS NOT NULL
          GROUP BY campaign_id, reward_token;`,
        { wrapJson: true }
      ) as Promise<
        Array<{ campaign_id: string; reward_token: string | null; s: number }>
      >,
      mcpExec(
        `SELECT source_ref AS campaign_id, count(*)::int AS cnt
           FROM yuplink.user_pack_inventory
          WHERE source = 'drop' AND source_ref IS NOT NULL
          GROUP BY source_ref;`,
        { wrapJson: true }
      ) as Promise<Array<{ campaign_id: string; cnt: number }>>,
      mcpExec(
        `SELECT campaign_id, count(DISTINCT wallet)::int AS uniq FROM (
           SELECT campaign_id, wallet FROM yuplink.redemptions
            WHERE ticket_cost > 0 AND campaign_id IS NOT NULL
           UNION
           SELECT source_ref AS campaign_id, wallet FROM yuplink.user_pack_inventory
            WHERE source = 'drop' AND source_ref IS NOT NULL
         ) u GROUP BY campaign_id;`,
        { wrapJson: true }
      ) as Promise<Array<{ campaign_id: string; uniq: number }>>,
    ]);
    for (const r of redAgg) {
      const s = ensureStat(r.campaign_id);
      s.count += Number(r.cnt);
      s.sum += Number(r.s);
    }
    for (const r of tokAgg) {
      const s = ensureStat(r.campaign_id);
      const k = r.reward_token ?? "";
      s.byToken.set(k, (s.byToken.get(k) ?? 0) + Number(r.s));
    }
    for (const r of packAgg) {
      ensureStat(r.campaign_id).count += Number(r.cnt);
    }
    for (const r of uniqAgg) {
      ensureStat(r.campaign_id).uniqueWallets = Number(r.uniq);
    }

    return rows.map((c) => {
      const tokenIds = c.scope_token_ids
        ? c.scope_token_ids.split(",").filter(Boolean).length
        : 0;
      const s = statsMap.get(c.id);
      const paidOut = s?.sum ?? 0;
      const claimers = s?.uniqueWallets ?? 0;

      const tokMap = new Map<string, number>();
      for (const [tok, amt] of s?.byToken ?? []) {
        const key = tok || c.reward_token;
        tokMap.set(key, (tokMap.get(key) ?? 0) + amt);
      }
      const payoutByToken = Array.from(tokMap.entries())
        .map(([token, amount]) => ({ token, amount }))
        .sort((a, b) => b.amount - a.amount);

      let parsedReqs: Array<{ title: string; count: number }> | null = null;
      if (c.mode === "combo" && c.requirements) {
        try {
          parsedReqs = JSON.parse(c.requirements);
        } catch {
          parsedReqs = null;
        }
      }
      let parsedTiers: Array<{
        weight: number;
        kind?: "ft" | "nft";
        rewardMin: number;
        rewardMax: number;
        rewardToken: string;
        nftTitle?: string;
        nftContract?: string;
      }> | null = null;
      if (c.reward_tiers) {
        try {
          parsedTiers = JSON.parse(c.reward_tiers);
        } catch {
          parsedTiers = null;
        }
      }

      let maxRemaining: number | null = null;
      if (c.max_total_pool != null) {
        maxRemaining = Math.max(0, c.max_total_pool - paidOut);
      } else if (c.max_users != null) {
        maxRemaining = Math.max(0, (c.max_users - claimers) * c.reward_max);
      }

      return {
        id: c.id,
        title: c.name,
        contractId: c.contract_id,
        rewardMin: c.reward_min,
        rewardMax: c.reward_max,
        rewardToken: c.reward_token,
        rewardKind: c.reward_min === c.reward_max ? "fixed" : "random",
        maxTotalPool: c.max_total_pool,
        maxUsers: c.max_users,
        freeClaim: c.free_claim,
        ticketCost: c.ticket_cost,
        totalNfts: tokenIds,
        claimsCount: s?.count ?? 0,
        totalPaidOut: paidOut,
        payoutByToken,
        uniqueClaimers: claimers,
        status: c.status,
        createdAt: c.created_at,
        maxRemaining,
        rewardKindIsRange: c.reward_min !== c.reward_max,
        mode: c.mode,
        recurring: !!c.recurring,
        requirements: parsedReqs,
        rewardTiers: parsedTiers,
      };
    });
  }
);

/**
 * Список активных кампаний/комбо для UI-фильтра.
 */
export const listAdminCampaignNames = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    const rows = await pg.campaigns.findMany({ status: "active" });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode ?? "simple",
    }));
  }
);
