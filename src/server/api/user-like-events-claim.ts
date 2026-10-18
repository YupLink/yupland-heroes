import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { getSisterWallets } from "./user-shared";
import { fetchSubscriptionDiscount } from "./user-shop";
import { evaluateFarmTokenCooldown } from "../farmTokenCooldown";
import {
  type EventClaimPre, type LikeRequirement, buildOwnedIndex, getOwnedByTitle, invalidateTicketsCache, requireLinkedTelegram,
} from "./user-tickets-shared";

export async function performLikeClaim(
  eventId: string, wallet: string, pre?: EventClaimPre
): Promise<{ claims: number; likesAwarded: number } | null> {
  const event = await pg.likeEvents.findOne({ id: eventId });
  if (!event || !event.active) throw new Error("Событие не найдено");
  const now = Date.now();
  // Аккаунт резолвим ОДИН раз: им же считается кулдаун, им же ключуется замок
  // окна и на него же уходят лайки. Раньше гейт читался по адресам, а выдача
  // шла на аккаунт — окно сгорало, лайки не приходили.
  const { claimSlotId, claimAccountOf, isDuplicateRow } = await import("./farm-claim-slot");
  const account = await claimAccountOf(wallet);
  const sisters = pre?.sisters ?? (await getSisterWallets(wallet));
  const claims = ((await pg.likeClaims.raw().select("claimed_at,token_ids").eq("event_id", eventId).eq("account_id", account)).data as Array<{ claimed_at: string; token_ids: string }>) ?? [];
  let lastClaimMs = 0;
  for (const c of claims) { const ms = new Date(c.claimed_at).getTime(); if (ms > lastClaimMs) lastClaimMs = ms; }
  const subInfo = pre?.sub ?? (await fetchSubscriptionDiscount(wallet));
  const isSubscribed = subInfo.level > 0;
  const baseHours = 24;
  const capHours = isSubscribed ? 48 : 24;
  const MIN_CLAIM_HOURS = 4;
  if (lastClaimMs > 0 && (now - lastClaimMs) / 3_600_000 < MIN_CLAIM_HOURS) {
    throw new Error(`Слишком рано — минимум ${MIN_CLAIM_HOURS}ч между клеймами`);
  }
  const reqs = JSON.parse(event.requirements) as LikeRequirement[];
  const pairs = reqs.map((r) => ({ contractId: event.contract_id, title: r.title }));
  const owned = pre?.owned ?? (await buildOwnedIndex(pairs, sisters));
  const ownedByReq = reqs.map((req) => getOwnedByTitle(owned, event.contract_id, req.title).map((it) => it.token_id));
  const { eligible, clampSinceMs } = await evaluateFarmTokenCooldown(event.contract_id, ownedByReq.flat(), wallet, now, sisters);
  let nComplete = Number.POSITIVE_INFINITY;
  const usedByReq: Array<Array<string>> = [];
  for (let i = 0; i < reqs.length; i++) {
    const elig = ownedByReq[i].filter((t) => eligible.has(t));
    nComplete = Math.min(nComplete, Math.floor(elig.length / reqs[i].count));
    usedByReq.push(elig);
  }
  if (!Number.isFinite(nComplete) || nComplete <= 0) return null;
  const usedTokens: string[] = [];
  for (let i = 0; i < reqs.length; i++) {
    const need = nComplete * reqs[i].count;
    for (const t of usedByReq[i].slice(0, need)) usedTokens.push(t);
  }
  let farmStartMs = 0;
  for (const t of usedTokens) { const fs = clampSinceMs.get(t); if (fs != null && fs > farmStartMs) farmStartMs = fs; }
  const walletElapsedH = lastClaimMs > 0 ? (now - lastClaimMs) / 3_600_000 : capHours;
  const farmElapsedH = farmStartMs > 0 ? (now - farmStartMs) / 3_600_000 : capHours;
  const effectiveH = Math.min(capHours, Math.max(0, Math.min(walletElapsedH, farmElapsedH)));
  const ratePerHour = (nComplete * event.reward_likes) / baseHours;
  const accrued = Math.floor(ratePerHour * effectiveH * 100) / 100;
  if (accrued < 0.01) return null;
  // Строка клейма — замок окна: id из аккаунта, события и четырёхчасового
  // окна. Лайки идут мимо леджера, поэтому первичный ключ здесь — вся защита.
  const slot = claimSlotId("lc", eventId, account, now);
  try {
    await pg.likeClaims.insert({ id: slot, event_id: eventId, account_id: account, wallet, token_ids: JSON.stringify(usedTokens), likes_awarded: accrued });
  } catch (e) {
    if (isDuplicateRow(e)) return null;
    throw e;
  }
  const { addLikes } = await import("../likesAccount");
  await addLikes(account, accrued, "lifetime_granted", `event:${slot}`);
  return { claims: nComplete, likesAwarded: accrued };
}

export const claimLikeEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ eventId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);
    const { UNIVERSAL_EVENT_ID, performUniversalLikeClaim } = await import("../universalLikeMining");
    if (data.eventId === UNIVERSAL_EVENT_ID) {
      const sisters = await getSisterWallets(wallet);
      const sub = await fetchSubscriptionDiscount(wallet);
      const res = await performUniversalLikeClaim(wallet, sisters, sub.level > 0);
      if (!res) throw new Error("Сейчас нечего забирать");
      return { ok: true, claims: 1, likesAwarded: res.likesAwarded };
    }
    const res = await performLikeClaim(data.eventId, wallet);
    if (!res) throw new Error("Сейчас нечего забирать");
    return { ok: true, claims: res.claims, likesAwarded: res.likesAwarded };
  });

export const claimAllLikeEvents = createServerFn({ method: "POST" }).handler(async () => {
  assertNotMaintenance();
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  await requireLinkedTelegram(wallet);
  let totalClaims = 0;
  let totalAwarded = 0;
  try {
    const { performUniversalLikeClaim } = await import("../universalLikeMining");
    const sisters = await getSisterWallets(wallet);
    const sub = await fetchSubscriptionDiscount(wallet);
    const u = await performUniversalLikeClaim(wallet, sisters, sub.level > 0);
    if (u) { totalClaims += 1; totalAwarded += u.likesAwarded; }
  } catch (err) { console.warn("[claimAllLikeEvents] universal claim failed:", err); }
  const events = await pg.likeEvents.findMany({ active: true });
  const sisters2 = await getSisterWallets(wallet);
  const sub2 = await fetchSubscriptionDiscount(wallet);
  const allPairs2: Array<{ contractId: string; title: string }> = [];
  for (const e of events) {
    try {
      const reqs = JSON.parse(e.requirements) as LikeRequirement[];
      for (const r of reqs) allPairs2.push({ contractId: e.contract_id, title: r.title });
    } catch { /* skip */ }
  }
  const owned2 = await buildOwnedIndex(allPairs2, sisters2);
  const pre2 = { sisters: sisters2, owned: owned2, sub: { level: sub2.level } };
  for (const e of events) {
    try {
      const r = await performLikeClaim(e.id, wallet, pre2);
      if (r) { totalClaims += r.claims; totalAwarded += r.likesAwarded; }
    } catch (err) { console.warn(`[claimAllLikeEvents] event=${e.id} failed:`, err); }
  }
  return { ok: true, claims: totalClaims, likesAwarded: totalAwarded };
});
