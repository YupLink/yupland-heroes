// Лайки за босса острова (§8.47): сколько уже набрано с боссов всех островов
// аккаунта — и сколько дать за этого. Правило чисел — в lib/raid/island/likes.
import { mcpExec } from "../../../db/mcpClient";
import { sqlStr } from "../../raid-shared";
import { liveRewardSql } from "../../raid-reward-live";
import { ISLAND_PREFIX } from "@/lib/raid/island/ids";
import { islandBossLikes } from "@/lib/raid/island/likes";

/**
 * Считаем и не забранное из «Добычи»: иначе пять боссов без «Забрать» дали бы
 * жирно каждый. Условие повторяет частичный индекс raid_reward_isle_likes
 * (миграция isle-likes-01) — без него это скан всей очереди наград.
 */
export async function islandLikesEarned(account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT COALESCE(sum(reward_amount), 0) AS n FROM yuplink.raid_reward
      WHERE account_id = ${sqlStr(account)} AND reward_kind = 'likes'
        AND left(location_id, ${ISLAND_PREFIX.length}) = ${sqlStr(ISLAND_PREFIX)}
        AND ${liveRewardSql()};`,
    { wrapJson: true },
  )) as Array<{ n: number | string }>;
  return Number(rows?.[0]?.n) || 0;
}

/** Лайков за босса острова этому аккаунту. */
export async function islandLikesFor(account: string): Promise<number> {
  return islandBossLikes(await islandLikesEarned(account));
}
