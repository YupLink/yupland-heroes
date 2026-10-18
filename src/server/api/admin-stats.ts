import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";

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

/**
 * Кто и сколько раз заклеймил конкретный drop.
 */
export const getDropClaimers = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ dropId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const camp = await pg.campaigns.findOne({ id: data.dropId });
    const campToken = camp?.reward_token ?? "";
    const allReds = (
      await pg.redemptions
        .raw()
        .select("wallet,amount,redeemed_at,ticket_cost,reward_token")
        .eq("campaign_id", data.dropId)
        .or("ticket_cost.gt.0,amount.gt.0")
    ).data as Array<{
      wallet: string;
      amount: number;
      redeemed_at: string;
      ticket_cost: number;
      reward_token: string | null;
    }> | null;
    type Stat = {
      count: number;
      sum: number;
      firstAt: string;
      lastAt: string;
      byToken: Map<string, number>;
    };
    const map = new Map<string, Stat>();
    for (const r of allReds ?? []) {
      const cur = map.get(r.wallet) ?? {
        count: 0,
        sum: 0,
        firstAt: r.redeemed_at,
        lastAt: r.redeemed_at,
        byToken: new Map<string, number>(),
      };
      cur.count++;
      cur.sum += r.amount ?? 0;
      if ((r.amount ?? 0) > 0) {
        const k = r.reward_token || campToken;
        cur.byToken.set(k, (cur.byToken.get(k) ?? 0) + r.amount);
      }
      if (r.redeemed_at < cur.firstAt) cur.firstAt = r.redeemed_at;
      if (r.redeemed_at > cur.lastAt) cur.lastAt = r.redeemed_at;
      map.set(r.wallet, cur);
    }
    const { data: packGrants } = await pg.userPackInventory
      .raw()
      .select("wallet,obtained_at")
      .eq("source_ref", data.dropId)
      .eq("source", "drop");
    for (const g of (packGrants ?? []) as Array<{
      wallet: string;
      obtained_at: string;
    }>) {
      const cur = map.get(g.wallet) ?? {
        count: 0,
        sum: 0,
        firstAt: g.obtained_at,
        lastAt: g.obtained_at,
        byToken: new Map<string, number>(),
      };
      cur.count++;
      if (g.obtained_at < cur.firstAt) cur.firstAt = g.obtained_at;
      if (g.obtained_at > cur.lastAt) cur.lastAt = g.obtained_at;
      map.set(g.wallet, cur);
    }
    const rows = Array.from(map.entries())
      .map(([wallet, s]) => ({ wallet, ...s }))
      .sort((a, b) => b.count - a.count);
    return rows.map((r) => ({
      wallet: r.wallet,
      claimsCount: r.count,
      totalAmount: r.sum,
      byToken: Array.from(r.byToken.entries())
        .map(([token, amount]) => ({ token, amount }))
        .sort((a, b) => b.amount - a.amount),
      firstAt: r.firstAt,
      lastAt: r.lastAt,
    }));
  });

export const getTicketEventClaimers = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ eventId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const allClaims = await pg.ticketClaims.findMany({
      event_id: data.eventId,
    });
    type Stat = {
      count: number;
      sum: number;
      firstAt: string;
      lastAt: string;
    };
    const map = new Map<string, Stat>();
    for (const c of allClaims) {
      const cur = map.get(c.wallet) ?? {
        count: 0,
        sum: 0,
        firstAt: c.claimed_at,
        lastAt: c.claimed_at,
      };
      cur.count++;
      cur.sum += c.tickets_awarded ?? 0;
      if (c.claimed_at < cur.firstAt) cur.firstAt = c.claimed_at;
      if (c.claimed_at > cur.lastAt) cur.lastAt = c.claimed_at;
      map.set(c.wallet, cur);
    }
    const rows = Array.from(map.entries())
      .map(([wallet, s]) => ({ wallet, ...s }))
      .sort((a, b) => b.count - a.count);
    return rows.map((r) => ({
      wallet: r.wallet,
      claimsCount: r.count,
      ticketsTotal: r.sum,
      firstAt: r.firstAt,
      lastAt: r.lastAt,
    }));
  });
