import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { getSisterWallets } from "./user-shared";
import { fetchSubscriptionDiscount } from "./user-shop";
import { evaluateFarmTokenCooldownReadonly } from "../farmTokenCooldown";
import { createServerFn } from "@tanstack/react-start";
import {
  type OwnedIndex, type TicketRequirement, buildOwnedIndex, getOwnedByTitle,
} from "./user-tickets-shared";

export const listMyTicketEvents = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  const events = await pg.ticketEvents.findMany(
    { active: true }, { orderBy: { column: "created_at", ascending: false } }
  );
  if (events.length === 0) return [];
  const sisters = wallet ? await getSisterWallets(wallet) : [];
  type Claim = { event_id: string; token_ids: string; claimed_at: string };
  const myClaims: Claim[] = wallet
    ? (((await pg.ticketClaims.raw().select("event_id,token_ids,claimed_at").in("wallet", sisters)).data as Claim[]) ?? [])
    : [];
  const comboByEvent = new Map<string, number>();
  for (const c of myClaims) comboByEvent.set(c.event_id, (comboByEvent.get(c.event_id) ?? 0) + 1);
  const lastClaimByEvent = new Map<string, number>();
  for (const c of myClaims) {
    const ms = new Date(c.claimed_at).getTime();
    const cur = lastClaimByEvent.get(c.event_id) ?? 0;
    if (ms > cur) lastClaimByEvent.set(c.event_id, ms);
  }
  const subInfo = wallet ? await fetchSubscriptionDiscount(wallet) : { discountPct: 0, level: 0 };
  const isSubscribed = subInfo.level > 0;
  const baseHours = 24;
  const capHours = isSubscribed ? 48 : 24;
  const MIN_CLAIM_HOURS = 4;
  type OwnedItem = { tokenId: string; title: string; media: string };
  const now = Date.now();
  const eventPairs: Array<{ contractId: string; title: string }> = [];
  for (const e of events) {
    try {
      const reqs = JSON.parse(e.requirements) as TicketRequirement[];
      for (const r of reqs) eventPairs.push({ contractId: e.contract_id, title: r.title });
    } catch { /* skip */ }
  }
  let owned: OwnedIndex = new Map();
  if (wallet) {
    try {
      // Без внешнего Promise.race: buildOwnedIndex сам ограничивает время
      // ТОЛЬКО на внешние догрузки и всегда возвращает локальный индекс.
      // Раньше гонка на 8с при медленном Sendler отдавала ПУСТОЙ индекс —
      // NFT игрока «пропадали», фарм билетов показывался как «нет на кошельке».
      owned = await buildOwnedIndex(eventPairs, sisters);
    } catch (err) {
      console.warn("[listMyTicketEvents] ownership failed:", err instanceof Error ? err.message : err);
    }
  }
  const cdByContract = new Map<string, { eligible: Set<string>; cuByToken: Map<string, number>; clampSinceMs: Map<string, number> }>();
  if (wallet) {
    const tokensByContract = new Map<string, Set<string>>();
    for (const event of events) {
      let ereqs: TicketRequirement[];
      try { ereqs = JSON.parse(event.requirements) as TicketRequirement[]; } catch { continue; }
      for (const req of ereqs) {
        for (const it of getOwnedByTitle(owned, event.contract_id, req.title)) {
          let set = tokensByContract.get(event.contract_id);
          if (!set) { set = new Set<string>(); tokensByContract.set(event.contract_id, set); }
          set.add(it.token_id);
        }
      }
    }
    for (const [contractId, toks] of tokensByContract) {
      cdByContract.set(contractId, await evaluateFarmTokenCooldownReadonly(contractId, Array.from(toks), wallet, Date.now(), sisters));
    }
  }
  const results = events.map((event) => {
    const reqs = JSON.parse(event.requirements) as TicketRequirement[];
    const ownership = reqs.map((req) => {
      if (!wallet) return { title: req.title, count: req.count, owned: 0, items: [] as OwnedItem[] };
      const mine = getOwnedByTitle(owned, event.contract_id, req.title);
      const itemsOut: OwnedItem[] = mine.map((it) => ({
        tokenId: it.token_id, title: (it.title ?? "").trim() || req.title, media: it.media || "",
      }));
      return { title: req.title, count: req.count, owned: itemsOut.length, items: itemsOut };
    });
    const cd = cdByContract.get(event.contract_id);
    let onCooldownCount = 0;
    let cooldownFreeMs: number | null = null;
    let nComplete = Number.POSITIVE_INFINITY;
    const eligByReq: string[][] = [];
    for (const o of ownership) {
      const eligTokens = cd?.eligible ? o.items.filter((it) => cd.eligible.has(it.tokenId)).map((it) => it.tokenId) : o.items.map((it) => it.tokenId);
      eligByReq.push(eligTokens);
      nComplete = Math.min(nComplete, Math.floor(eligTokens.length / o.count));
      if (cd?.cuByToken) {
        for (const it of o.items) {
          const cu = cd.cuByToken.get(it.tokenId);
          if (cu) { onCooldownCount++; if (cooldownFreeMs == null || cu < cooldownFreeMs) cooldownFreeMs = cu; }
        }
      }
    }
    if (!Number.isFinite(nComplete)) nComplete = 0;
    const usedTokens: string[] = [];
    if (nComplete > 0) {
      for (let i = 0; i < ownership.length; i++) {
        const need = nComplete * ownership[i].count;
        for (const t of eligByReq[i].slice(0, need)) usedTokens.push(t);
      }
    }
    let farmStartMs = 0;
    for (const t of usedTokens) { const fs = cd?.clampSinceMs.get(t); if (fs != null && fs > farmStartMs) farmStartMs = fs; }
    const lastClaimMs = lastClaimByEvent.get(event.id) ?? 0;
    const walletElapsedH = lastClaimMs > 0 ? (now - lastClaimMs) / 3_600_000 : capHours;
    const farmElapsedH = farmStartMs > 0 ? (now - farmStartMs) / 3_600_000 : capHours;
    const effectiveH = Math.min(capHours, Math.max(0, Math.min(walletElapsedH, farmElapsedH)));
    const ratePerHour = nComplete > 0 ? (nComplete * event.reward_tickets) / baseHours : 0;
    const accruedRaw = ratePerHour * effectiveH;
    const accrued = Math.round(accruedRaw * 100) / 100;
    const maxAccrual = Math.round(ratePerHour * capHours * 100) / 100;
    const minClaimAtMs = lastClaimMs > 0 ? lastClaimMs + MIN_CLAIM_HOURS * 3_600_000 : 0;
    const canClaimNow = nComplete > 0 && accrued >= 0.01 && (lastClaimMs === 0 || now >= minClaimAtMs);
    return {
      id: event.id, requirements: reqs, rewardTickets: event.reward_tickets,
      holdDurationSec: event.hold_duration_sec, ownership, nComplete, accrued, maxAccrual,
      elapsedHours: walletElapsedH, capHours, baseHours, minClaimAtMs, canClaimNow,
      lastClaimMs, ratePerHour, onCooldownCount, cooldownFreeMs,
      comboCount: comboByEvent.get(event.id) ?? 0, isSubscribed, serverNow: now,
      availableClaims: nComplete, totalAwardable: accrued,
    };
  });
  return results;
});
