import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { getSisterWallets } from "./user-shared";
import { fetchSubscriptionDiscount } from "./user-shop";
import { evaluateFarmTokenCooldownReadonly } from "../farmTokenCooldown";
import { createServerFn } from "@tanstack/react-start";
import { type OwnedIndex, type LikeRequirement, buildOwnedIndex, getOwnedByTitle } from "./user-tickets-shared";

export const listMyLikeEvents = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  // Независимые чтения — разом (раньше шли цепочкой, каждое ждало предыдущее).
  const [events, sisters, subInfo] = await Promise.all([
    pg.likeEvents.findMany({ active: true }, { orderBy: { column: "created_at", ascending: false } }),
    wallet ? getSisterWallets(wallet) : Promise.resolve([] as string[]),
    wallet ? fetchSubscriptionDiscount(wallet) : Promise.resolve({ level: 0, percent: 0, expiresAt: null }),
  ]);
  const { buildUniversalEventForUser } = await import("../universalLikeMining");
  type UniversalUI = NonNullable<Awaited<ReturnType<typeof buildUniversalEventForUser>>> & { uiKind: "universal" };
  // Карточка универсального майнинга ходит в Sendler — пусть идёт вместе со
  // списком, а не перед ним.
  const universalP: Promise<UniversalUI | null> = buildUniversalEventForUser(wallet, sisters, subInfo.level > 0)
    .then((u) => (u ? { ...u, uiKind: "universal" as const } : null))
    .catch((err) => { console.warn("[listMyLikeEvents] universal build failed:", err); return null; });
  if (events.length === 0) { const u = await universalP; return u ? [u] : []; }
  type Claim = { event_id: string; token_ids: string; claimed_at: string };
  const myClaims: Claim[] = wallet
    ? (((await pg.likeClaims.raw().select("event_id,token_ids,claimed_at").in("wallet", sisters)).data as Claim[]) ?? [])
    : [];
  const lastClaimByEvent = new Map<string, number>();
  for (const c of myClaims) {
    const ms = new Date(c.claimed_at).getTime();
    const cur = lastClaimByEvent.get(c.event_id) ?? 0;
    if (ms > cur) lastClaimByEvent.set(c.event_id, ms);
  }
  const comboByEvent = new Map<string, number>();
  for (const c of myClaims) comboByEvent.set(c.event_id, (comboByEvent.get(c.event_id) ?? 0) + 1);
  const isSubscribed = subInfo.level > 0;
  const baseHours = 24;
  const capHours = isSubscribed ? 48 : 24;
  const MIN_CLAIM_HOURS = 4;
  const now = Date.now();
  const allPairs: Array<{ contractId: string; title: string }> = [];
  for (const e of events) {
    const reqs = JSON.parse(e.requirements) as LikeRequirement[];
    for (const r of reqs) allPairs.push({ contractId: e.contract_id, title: r.title });
  }
  const owned: OwnedIndex = sisters.length > 0 ? await buildOwnedIndex(allPairs, sisters) : new Map();
  const mapped = await Promise.all(events.map(async (event) => {
    const reqs = JSON.parse(event.requirements) as LikeRequirement[];
    const ownedByReq = reqs.map((r) => getOwnedByTitle(owned, event.contract_id, r.title).map((it) => it.token_id));
    const { eligible, clampSinceMs, onCooldownCount } = await evaluateFarmTokenCooldownReadonly(
      event.contract_id, ownedByReq.flat(), wallet ?? "", now, sisters
    );
    const ownership = reqs.map((r, i) => {
      const all = ownedByReq[i];
      const elig = all.filter((t) => eligible.has(t));
      return { title: r.title, count: r.count, owned: all.length, eligibleOwned: elig.length, items: all.map((tokenId) => ({ tokenId })) };
    });
    let nComplete = Number.POSITIVE_INFINITY;
    const usedByReq: string[][] = [];
    for (let i = 0; i < reqs.length; i++) {
      const elig = ownedByReq[i].filter((t) => eligible.has(t));
      nComplete = Math.min(nComplete, Math.floor(elig.length / reqs[i].count));
      usedByReq.push(elig);
    }
    if (!Number.isFinite(nComplete)) nComplete = 0;
    const usedTokens: string[] = [];
    if (nComplete > 0) {
      for (let i = 0; i < reqs.length; i++) {
        const need = nComplete * reqs[i].count;
        for (const t of usedByReq[i].slice(0, need)) usedTokens.push(t);
      }
    }
    let farmStartMs = 0;
    for (const t of usedTokens) { const fs = clampSinceMs.get(t); if (fs != null && fs > farmStartMs) farmStartMs = fs; }
    const lastClaimMs = lastClaimByEvent.get(event.id) ?? 0;
    const walletElapsedH = lastClaimMs > 0 ? (now - lastClaimMs) / 3_600_000 : capHours;
    const farmElapsedH = farmStartMs > 0 ? (now - farmStartMs) / 3_600_000 : capHours;
    const effectiveH = Math.min(capHours, Math.max(0, Math.min(walletElapsedH, farmElapsedH)));
    const ratePerHour = nComplete > 0 ? (nComplete * event.reward_likes) / baseHours : 0;
    const accrued = Math.floor(ratePerHour * effectiveH * 100) / 100;
    const maxAccrual = Math.floor(ratePerHour * capHours * 100) / 100;
    const minClaimAtMs = lastClaimMs > 0 ? lastClaimMs + MIN_CLAIM_HOURS * 3_600_000 : 0;
    const canClaimNow = nComplete > 0 && accrued >= 0.01 && (lastClaimMs === 0 || now >= minClaimAtMs);
    return {
      id: event.id, requirements: reqs, rewardLikes: event.reward_likes,
      holdDurationSec: event.hold_duration_sec, ownership, nComplete, onCooldownCount,
      accrued, maxAccrual, capHours, baseHours, minClaimAtMs, canClaimNow,
      lastClaimMs, ratePerHour, comboCount: comboByEvent.get(event.id) ?? 0, serverNow: now,
    };
  }));
  const universalForUI = await universalP;
  return universalForUI
    ? ([universalForUI, ...mapped] as Array<(typeof mapped)[number] | UniversalUI>)
    : mapped;
});
