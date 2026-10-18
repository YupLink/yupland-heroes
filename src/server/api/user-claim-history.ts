import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { getSisterWallets } from "./user-claims-core";

export const myClaimHistory = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = getCurrentWallet();
    if (!wallet) return [];
    if (!isAdminWallet(wallet)) return [];
    const sisters = await getSisterWallets(wallet);

    const { data: rows } = await pg.redemptions
      .raw()
      .select(
        "id,wallet,campaign_id,amount,reward_token,ticket_cost,redeemed_at,token_id"
      )
      .in("wallet", sisters)
      .gt("ticket_cost", 0)
      .order("redeemed_at", { ascending: false })
      .limit(50);
    const claims = (rows ?? []) as Array<{
      id: string;
      wallet: string;
      campaign_id: string | null;
      amount: number;
      reward_token: string | null;
      ticket_cost: number;
      redeemed_at: string;
      token_id: string;
    }>;
    if (claims.length === 0) return [];

    const cids = Array.from(
      new Set(claims.map((c) => c.campaign_id).filter((x): x is string => !!x))
    );
    const nameByCid = new Map<string, string>();
    if (cids.length > 0) {
      const { data: cs } = await pg.campaigns
        .raw()
        .select("id,name")
        .in("id", cids);
      for (const c of (cs ?? []) as Array<{ id: string; name: string }>) {
        nameByCid.set(c.id, c.name);
      }
    }
    const { data: nftRows } =
      cids.length > 0
        ? await pg.nftRedemptions
            .raw()
            .select("user_wallet,campaign_id,nft_title,claimed_at")
            .in("user_wallet", sisters)
            .in("campaign_id", cids)
        : { data: [] };
    const nftByKey = new Map<string, string[]>();
    for (const n of (nftRows ?? []) as Array<{
      user_wallet: string;
      campaign_id: string;
      nft_title: string | null;
    }>) {
      const key = `${n.user_wallet}::${n.campaign_id}`;
      const arr = nftByKey.get(key) ?? [];
      if (n.nft_title) arr.push(n.nft_title);
      nftByKey.set(key, arr);
    }

    return claims.map((c) => {
      const nftTitles = c.campaign_id
        ? nftByKey.get(`${c.wallet}::${c.campaign_id}`) ?? []
        : [];
      let kind: "ft" | "nft" | "filler";
      let label: string;
      if (c.amount > 0) {
        kind = "ft";
        label = `+${c.amount} ${c.reward_token ?? ""}`.trim();
      } else if (nftTitles.length > 0) {
        kind = "nft";
        label = `🎁 ${nftTitles[0]}`;
      } else {
        kind = "filler";
        label = "🍀 Молодец (без приза)";
      }
      return {
        id: c.id,
        dropName: c.campaign_id
          ? nameByCid.get(c.campaign_id) ?? c.campaign_id
          : "—",
        ticketCost: c.ticket_cost,
        kind,
        label,
        redeemedAt: c.redeemed_at,
      };
    });
  }
);
