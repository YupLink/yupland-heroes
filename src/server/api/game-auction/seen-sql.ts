// SQL счётчика новых лотов (фронт, 26.10.2026: значок на «Торговле» и у
// «Аукционов»). Лот новый для аккаунта, пока нет строки auction_seen —
// отметку ставит только явный показ (markAuctionsSeen), ставки и продление
// срока лот новым не делают: учёт по id лота, не по времени изменения.
import { sqlStr } from "../raid-shared";

/** Больше id за одну отметку не принимаем. */
export const SEEN_MAX_IDS = 200;

/**
 * Лот, видимый игроку в listAuctions и доступный для ставки (то же, что
 * проверяет auction_place_bid): статус live и срок не вышел. Свой лот игрока
 * (аукционный дом) не в счёт — он его выставил и так видел.
 */
const liveForSql = (acc: string): string =>
  `a.status = 'live' AND a.end_at > now() AND a.seller_account_id IS DISTINCT FROM ${acc}`;

/** Точное число непросмотренных действующих лотов — без лимита выдачи. */
export function unreadCountSql(accountId: string): string {
  const acc = sqlStr(accountId);
  return `SELECT count(*)::int AS n
  FROM yuplink.auction a
 WHERE ${liveForSql(acc)}
   AND NOT EXISTS (SELECT 1 FROM yuplink.auction_seen s
                    WHERE s.account_id = ${acc} AND s.auction_id = a.id);`;
}

/**
 * Отметить показанные лоты. Пишутся только id, которые сейчас считаются в
 * счётчике (действующие, не свои); несуществующие и завершённые отпадают сами,
 * повтор ничего не меняет (ON CONFLICT DO NOTHING). Лоты, которых нет в
 * списке, не трогаем — выставленные в ту же секунду остаются новыми.
 */
export function markSeenSql(accountId: string, auctionIds: string[]): string | null {
  const ids = [...new Set(auctionIds)].slice(0, SEEN_MAX_IDS);
  if (ids.length === 0) return null;
  const acc = sqlStr(accountId);
  return `INSERT INTO yuplink.auction_seen (account_id, auction_id)
SELECT ${acc}, a.id FROM yuplink.auction a
 WHERE a.id IN (${ids.map(sqlStr).join(",")}) AND ${liveForSql(acc)}
ON CONFLICT (account_id, auction_id) DO NOTHING;`;
}
