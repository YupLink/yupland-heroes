import { normalizeTitle } from "@/lib/normalizeTitle";
import { fetchSendlerNftsByOwner, fetchSendlerNftsByTitle } from "../sendler";
import { pg, type PgNft } from "../db/pg";
import { isTgBypassWallet } from "../auth";
import { nearRpc } from "../rpc";
import { type SendlerLite, type OwnedIndex, type InventoryByContract, nftsForOwnerCache, inventoryCache } from "./user-claims-types";

export async function requireLinkedTelegram(wallet: string): Promise<void> {
  if (isTgBypassWallet(wallet)) return;
  const u = await pg.users.findOne({ wallet });
  if (!u?.telegram_id) {
    throw new Error("Сначала подтверди Telegram");
  }
}

export async function fetchNftsForOwnerOnChain(
  contractId: string,
  ownerId: string
): Promise<Array<{ token_id: string; title: string; media: string }>> {
  const cacheKey = `${contractId}::${ownerId}`;
  const cached = nftsForOwnerCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30_000) return cached.data;

  const all: Array<{ token_id: string; title: string; media: string }> = [];
  const LIMIT = 300;
  const MAX_PAGES = 20;
  let hadError = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const args = {
        account_id: ownerId,
        from_index: String(page * LIMIT),
        limit: LIMIT,
      };
      const argsB64 = Buffer.from(JSON.stringify(args)).toString("base64");
      const j = await nearRpc<{ result?: number[] }>("query", {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "nft_tokens_for_owner",
        args_base64: argsB64,
      });
      const bytes = j.result?.result;
      if (!bytes) break;
      const text = Buffer.from(bytes).toString("utf-8");
      const items = JSON.parse(text) as Array<{
        token_id: string;
        metadata?: { title?: string; media?: string };
      }>;
      if (items.length === 0) break;
      for (const it of items) {
        all.push({
          token_id: it.token_id,
          title: it.metadata?.title ?? "",
          media: it.metadata?.media ?? "",
        });
      }
      if (items.length < LIMIT) break;
    } catch (err) {
      console.warn(
        `[fetchNftsForOwnerOnChain] RPC fail contract=${contractId} owner=${ownerId} page=${page}:`,
        err instanceof Error ? err.message : err
      );
      hadError = true;
      break;
    }
  }
  if (!hadError && all.length > 0) {
    nftsForOwnerCache.set(cacheKey, { at: Date.now(), data: all });
  }
  return all;
}

export async function loadUserInventory(
  contractIds: string[],
  sisters: string[]
): Promise<InventoryByContract> {
  const result: InventoryByContract = new Map();
  for (const c of contractIds) result.set(c, []);
  try {
    const { data: localRows } = await pg.nfts
      .raw()
      .select("contract_id,token_id,name,image,owner_wallet")
      .in("contract_id", contractIds)
      .in("owner_wallet", sisters);
    for (const r of ((localRows ?? []) as Array<{
      contract_id: string;
      token_id: string;
      name: string;
      image: string;
      owner_wallet: string | null;
    }>)) {
      const arr = result.get(r.contract_id);
      if (!arr) continue;
      arr.push({
        token_id: r.token_id,
        title: r.name,
        media: r.image,
        owner_id: r.owner_wallet ?? "",
      });
    }
  } catch (err) {
    console.warn(
      "[loadUserInventory] pg.nfts read failed:",
      err instanceof Error ? err.message : err
    );
  }
  return result;
}

export async function buildOwnedIndex(
  pairs: Array<{ contractId: string; title: string }>,
  sisters: string[]
): Promise<OwnedIndex> {
  const sisterSet = new Set(sisters);
  const index: OwnedIndex = new Map();

  const uniqContracts = Array.from(new Set(pairs.map((p) => p.contractId)));
  const inventory = await loadUserInventory(uniqContracts, sisters);

  const titlesByContract = new Map<string, Set<string>>();
  for (const p of pairs) {
    const set = titlesByContract.get(p.contractId) ?? new Set();
    set.add(normalizeTitle(p.title));
    titlesByContract.set(p.contractId, set);
  }
  for (const [contractId, items] of inventory) {
    const titlesNeeded = titlesByContract.get(contractId) ?? new Set();
    const byTitle = new Map<string, SendlerLite[]>();
    for (const it of items) {
      const norm = normalizeTitle(it.title);
      if (!titlesNeeded.has(norm)) continue;
      const arr = byTitle.get(norm) ?? [];
      arr.push(it);
      byTitle.set(norm, arr);
    }
    if (byTitle.size > 0) index.set(contractId, byTitle);
  }
  const tasks = new Map<string, { contractId: string; title: string }>();
  if (false) for (const p of pairs) {
    const norm = normalizeTitle(p.title);
    const have = index.get(p.contractId)?.get(norm)?.length ?? 0;
    if (have > 0) continue;
    const k = `${p.contractId}::${norm}`;
    if (!tasks.has(k)) tasks.set(k, p);
  }

  await Promise.all(
    Array.from(tasks.values()).map(async ({ contractId, title }) => {
      try {
        const want = normalizeTitle(title);
        const mine: SendlerLite[] = [];

        try {
          const items = await fetchSendlerNftsByTitle(contractId, title);
          const strict = items.filter(
            (it) => normalizeTitle(it.title) === want
          );
          const useList = strict.length > 0 ? strict : items;
          for (const it of useList) {
            if (sisterSet.has(it.owner_id ?? "")) mine.push(it);
          }
        } catch (err) {
          console.warn(
            `[buildOwnedIndex] Sendler title="${title}" failed:`,
            err instanceof Error ? err.message : err
          );
        }

        try {
          const { data: localRows } = await pg.nfts
            .raw()
            .select("*")
            .eq("contract_id", contractId)
            .in("owner_wallet", sisters);
          const local = (localRows as PgNft[]) ?? [];
          for (const n of local) {
            if (normalizeTitle(n.name) === want) {
              mine.push({
                token_id: n.token_id,
                title: n.name,
                media: n.image,
                owner_id: n.owner_wallet ?? "",
              });
            }
          }
        } catch (err) {
          console.warn(
            `[buildOwnedIndex] pg.nfts title="${title}" failed:`,
            err instanceof Error ? err.message : err
          );
        }

        if (mine.length === 0) {
          const perOwner = await Promise.all(
            sisters.map(async (owner) => {
              const onChain = await fetchNftsForOwnerOnChain(contractId, owner);
              return onChain
                .filter((n) => normalizeTitle(n.title) === want)
                .map((n) => ({
                  token_id: n.token_id,
                  title: n.title,
                  media: n.media,
                  owner_id: owner,
                }));
            })
          );
          for (const arr of perOwner) mine.push(...arr);
        }

        const seen = new Set<string>();
        const dedup = mine.filter((it) => {
          if (!it.token_id || seen.has(it.token_id)) return false;
          seen.add(it.token_id);
          return true;
        });
        let byTitle = index.get(contractId);
        if (!byTitle) {
          byTitle = new Map();
          index.set(contractId, byTitle);
        }
        byTitle.set(
          want,
          dedup.map((it) => ({
            token_id: it.token_id,
            title: it.title,
            media: it.media,
            owner_id: it.owner_id,
          }))
        );
      } catch (err) {
        console.warn(
          `[buildOwnedIndex] title="${title}" contract=${contractId} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );
  return index;
}

export function getOwnedByTitle(
  index: OwnedIndex,
  contractId: string,
  title: string
): SendlerLite[] {
  return index.get(contractId)?.get(normalizeTitle(title)) ?? [];
}
