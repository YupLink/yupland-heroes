// Метка пополнения и её чтение.
//
// Отдельным файлом, потому что метку ставит клиент (lib/ftTransfer), а читает
// сервер: держать строку в двух местах — верный способ однажды разъехаться и
// перестать узнавать собственные переводы.
import type { SendlerFtTransfer } from "@/server/sendler";

/** Что клиент пишет в memo при пополнении счёта (lib/ftTransfer.ts). */
export const TOP_UP_MEMO = "account top-up";

/**
 * Метка и подписант — ИЗ ЗАПИСИ ИНДЕКСЕРА, а не отдельным походом в цепь.
 *
 * Раньше здесь был запрос к NEAR RPC. Публичные узлы отдают 429 пачкой, и
 * каждый неудачный запрос означал, что пополнение не зачлось: догон молча
 * пропускал перевод, и деньги висели у игрока часами (в проде — до девяти).
 * Sendler отдаёт memo, sender_id и signer_id прямо в записи перевода, лишний
 * поход был не нужен изначально.
 *
 * Метки в записи нет — НЕ зачисляем. Считать чужой перевод пополнением по
 * неполным данным нельзя, и это ровно прежнее поведение.
 */
export function readTopUpMemo(t: SendlerFtTransfer): { memo: string; signer: string } | null {
  const raw = (t.raw ?? {}) as Record<string, unknown>;
  const memo = String(raw.memo ?? "");
  const signer = String(raw.signer_id ?? raw.sender_id ?? t.sender ?? "");
  if (!signer) return null;
  return { memo, signer };
}
