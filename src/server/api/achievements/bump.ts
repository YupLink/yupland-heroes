// Счёт занятий для ачивок (§8.57): сделал дело в игре — +N к своему
// счётчику. Пишем отдельным запросом и не ждём: ачивка не должна ни
// замедлять, ни ломать само действие (рубку, бой, рыбалку).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { AchTrackId } from "@/lib/achievements/tracks";

/** SQL прибавки: accountSql и nSql — готовые выражения SQL. Ноль и меньше — ничего. */
export function achievementBumpSql(accountSql: string, track: AchTrackId, nSql: string): string {
  return `INSERT INTO yuplink.account_achievement (account_id, track, count, updated_at)
  SELECT ${accountSql}, ${sqlStr(track)}, (${nSql})::bigint, now() WHERE (${nSql}) > 0
  ON CONFLICT (account_id, track)
  DO UPDATE SET count = yuplink.account_achievement.count + EXCLUDED.count, updated_at = now();`;
}

/** Засчитать n единиц занятия; ошибка — в лог, действие игрока не трогаем. */
export function bumpAchievement(
  account: string | null | undefined,
  track: AchTrackId,
  n = 1,
): void {
  const amount = Math.floor(n);
  if (!account || !(amount > 0)) return;
  mcpExec(achievementBumpSql(sqlStr(account), track, String(amount))).catch((e: unknown) =>
    console.warn(`[achievements] ${track} +${amount} не записалось:`, e),
  );
}

/**
 * Босс повержен — «Охотник» каждому, кто бил его в этой жизни (по логу
 * ударов, добивший там уже есть), а не только добившему: иначе крупного
 * босса мира засчитывал бы себе один последний удар. Зовут один раз на
 * жизнь босса — после захвата выдачи награды (payoutByTop).
 */
export function bumpBossKill(hpId: string, generation: number): void {
  const gen = Math.max(0, Math.floor(generation));
  mcpExec(
    `INSERT INTO yuplink.account_achievement (account_id, track, count, updated_at)
     SELECT DISTINCT r.account_id, 'hunter', 1, now() FROM yuplink.beta_raid_object_run r
      WHERE r.hp_id = ${sqlStr(hpId)} AND r.generation = ${gen}
        AND r.damage > 0 AND r.account_id IS NOT NULL
     ON CONFLICT (account_id, track)
     DO UPDATE SET count = yuplink.account_achievement.count + 1, updated_at = now();`,
  ).catch((e: unknown) => console.warn("[achievements] hunter не записалось:", e));
}

/**
 * Выкопан мешочек — «Кладоискатель», если закопал его не сам игрок: иначе
 * «закопал — выкопал» накручивало бы ачивку на месте. Клад острова и чужие
 * бугорки — в счёт.
 */
export function bumpDugBag(account: string, bagId: string): void {
  const acc = sqlStr(account);
  mcpExec(
    `INSERT INTO yuplink.account_achievement (account_id, track, count, updated_at)
     SELECT ${acc}, 'digger', 1, now()
      WHERE NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_op o
                         WHERE o.bag_id = ${sqlStr(bagId)} AND o.account_id = ${acc}
                           AND o.kind = 'bury' AND o.state = 'done')
     ON CONFLICT (account_id, track)
     DO UPDATE SET count = yuplink.account_achievement.count + 1, updated_at = now();`,
  ).catch((e: unknown) => console.warn("[achievements] digger не записалось:", e));
}
