// AUTO-EXTRACTED from user.ts lines 7367-7749
// всё про Yupland-портал: статус, профиль, подписка, ачивки, энергия

import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as ed25519 from "@noble/ed25519";
import { base58, base64 } from "@scure/base";
import { buildNep413Hash } from "@/lib/nep413";
import {
  pg,
  sb,
  type PgCampaign,
  type PgCollectionTitle,
  type PgNft,
  type PgRedemption,
  type PgUser,
} from "../db/pg";
import { evaluateFarmTokenCooldown, evaluateFarmTokenCooldownReadonly } from "../farmTokenCooldown";
import { getSisterWallets, requireLinkedTelegram } from "./user-shared";
import { portalProfile } from "./user-portal-profile";
import {
  clearCurrentWallet,
  getCurrentWallet,
  isAdminWallet,
  isPayoutsAdminWallet,
  isTgBypassWallet,
  requirePayoutsAdmin,
  setCurrentWallet,
} from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { mcpExec } from "../db/mcpClient";
import { parseRewardTiers, pickWeightedReward, rollReward } from "../random";
import { sameTitle, normalizeTitle } from "@/lib/normalizeTitle";
import {
  fetchAdminFtTransferHistory,
  fetchSendlerNftById,
  fetchSendlerNftsByOwner,
  fetchSendlerNftsByTitle,
} from "../sendler";
import {
  ftTransfer,
  humanToRaw,
  ensureStorageDeposit,
  getOperatingBalanceRaw,
  getOperatingNearBalance,
  hasEnough,
  invalidateBalanceCache,
  verifyFtTransfer,
} from "../near";
import {
  signAndSendSafe,
  ftTransferAction,
  checkTxStatus,
  getAdminAccountId,
  type TxStatus,
} from "../nearSafe";
import { notifyLowBalanceDaily } from "../tg";
import { getReputationForWallets } from "../reputation";
import { requireFreshClient } from "../buildGate";

// Maintenance mode: MAINTENANCE_MODE=true в Vercel env переключает сайт в
// режим «системные работы» для всех кроме админов. Без редеплоя через
// Vercel CLI: `vercel env add MAINTENANCE_MODE` / `vercel env rm`.
function isMaintenanceMode(): boolean {
  return (process.env.MAINTENANCE_MODE ?? "").toLowerCase() === "true";
}

// Закрытая бета: BETA_ADMIN_ONLY=true открывает сайт только admin-кошелькам
// (ADMIN_WALLETS), остальные видят экран «идёт закрытое тестирование».
// В отличие от MAINTENANCE_MODE (который через AppShell гейтит только часть
// роутов), этот флаг читается в __root.tsx и блокирует ЛЮБОЙ роут.
// Тоггл без редеплоя: `vercel env add BETA_ADMIN_ONLY` / `vercel env rm`.
function isBetaAdminOnly(): boolean {
  return (process.env.BETA_ADMIN_ONLY ?? "").toLowerCase() === "true";
}

export const getYuplandStatus = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { linked: false as const, configured: false };

  // Считаем «подключённым» если есть grant ИЛИ есть профиль на портале
  // с этим near_account_id. Старая логика требовала grant — теперь
  // живём напрямую от БД, grant служит только историческим маркером.
  const grant = await pg.yuplandGrants.findOne({ wallet });

  // Профилей на портале бывает несколько — по одному на кошелёк-сестру.
  const profile = await portalProfile<{
    energy_balance?: number | null;
    minidar_balance?: number | null;
  }>(wallet, "id,energy_balance,minidar_balance");

  if (!profile) {
    return {
      linked: !!grant,
      configured: true,
      energyBalance: null,
    } as const;
  }

  return {
    linked: true as const,
    configured: true,
    energyBalance: profile.energy_balance ?? 0,
    minidarBalance: profile.minidar_balance ?? 0,
  };
});

/**
 * Профиль юзера из Yupland-портала (public.profiles): уровень, XP, статус.
 * Mapping: yuplink.users.wallet ↔ public.profiles.near_account_id.
 * Возвращает null если профиль не найден на портале.
 */
export const getYuplandProfile = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  const { sbPublic } = await import("../db/pg");
  const profile = await portalProfile<{
    id?: string;
    level?: number | null;
    experience_points?: number | null;
    energy_balance?: number | null;
    current_status?: string | null;
    status_color?: string | null;
    avatar_url?: string | null;
    display_name?: string | null;
    minidar_balance?: number | null;
    tokens_balance?: number | null;
  }>(
    wallet,
    "id,level,experience_points,energy_balance,current_status,status_color,avatar_url,display_name,minidar_balance,tokens_balance",
  );
  if (!profile) return null;
  const { data: lvl } = await sbPublic
    .from("levels_with_progress")
    .select(
      "level_number,required_xp,xp_needed_for_level,previous_level_xp,name,status_title,status_color,icon,rewards",
    )
    .eq("level_number", profile.level ?? 1)
    .maybeSingle();
  const xp = profile.experience_points ?? 0;
  const prevXp = lvl?.previous_level_xp ?? 0;
  const nextXp = lvl?.required_xp ?? 0;
  const progressPct =
    nextXp > prevXp ? Math.min(100, ((xp - prevXp) / (nextXp - prevXp)) * 100) : 0;
  return {
    userId: profile.id as string,
    level: profile.level ?? 1,
    xp,
    nextLevelXp: nextXp,
    progressPct: Math.round(progressPct),
    currentStatus: profile.current_status as string | null,
    statusColor: profile.status_color as string | null,
    avatarUrl: profile.avatar_url as string | null,
    displayName: profile.display_name as string | null,
    levelTitle: (lvl?.status_title as string) ?? "",
    levelIcon: (lvl?.icon as string) ?? null,
    levelName: (lvl?.name as string) ?? "",
    minidarBalance: Number(profile.minidar_balance ?? 0),
    tokensBalance: Number(profile.tokens_balance ?? 0),
  };
});

/**
 * Подписка юзера на Yupland-портале (public.user_subscriptions + tiers).
 * Возвращает активную подписку (status='active', expires_at > now) или null.
 *
 * Уровень → скидка на покупку билетов в нашем магазине:
 *   tier.level=1 → 5%, level=2 → 10%, level=3 → 15%.
 * Применяется ПОВЕРХ объёмной скидки оффера.
 */
export function subscriptionDiscountPct(level: number | null | undefined): number {
  if (!level || level < 1) return 0;
  if (level === 1) return 5;
  if (level === 2) return 10;
  return 15; // level >=3
}

/**
 * Внутренний helper: вернуть {discountPct, level} активной подписки для wallet.
 * Используется в purchaseTickets* и listMyShopOffers чтобы не дублировать
 * SQL. Возвращает {discountPct:0,level:0} если подписки нет.
 */
export async function fetchSubscriptionDiscount(
  wallet: string,
): Promise<{ discountPct: number; level: number }> {
  try {
    // Подписка — привилегия АККАУНТА (per-TG). Ищем по всем кошам аккаунта и
    // берём высший тир: иначе на сестре без своей строки подписки скидка=0.
    const sisters = await getSisterWallets(wallet);
    const { sbPublic } = await import("../db/pg");
    const { data: profiles } = await sbPublic
      .from("profiles")
      .select("id")
      .in("near_account_id", sisters);
    const ids = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (ids.length === 0) return { discountPct: 0, level: 0 };
    const { data: subs } = await sbPublic
      .from("user_subscriptions")
      .select("tier_id")
      .in("profile_id", ids)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    const tierIds = Array.from(
      new Set(((subs ?? []) as Array<{ tier_id: string }>).map((s) => s.tier_id)),
    );
    if (tierIds.length === 0) return { discountPct: 0, level: 0 };
    const { data: tiers } = await sbPublic
      .from("subscription_tiers")
      .select("level")
      .in("id", tierIds);
    const lvl = Math.max(
      0,
      ...((tiers ?? []) as Array<{ level?: number }>).map((t) => t.level ?? 0),
    );
    return { discountPct: subscriptionDiscountPct(lvl), level: lvl };
  } catch {
    return { discountPct: 0, level: 0 };
  }
}

/**
 * Округление цены ВВЕРХ после применения процентной скидки. Защищает нас
 * от ситуации "клиент шлёт меньше из-за скидки 5% от 1 → ожидаем >=1".
 */
function applyDiscountCeil(price: number, discountPct: number): number {
  if (discountPct <= 0 || price <= 0) return price;
  const factor = (100 - discountPct) / 100;
  return Math.max(1, Math.ceil(price * factor));
}

export const getMySubscription = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  // Подписка — по всему аккаунту (per-TG): ищем по всем кошам, берём активную
  // с наибольшим сроком, иначе на сестре без своей строки показывало «нет».
  const sisters = await getSisterWallets(wallet);
  const { sbPublic } = await import("../db/pg");
  const { data: profiles } = await sbPublic
    .from("profiles")
    .select("id")
    .in("near_account_id", sisters);
  const profileIds = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (profileIds.length === 0) return null;
  const { data: sub } = await sbPublic
    .from("user_subscriptions")
    .select("id,tier_id,status,started_at,expires_at,price_paid_darai,near_account_id")
    .in("profile_id", profileIds)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return null;
  const subRow = sub as {
    id: string;
    tier_id: string;
    status: string;
    started_at: string;
    expires_at: string;
  };
  const { data: tier } = await sbPublic
    .from("subscription_tiers")
    .select("id,slug,title,level,color,icon")
    .eq("id", subRow.tier_id)
    .maybeSingle();
  const t = tier as {
    slug: string;
    title: string;
    level: number;
    color: string | null;
    icon: string | null;
  } | null;
  return {
    id: subRow.id,
    tierId: subRow.tier_id,
    level: t?.level ?? 0,
    slug: t?.slug ?? null,
    title: t?.title ?? null,
    color: t?.color ?? null,
    icon: t?.icon ?? null,
    startedAt: subRow.started_at,
    expiresAt: subRow.expires_at,
    discountPct: subscriptionDiscountPct(t?.level),
  };
});

/**
 * Ачивки текущего юзера: каталог + статус (earned/locked).
 * Берёт из public.achievements + public.user_achievements (через profiles.id).
 */
export const getMyYuplandAchievements = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { earned: [], locked: [], total: 0 };
  const { sbPublic } = await import("../db/pg");
  const profile = await portalProfile<{ id?: string }>(wallet, "id");
  if (!profile) return { earned: [], locked: [], total: 0 };
  const userId = profile.id as string;

  const { data: catalog } = await sbPublic
    .from("achievements")
    .select(
      "id,name,description,icon,points,category,difficulty,reward_kind,reward_amount,reward_nft_name",
    )
    .order("points", { ascending: false });
  const all = (catalog ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    points: number | null;
    category: string | null;
    difficulty: string | null;
    reward_kind: string | null;
    reward_amount: number | null;
    reward_nft_name: string | null;
  }>;

  const { data: mine } = await sbPublic
    .from("user_achievements")
    .select("achievement_id,earned_at")
    .eq("user_id", userId);
  const earnedMap = new Map(
    ((mine ?? []) as Array<{ achievement_id: string; earned_at: string }>).map((m) => [
      m.achievement_id,
      m.earned_at,
    ]),
  );

  const earned: typeof all = [];
  const locked: typeof all = [];
  for (const a of all) {
    if (earnedMap.has(a.id)) earned.push(a);
    else locked.push(a);
  }
  return {
    earned: earned.map((a) => ({ ...a, earnedAt: earnedMap.get(a.id) })),
    locked,
    total: all.length,
  };
});

export const unlinkYupland = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  await pg.yuplandGrants.delete({ wallet });
  return { ok: true };
});

export const purchaseTicketsViaEnergy = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        offerId: z.string().min(1),
        // Сколько паков купить за раз. priceEnergy и tickets умножаются на qty.
        quantity: z.number().int().positive().max(50).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    assertNotMaintenance();
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    await requireLinkedTelegram(wallet);

    const offer = await pg.ticketShopOffers.findFirst({
      id: data.offerId,
      active: true,
    });
    if (!offer) throw new Error("Оффер не найден или отключён");

    // Профиль на портале — нужен и для baseline-проверки баланса, и для
    // INSERT в energy_transactions (там user_id = profile.id).
    const { sbPublic } = await import("../db/pg");
    const profile = await portalProfile<{ id?: string; energy_balance?: number | null }>(
      wallet,
      "id,energy_balance",
    );
    if (!profile) {
      throw new Error("Профиль Yupland не найден для этого кошелька");
    }

    const qty = data.quantity;
    // Только предложение с ценой в энергии: у токеновой строки и тарифа в $ её
    // нет, и списание нуля отдало бы билеты даром.
    (await import("./user-shop-usd")).assertEnergyOffer(offer);
    const totalEnergyBase = offer.price_energy * qty;
    const sub = await fetchSubscriptionDiscount(wallet);
    const totalEnergy = applyDiscountCeil(totalEnergyBase, sub.discountPct);
    const totalTickets = offer.tickets * qty;

    if ((profile.energy_balance ?? 0) < totalEnergy) {
      throw new Error("Недостаточно энергии");
    }

    // Идемпотентность: ключ + проверка через unique-индекс в БД.
    const idempotencyKey = `gd:tickets:${nanoid(16)}`;

    // Atomic UPDATE с условием — если энергии стало меньше пока считали,
    // строка не обновится и мы откатим.
    const { data: updated, error: upErr } = await sbPublic
      .from("profiles")
      .update({ energy_balance: (profile.energy_balance ?? 0) - totalEnergy })
      .eq("id", profile.id)
      .gte("energy_balance", totalEnergy)
      .select("id,energy_balance")
      .maybeSingle();
    if (upErr || !updated) {
      throw new Error("Не удалось списать энергию (race condition)");
    }

    // Фиксируем транзакцию для аудита/портала.
    await sbPublic.from("energy_transactions").insert({
      user_id: profile.id,
      amount: -totalEnergy,
      transaction_type: "partner_debit",
      currency: "energy",
      description: `golden-drop tickets ×${qty}`,
      idempotency_key: idempotencyKey,
    });

    await pg.ticketPurchases.insert({
      id: `tp_${nanoid(10)}`,
      wallet,
      offer_id: offer.id,
      tickets_added: totalTickets,
      energy_spent: totalEnergy,
      yupland_tx_id: null,
      idempotency_key: idempotencyKey,
    });

    return {
      ok: true,
      ticketsAdded: totalTickets,
      energySpent: totalEnergy,
      newEnergyBalance: updated.energy_balance,
      quantity: qty,
    };
  });

// ─── Публичный поиск NFT по token_id ──────────────────────────────────────
// Не требует подключённого кошелька. Для покупателей / третьих лиц:
// «погашен ли этот NFT, в каких дропах участвовал».

const SENDLER_LOOKUP_CONTRACT = "yuplandshop.mintbase1.near";

function maskWallet(w: string): string {
  if (!w) return "";
  if (w.length <= 14) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}
