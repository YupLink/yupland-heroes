import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { parseRewardTiers } from "../random";
import { getOwnedByTitle } from "./user-drops-nft-index";
import { maybeScanUserInventory } from "./user-drops-nft-scan";
import { buildChipDropReqs, type DropGroup, type DropItem, type ComboReq } from "./user-drops-nft-types";
import { buildListContext, type ListContext } from "./user-drops-nft-setup";

export const listMyNfts = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await buildListContext();
  if (!ctx) return { groups: [], totalReady: 0, totalClaimed: 0 };

  const { sisters, activeDrops, hiddenSet, owned, claimedMap, chipDropPairs } = ctx;
  void maybeScanUserInventory(ctx.wallet);

  const groups: DropGroup[] = [];
  for (const drop of activeDrops) {
    // Chip-target дроп
    if (drop.chip_collection_id && drop.chip_min_level != null) {
      const pairs = chipDropPairs.get(drop.id) ?? [];
      const STORE = "yuplandshop.mintbase1.near";
      const minLvl = drop.chip_min_level;

      const templateNos = [...new Set(
        pairs.map((p) => { const m = p.title.match(/^#(\d+)\s/); return m ? Number(m[1]) : null; })
          .filter((n): n is number => n !== null)
      )].sort((a, b) => a - b);

      const { data: tplRows } = await pg.chipTemplates
        .raw()
        .select("template_no,image_url")
        .eq("collection_id", drop.chip_collection_id)
        .in("template_no", templateNos);
      const tplImage = new Map<number, string>();
      for (const t of ((tplRows ?? []) as Array<{ template_no: number; image_url: string }>)) {
        tplImage.set(t.template_no, t.image_url);
      }

      const { data: colRow } = await pg.chipCollections
        .raw()
        .select("name")
        .eq("id", drop.chip_collection_id)
        .limit(1);
      const colName =
        (((colRow as Array<{ name?: string }> | null) ?? [])[0]?.name ?? null) ??
        (await pg.chipCollections.findOne({ id: drop.chip_collection_id }))?.name ??
        "Коллекция";

      const { reqsOut } = buildChipDropReqs(
        pairs, STORE, minLvl, colName, tplImage, drop.id, owned, claimedMap
      );

      const totalOwnedItems = reqsOut.reduce((s, r) => s + r.items.length, 0);
      if (totalOwnedItems === 0) continue;

      let avail = Number.POSITIVE_INFINITY;
      for (const r of reqsOut) avail = Math.min(avail, r.owned);
      if (!Number.isFinite(avail)) avail = 0;

      groups.push({
        dropId: drop.id, title: drop.name, contractId: STORE,
        rewardMin: drop.reward_min, rewardMax: drop.reward_max,
        rewardToken: drop.reward_token, rewardTiers: parseRewardTiers(drop.reward_tiers),
        freeClaim: drop.free_claim, ticketCost: drop.ticket_cost ?? 1,
        mode: "combo", items: [], requirements: reqsOut,
        availableClaims: avail, hidden: hiddenSet.has(drop.id),
      });
      continue;
    }

    if (drop.mode === "combo") {
      let reqs: Array<{ title: string; count: number }> = [];
      try { reqs = JSON.parse(drop.requirements ?? "[]"); } catch { reqs = []; }
      if (reqs.length === 0) continue;

      const reqsOut: ComboReq[] = reqs.map((req) => {
        const mine = getOwnedByTitle(owned, drop.contract_id, req.title);
        const items: DropItem[] = mine.map((it) => {
          const claimed = claimedMap.get(`${drop.id}:${drop.contract_id}:${it.token_id}`);
          return {
            tokenId: it.token_id, title: (it.title ?? "").trim() || req.title,
            media: it.media || "", ownerWallet: it.owner_id ?? "",
            status: claimed ? ("claimed" as const) : ("ready" as const),
            claimedAmount: claimed?.amount ?? null, claimedAt: claimed?.redeemedAt ?? null,
          };
        });
        const ready = items.filter((i) => i.status === "ready");
        return {
          title: req.title, count: req.count, owned: ready.length, available: ready.length,
          items: items.sort((a, b) =>
            a.status === b.status ? a.tokenId.localeCompare(b.tokenId) : a.status === "ready" ? -1 : 1
          ),
        };
      });

      let avail = Number.POSITIVE_INFINITY;
      for (const r of reqsOut) avail = Math.min(avail, Math.floor(r.owned / r.count));
      if (!Number.isFinite(avail)) avail = 0;

      const totalReady = reqsOut.reduce((s, r) => s + r.owned, 0);
      if (totalReady === 0) continue;

      groups.push({
        dropId: drop.id, title: drop.name, contractId: drop.contract_id,
        rewardMin: drop.reward_min, rewardMax: drop.reward_max,
        rewardToken: drop.reward_token, rewardTiers: parseRewardTiers(drop.reward_tiers),
        freeClaim: drop.free_claim, ticketCost: drop.ticket_cost ?? 1,
        mode: "combo", items: [], requirements: reqsOut,
        availableClaims: avail, hidden: hiddenSet.has(drop.id),
      });
      continue;
    }

    // simple
    const mine = getOwnedByTitle(owned, drop.contract_id, drop.name);
    if (mine.length === 0) continue;

    const cards: DropItem[] = mine.map((it) => {
      const claimed = claimedMap.get(`${drop.id}:${drop.contract_id}:${it.token_id}`);
      return {
        tokenId: it.token_id, title: (it.title ?? "").trim() || drop.name,
        media: it.media || "", ownerWallet: it.owner_id ?? "",
        status: claimed ? ("claimed" as const) : ("ready" as const),
        claimedAmount: claimed?.amount ?? null, claimedAt: claimed?.redeemedAt ?? null,
      };
    });
    cards.sort((a, b) => {
      if (a.status === b.status) return a.tokenId.localeCompare(b.tokenId);
      return a.status === "ready" ? -1 : 1;
    });

    groups.push({
      dropId: drop.id, title: drop.name, contractId: drop.contract_id,
      rewardMin: drop.reward_min, rewardMax: drop.reward_max,
      rewardToken: drop.reward_token, rewardTiers: parseRewardTiers(drop.reward_tiers),
      freeClaim: drop.free_claim, ticketCost: drop.ticket_cost ?? 1,
      mode: "simple", items: cards, hidden: hiddenSet.has(drop.id),
    });
  }

  groups.sort((a, b) => {
    const aReady = a.items.filter((i) => i.status === "ready").length;
    const bReady = b.items.filter((i) => i.status === "ready").length;
    if (aReady !== bReady) return bReady - aReady;
    return a.title.localeCompare(b.title);
  });

  let totalReady = 0;
  let totalClaimedFromGroups = 0;
  for (const g of groups) {
    for (const i of g.items) {
      if (i.status === "ready") totalReady++;
      else totalClaimedFromGroups++;
    }
  }

  const { data: histRows } = await pg.redemptions
    .raw()
    .select("id")
    .in("wallet", sisters)
    .or("ticket_cost.gt.0,amount.gt.0");
  const totalClaimed = Math.max(totalClaimedFromGroups, (histRows ?? []).length);

  const DROP_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
  const createdById = new Map(activeDrops.map((d) => [d.id, d.created_at]));
  for (const g of groups) {
    const c = createdById.get(g.dropId);
    g.expiresAt = c ? new Date(new Date(c).getTime() + DROP_LIFETIME_MS).toISOString() : null;
  }
  return { groups, totalReady, totalClaimed };
});
