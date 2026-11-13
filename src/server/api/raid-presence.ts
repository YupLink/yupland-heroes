// Отметка «в игре сейчас» (migrations/presence-01.sql). Ничего не ждёт и не бросает.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { ONLINE_SEC, PRESENCE_EVERY_SEC } from "@/lib/raid/presence";

const marked = new Map<string, number>();

/** Игрок сейчас на карте. Процессов несколько — повтор отсекает и сама база. */
export function markOnline(account: string | null | undefined): void {
  if (!account) return;
  const now = Date.now();
  if (now - (marked.get(account) ?? 0) < PRESENCE_EVERY_SEC * 1000) return;
  marked.set(account, now);
  if (marked.size > 5000) {
    for (const [k, at] of marked) if (now - at >= PRESENCE_EVERY_SEC * 1000) marked.delete(k);
  }
  const a = sqlStr(account);
  void mcpExec(
    `INSERT INTO yuplink.raid_presence AS s (account_id, seen_at) VALUES (${a}, now())
     ON CONFLICT (account_id) DO UPDATE SET seen_at = now()
      WHERE s.seen_at < now() - interval '${PRESENCE_EVERY_SEC} seconds'
     RETURNING s.account_id;`,
    { wrapJsonCte: true },
  ).catch((e) => {
    marked.delete(account);
    console.warn("[online]", e instanceof Error ? e.message : e);
  });
}

/** SQL: аккаунт строки `s` (raid_presence) сейчас в игре. */
export const ONLINE_SQL = (s: string): string =>
  `${s}.seen_at > now() - interval '${ONLINE_SEC} seconds'`;
