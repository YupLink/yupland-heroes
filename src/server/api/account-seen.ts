// Когда игрок последний раз был в игре (владелец, 15.10.2026: «если человек
// 7 дней не заходил в игру, то его лагерь для других не отображается»).
//
// Отметку ставим при открытии игры (getSession) и пока игрок на карте (опрос
// соседей раз в минуту) — второе нужно тем, кто не закрывает вкладку неделями.
// Пишем не чаще раза в 10 минут на аккаунт: память процесса отсекает лишние
// вызовы, условие в UPDATE — то, что проскочило с других процессов.
// Отметка — фоном: вход в игру от неё не зависит и из-за неё не падает.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";

/** Лагерь виден другим, пока игрок заходил не раньше стольких дней назад. */
export const CAMP_VISIBLE_DAYS = 7;

const EVERY_MS = 10 * 60_000;
const marked = new Map<string, number>();

/** Отметить, что игрок сейчас в игре. Ничего не ждёт и не бросает. */
export function markSeen(account: string | null | undefined): void {
  if (!account) return;
  const now = Date.now();
  if (now - (marked.get(account) ?? 0) < EVERY_MS) return;
  marked.set(account, now);
  if (marked.size > 5000) {
    for (const [k, at] of marked) if (now - at >= EVERY_MS) marked.delete(k);
  }
  void mcpExec(
    `UPDATE yuplink.accounts SET last_seen_at = now()
      WHERE id = ${sqlStr(account)}
        AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes');`,
    { wrapJson: false },
  ).catch((e) => {
    marked.delete(account);
    console.warn("[seen]", e instanceof Error ? e.message : e);
  });
}

/**
 * SQL-условие «игрок заходил за последние 7 дней» для строки позиции `p`.
 * Отметки ещё нет — считаем от последнего шага.
 */
export const RECENTLY_SEEN_SQL = (p: string): string =>
  `COALESCE((SELECT a.last_seen_at FROM yuplink.accounts a WHERE a.id = ${p}.account_id), ${p}.updated_at)
     > now() - interval '${CAMP_VISIBLE_DAYS} days'`;
