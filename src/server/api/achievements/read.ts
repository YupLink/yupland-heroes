// Ачивки игрока (§8.57): счётчики восьми занятий и перенесённые ачивки
// портала. Ступени, редкости и прибавки считает клиент той же чистой
// функцией (lib/achievements) — сервер отдаёт только числа.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { getCurrentWallet } from "@/server/auth";
import { accountIdOf } from "@/server/api/user-shared";
import { parseAchCounts } from "@/lib/achievements/tracks";
import type { AchCounts } from "@/lib/achievements/tracks";

export type PortalAchievement = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  points: number;
  earnedAt: string | null;
};

export type MyAchievements = { counts: AchCounts; portal: PortalAchievement[] };

/** Счётчики аккаунта: «занятие → число». */
export async function loadAchCounts(account: string): Promise<AchCounts> {
  const rows = (await mcpExec(
    `SELECT jsonb_object_agg(track, count) AS c FROM yuplink.account_achievement
      WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ c: unknown }>;
  return parseAchCounts(rows?.[0]?.c);
}

/**
 * Ачивки портала, полученные кошельками аккаунта уже после переноса
 * (миграция ach-01 перенесла всех разом): кошелёк привязали позже — его
 * старые ачивки догоняют здесь, один раз на аккаунт за жизнь процесса.
 */
const synced = new Set<string>();
async function syncPortal(account: string): Promise<void> {
  if (synced.has(account)) return;
  await mcpExec(
    `INSERT INTO yuplink.account_portal_achievement (account_id, achievement_id, earned_at)
     SELECT u.account_id, ua.achievement_id, min(ua.earned_at)
       FROM public.user_achievements ua
       JOIN public.profiles p ON p.id = ua.user_id
       JOIN yuplink.users u ON u.wallet = p.near_account_id
       JOIN yuplink.portal_achievement c ON c.id = ua.achievement_id
      WHERE u.account_id = ${sqlStr(account)}
      GROUP BY u.account_id, ua.achievement_id
     ON CONFLICT (account_id, achievement_id) DO NOTHING;`,
  )
    .then(() => synced.add(account))
    .catch((e: unknown) => console.warn("[achievements] портал не догнали:", e));
}

async function loadPortal(account: string): Promise<PortalAchievement[]> {
  const rows = (await mcpExec(
    `SELECT c.id, c.name, c.description, c.icon, COALESCE(c.points, 0) AS points,
            x.earned_at AS "earnedAt"
       FROM yuplink.account_portal_achievement x
       JOIN yuplink.portal_achievement c ON c.id = x.achievement_id
      WHERE x.account_id = ${sqlStr(account)}
      ORDER BY c.points DESC NULLS LAST, c.name;`,
    { wrapJson: true },
  )) as Array<PortalAchievement & { points: number | string }>;
  return (rows ?? []).map((r) => ({ ...r, points: Number(r.points) || 0 }));
}

export const getMyAchievements = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyAchievements> => {
    const wallet = getCurrentWallet();
    const account = wallet ? await accountIdOf(wallet) : null;
    if (!account) return { counts: {}, portal: [] };
    await syncPortal(account);
    const [counts, portal] = await Promise.all([loadAchCounts(account), loadPortal(account)]);
    return { counts, portal };
  },
);
