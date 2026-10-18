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
  type OwnedIndex, type EventClaimPre, type TicketRequirement,
  buildOwnedIndex, getOwnedByTitle, round2, invalidateTicketsCache, requireLinkedTelegram,
} from "./user-tickets-shared";

export async function performClaim(
  eventId: string, wallet: string, pre?: EventClaimPre
): Promise<{ claims: number; ticketsAwarded: number; tokens: string[] } | null> {
  const event = await pg.ticketEvents.findOne({ id: eventId });
  if (!event || !event.active) throw new Error("Событие не найдено");
  const now = Date.now();
  // Кулдаун, замок окна и начисление — по одному ключу, аккаунту. Раньше гейт
  // читался по адресам, а билеты уходили на аккаунт.
  const { claimSlotId, claimAccountOf, isDuplicateRow } = await import("./farm-claim-slot");
  const account = await claimAccountOf(wallet);
  const sisters = pre?.sisters ?? (await getSisterWallets(wallet));
  const claims = ((await pg.ticketClaims.raw().select("claimed_at,token_ids").eq("event_id", eventId).eq("account_id", account)).data as Array<{ claimed_at: string; token_ids: string }>) ?? [];
  let lastClaimMs = 0;
  for (const c of claims) { const ms = new Date(c.claimed_at).getTime(); if (ms > lastClaimMs) lastClaimMs = ms; }
  const subInfo = pre?.sub ?? (await fetchSubscriptionDiscount(wallet));
  const isSubscribed = subInfo.level > 0;
  const baseHours = 24;
  const capHours = isSubscribed ? 48 : 24;
  const MIN_CLAIM_HOURS = 4;
  if (lastClaimMs > 0 && (now - lastClaimMs) / 3_600_000 < MIN_CLAIM_HOURS) {
    throw new Error(`Слишком рано — минимум ${MIN_CLAIM_HOURS} часа между клеймами`);
  }
  const reqs = JSON.parse(event.requirements) as TicketRequirement[];
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
  const ratePerHour = (nComplete * event.reward_tickets) / baseHours;
  const accrued = Math.round(ratePerHour * effectiveH * 1e4) / 1e4;
  if (accrued < 0.01) return null;
  const ticketsAwarded = accrued;
  // Строка клейма — она же замок окна: id считается из аккаунта, события и
  // четырёхчасового окна, поэтому второе нажатие упирается в первичный ключ.
  const claimId = claimSlotId("tc", eventId, account, now);
  try {
    await pg.ticketClaims.insert({ id: claimId, event_id: eventId, account_id: account, wallet, token_ids: JSON.stringify(usedTokens), tickets_awarded: ticketsAwarded });
  } catch (e) {
    if (isDuplicateRow(e)) return null;
    throw e;
  }
  {
    // Начисление в леджер; ref — id клейма, поэтому ретрай не задвоит.
    const { moveTickets } = await import("./tickets-ledger");
    await moveTickets({ wallet, delta: ticketsAwarded, kind: "nft_claim", ref: `claim:${claimId}` });
  }
  invalidateTicketsCache(sisters);
  return { claims: nComplete, ticketsAwarded, tokens: usedTokens };
}

export const claimTicketEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ eventId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);
    const res = await performClaim(data.eventId, wallet);
    if (!res) throw new Error("Сейчас нечего забирать");
    return { ok: true, claims: res.claims, ticketsAwarded: res.ticketsAwarded };
  });

export const claimAllTicketEvents = createServerFn({ method: "POST" }).handler(async () => {
  assertNotMaintenance();
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  await requireLinkedTelegram(wallet);
  const events = await pg.ticketEvents.findMany({ active: true });
  const sisters = await getSisterWallets(wallet);
  const sub = await fetchSubscriptionDiscount(wallet);
  const allPairs: Array<{ contractId: string; title: string }> = [];
  for (const e of events) {
    try {
      const reqs = JSON.parse(e.requirements) as TicketRequirement[];
      for (const r of reqs) allPairs.push({ contractId: e.contract_id, title: r.title });
    } catch { /* skip */ }
  }
  const owned = await buildOwnedIndex(allPairs, sisters);
  const pre = { sisters, owned, sub: { level: sub.level } };
  let totalClaims = 0;
  let totalAwarded = 0;
  for (const e of events) {
    try {
      const res = await performClaim(e.id, wallet, pre);
      if (res) { totalClaims += res.claims; totalAwarded += res.ticketsAwarded; }
    } catch { /* skip broken */ }
  }
  return { ok: true, claims: totalClaims, ticketsAwarded: totalAwarded };
});
