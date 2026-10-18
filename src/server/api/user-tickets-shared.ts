import { pg } from "../db/pg";
import { isTgBypassWallet } from "../auth";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { fetchSendlerNftsByTitle } from "../sendler";
import { evaluateFarmTokenCooldownReadonly } from "../farmTokenCooldown";

export type SendlerLite = {
  token_id: string;
  title?: string;
  media?: string;
  owner_id?: string;
};
export type OwnedIndex = Map<string, Map<string, SendlerLite[]>>;
export type InventoryByContract = Map<string, SendlerLite[]>;
export type TicketsResult = {
  total: number;
  used: number;
  available: number;
  availableRaw: number;
  earnedFromReferrals: number;
  earnedFromTasks: number;
  earnedFromTicketEvents: number;
  earnedFromPurchases: number;
};
export type EventClaimPre = {
  sisters: string[];
  owned: OwnedIndex;
  sub: { level: number };
};
export type TicketRequirement = { title: string; count: number };
export type LikeRequirement = { title: string; count: number };

// Кэш баланса — общий модуль (см. tickets-cache.ts): раньше здесь была вторая
// независимая Map, и сброс после операции её не касался.
export { TICKETS_TTL_MS, _ticketsCache, invalidateTicketsCache } from "./tickets-cache";

const nftsForOwnerCache = new Map<
  string,
  { at: number; data: Array<{ token_id: string; title: string; media: string }> }
>();

export async function requireLinkedTelegram(wallet: string): Promise<void> {
  if (isTgBypassWallet(wallet)) return;
  const u = await pg.users.findOne({ wallet });
  if (!u?.telegram_id) throw new Error("Сначала подтверди Telegram");
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
      const args = { account_id: ownerId, from_index: String(page * LIMIT), limit: LIMIT };
      const argsB64 = Buffer.from(JSON.stringify(args)).toString("base64");
      const { nearRpc } = await import("../rpc");
      const j = await nearRpc<{ result?: number[] }>("query", {
        request_type: "call_function", finality: "final",
        account_id: contractId, method_name: "nft_tokens_for_owner", args_base64: argsB64,
      });
      const bytes = j.result?.result;
      if (!bytes) break;
      const text = Buffer.from(bytes).toString("utf-8");
      const items = JSON.parse(text) as Array<{
        token_id: string; metadata?: { title?: string; media?: string };
      }>;
      if (items.length === 0) break;
      for (const it of items) {
        all.push({ token_id: it.token_id, title: it.metadata?.title ?? "", media: it.metadata?.media ?? "" });
      }
      if (items.length < LIMIT) break;
    } catch (err) {
      console.warn("[fetchNftsForOwnerOnChain] RPC fail", contractId, ownerId, page, err instanceof Error ? err.message : err);
      hadError = true;
      break;
    }
  }
  if (!hadError && all.length > 0) nftsForOwnerCache.set(cacheKey, { at: Date.now(), data: all });
  return all;
}

export async function loadUserInventory(
  contractIds: string[], sisters: string[]
): Promise<InventoryByContract> {
  const result: InventoryByContract = new Map();
  for (const c of contractIds) result.set(c, []);
  try {
    const { data: localRows } = await pg.nfts
      .raw().select("contract_id,token_id,name,image,owner_wallet")
      .in("contract_id", contractIds).in("owner_wallet", sisters);
    for (const r of ((localRows ?? []) as Array<{
      contract_id: string; token_id: string; name: string; image: string; owner_wallet: string | null;
    }>)) {
      const arr = result.get(r.contract_id);
      if (!arr) continue;
      arr.push({ token_id: r.token_id, title: r.name, media: r.image, owner_id: r.owner_wallet ?? "" });
    }
  } catch (err) {
    console.warn("[loadUserInventory] pg.nfts read failed:", err instanceof Error ? err.message : err);
  }
  return result;
}

export async function buildOwnedIndex(
  pairs: Array<{ contractId: string; title: string }>, sisters: string[]
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
  for (const p of pairs) {
    const norm = normalizeTitle(p.title);
    const have = index.get(p.contractId)?.get(norm)?.length ?? 0;
    if (have > 0) continue;
    const k = `${p.contractId}::${norm}`;
    if (!tasks.has(k)) tasks.set(k, p);
  }

  // Догрузка недостающих тайтлов из внешних источников (Sendler / on-chain).
  // ВАЖНО: она ограничена по времени и НИКОГДА не отменяет уже собранный
  // локальный индекс. Раньше вызывающий код (список тикет-правил) оборачивал
  // весь buildOwnedIndex в Promise.race(8s) — при медленном Sendler терялись
  // и локальные NFT, и игрок видел «Нет на кошельке — не приносят», хотя NFT
  // лежат в базе. Именно так фарм билетов «пропадал» у крупных держателей.
  const REMOTE_BUDGET_MS = 6_000;
  const remote = Promise.all(
    Array.from(tasks.values()).map(async ({ contractId, title }) => {
      try {
        const want = normalizeTitle(title);
        const mine: SendlerLite[] = [];
        try {
          const items = await fetchSendlerNftsByTitle(contractId, title);
          const strict = items.filter((it) => normalizeTitle(it.title) === want);
          const useList = strict.length > 0 ? strict : items;
          for (const it of useList) {
            if (sisterSet.has(it.owner_id ?? "")) mine.push(it);
          }
        } catch (err) {
          console.warn("[buildOwnedIndex] Sendler failed:", title, err instanceof Error ? err.message : err);
        }
        // Локальный кэш уже прочитан один раз в loadUserInventory выше —
        // повторно тянуть всю таблицу на КАЖДЫЙ тайтл не нужно (у крупных
        // держателей это тысячи строк × число тайтлов и было главным тормозом).
        for (const it of inventory.get(contractId) ?? []) {
          if (normalizeTitle(it.title) === want) mine.push(it);
        }
        if (mine.length === 0) {
          const perOwner = await Promise.all(
            sisters.map(async (owner) => {
              const onChain = await fetchNftsForOwnerOnChain(contractId, owner);
              return onChain.filter((n) => normalizeTitle(n.title) === want).map((n) => ({
                token_id: n.token_id, title: n.title, media: n.media, owner_id: owner,
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
        if (dedup.length === 0) return; // нечего добавлять — не затираем локальное
        let byTitle = index.get(contractId);
        if (!byTitle) { byTitle = new Map(); index.set(contractId, byTitle); }
        byTitle.set(want, dedup.map((it) => ({ token_id: it.token_id, title: it.title, media: it.media, owner_id: it.owner_id })));
      } catch (err) {
        console.warn("[buildOwnedIndex] failed:", title, contractId, err instanceof Error ? err.message : err);
      }
    })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    remote,
    new Promise<void>((res) => { timer = setTimeout(res, REMOTE_BUDGET_MS); }),
  ]);
  if (timer) clearTimeout(timer);
  // Даже если бюджет вышел — отдаём то, что успели собрать (как минимум
  // локальный индекс). Пустой индекс больше не выдаётся из-за медленного API.
  return index;
}

export function getOwnedByTitle(index: OwnedIndex, contractId: string, title: string): SendlerLite[] {
  return index.get(contractId)?.get(normalizeTitle(title)) ?? [];
}

export function round2(n: number): number { return Math.round(n * 100) / 100; }
