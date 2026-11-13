// Кому игровой бот не может написать (владелец 04.11.2026, §8.106): Telegram
// отказал — «chat not found» (бота не запускали) или 403 (заблокировали).
// Такому игроку при входе в игру мини-апка один раз покажет родное окно
// Telegram «Разрешить боту писать» (castle-live/useTgWriteAccess); нажал
// «Разрешить» — строка уходит, письма пойдут.
//
// Запись — в фоне от отправки письма (tgGameBot): сбой базы письму не мешает.
import { mcpExec } from "@/server/db/mcpClient";

/** Отказ значит «писать некуда», а не ошибку текста письма. */
export function isUnreachable(status: number, body: string): boolean {
  if (status === 403) return true;
  return status === 400 && /chat not found/i.test(body);
}

const tgOk = (tg: number): boolean => Number.isSafeInteger(tg) && tg > 0;

export const noteUnreachableSql = (tg: number, status: number): string =>
  `INSERT INTO yuplink.tg_game_unreachable (telegram_id, status, failed_at)
   VALUES (${tg}, ${Math.trunc(status)}, now())
   ON CONFLICT (telegram_id) DO UPDATE SET status = EXCLUDED.status, failed_at = now()
   RETURNING telegram_id`;

/** Запомнить отказ; не бросает. */
export async function noteUnreachable(tg: number, status: number, body: string): Promise<void> {
  if (!tgOk(tg) || !isUnreachable(status, body)) return;
  await mcpExec(noteUnreachableSql(tg, status), { wrapJsonCte: true }).catch((e: unknown) =>
    console.warn("[tg-reach] запись:", e instanceof Error ? e.message : e),
  );
}

export const askDueSql = (tg: number): string =>
  `SELECT 1 AS due FROM yuplink.tg_game_unreachable
    WHERE telegram_id = ${tg} AND asked_at IS NULL LIMIT 1`;

/** Разрешил — строки нет (письма пойдут); отказал — больше не спрашиваем. */
export const askDoneSql = (tg: number, allowed: boolean): string =>
  allowed
    ? `DELETE FROM yuplink.tg_game_unreachable WHERE telegram_id = ${tg} RETURNING telegram_id`
    : `UPDATE yuplink.tg_game_unreachable SET asked_at = now()
        WHERE telegram_id = ${tg} RETURNING telegram_id`;

/** Спросить ли этого игрока сейчас. */
export async function askDue(tg: number): Promise<boolean> {
  if (!tgOk(tg)) return false;
  const rows = await mcpExec(askDueSql(tg), { wrapJson: true });
  return Array.isArray(rows) && rows.length > 0;
}

export async function askDone(tg: number, allowed: boolean): Promise<void> {
  if (!tgOk(tg)) return;
  await mcpExec(askDoneSql(tg, allowed), { wrapJsonCte: true });
}
