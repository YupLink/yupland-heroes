import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { getSisterWallets } from "./user-shared";
import { subscriptionDiscountPct } from "./user-shop-subscription";
import { portalProfile } from "./user-portal-profile";

/**
 * Текущее состояние Yupland-привязки:
 *   linked=false — нужен OAuth-флоу
 *   linked=true  — есть grant; вернём свежий energy_balance с Yupland
 *   error        — grant был, но протух / отозван
 */
export const getYuplandStatus = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return { linked: false as const, configured: false };

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

export const getMySubscription = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) return null;
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
