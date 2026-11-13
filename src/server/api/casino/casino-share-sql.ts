// SQL доли владельцев казино (lib/casinoShare.ts, migrations/casino-share-01.sql).
import { sqlStr } from "@/server/api/raid-shared";
import { liveRewardSql } from "@/server/api/raid-reward-live";
import { CASINO_SHARE_PCT, CASINO_SHARE_START } from "@/lib/casinoShare";

/** id строки очереди доли — тот же, что кладёт queueEncounterReward по ключу cshare:… */
const rowIdSql = (p: string) => `'rr_' || md5('cshare:' || ${p}.day::text || ':' || ${p}.hero_id)`;

/** Подвести закончившиеся сутки (wrapJson): подведённые сейчас дни. */
export const settleSql = (): string =>
  `SELECT r_day::text AS day, r_profit::float8 AS profit, r_fund::float8 AS fund,
          r_heroes AS heroes, r_per_hero::float8 AS "perHero"
     FROM yuplink.casino_share_settle_due(${sqlStr(CASINO_SHARE_START)}::date, ${CASINO_SHARE_PCT});`;

/** Доли без строки в «Добыче» (wrapJson). */
export const unqueuedSql = `SELECT p.day::text AS day, p.hero_id AS "heroId",
       p.account_id AS account, p.amount::float8 AS amount
  FROM yuplink.casino_share_payout p
 WHERE p.queued_at IS NULL AND p.paid_at IS NULL
 ORDER BY p.day, p.hero_id LIMIT 200;`;

/** Строка встала — отметка, чтобы обход её не ставил снова (ключ всё равно не даст дубля). */
export const markQueuedSql = (day: string, heroId: string): string =>
  `UPDATE yuplink.casino_share_payout SET queued_at = now()
    WHERE day = ${sqlStr(day)}::date AND hero_id = ${sqlStr(heroId)} AND queued_at IS NULL;`;

/** Строку забрали больше 5 минут назад, а золото не выдано (процесс упал между ними). */
export const stuckSql = `SELECT p.day::text AS day, p.hero_id AS "heroId", p.account_id AS account
  FROM yuplink.casino_share_payout p
  JOIN yuplink.raid_reward rr ON rr.id = ${rowIdSql("p")}
 WHERE p.paid_at IS NULL AND rr.claimed_at < now() - interval '5 minutes'
   AND ${liveRewardSql("rr")}
 LIMIT 50;`;

/** Вернуть строку в «Добычу»: выдача не вышла — игрок заберёт сам. Уже выдана — не трогать. */
export const releaseSql = (day: string, heroId: string): string =>
  `UPDATE yuplink.raid_reward SET claimed_at = NULL
    WHERE id = 'rr_' || md5(${sqlStr(`cshare:${day}:${heroId}`)})
      AND EXISTS (SELECT 1 FROM yuplink.casino_share_payout p
                   WHERE p.day = ${sqlStr(day)}::date AND p.hero_id = ${sqlStr(heroId)}
                     AND p.paid_at IS NULL);`;

/** Выдать долю (wrapJson): золото на счёт и списание из пула — одним вызовом базы. */
export const paySql = (day: string, heroId: string, account: string): string =>
  `SELECT yuplink.casino_share_pay(${sqlStr(day)}::date, ${sqlStr(heroId)}, ${sqlStr(account)}) AS res;`;
