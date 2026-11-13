// Метка «оплату этого нажатия уже вернули» поверх исходной ошибки выдачи
// заготовки (сервер — castle-architect/craft-core.ts). Игрок видит исходный
// текст (рюкзак полон и т. п., снимает метку castleArchitectText), а окно
// Архитектора по метке берёт новый ключ нажатия: старый ключ сервер ответил
// бы «попытка уже отменена» — лишний отказ на ровном месте.
// Без зависимостей: модуль читают и сервер, и клиент.

const MARK = "architect.refunded:";

/** Оплату по ключу этого нажатия уже вернули — после ключа той же оплаты. */
export const OP_REFUNDED = "architect.op_refunded";

/** Исходный текст ошибки с меткой «оплату вернули». */
export function markRefunded(message: string): string {
  return message.startsWith(MARK) ? message : MARK + message;
}

/** Снять метку: исходный текст и признак «оплату вернули». */
export function unmarkRefunded(raw: string): { refunded: boolean; message: string } {
  const s = raw.trim();
  return s.startsWith(MARK)
    ? { refunded: true, message: s.slice(MARK.length) }
    : { refunded: false, message: s };
}

/**
 * Ключ нажатия больше не годен: оплату по нему вернули (меткой или прямым
 * отказом сервера) — следующее нажатие начинает новую попытку. Прочие ошибки
 * ключ сохраняют: повтор с ним доводит оплаченную выдачу (статус 'repeat').
 */
export function attemptClosed(e: unknown): boolean {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const { refunded, message } = unmarkRefunded(raw);
  return refunded || message === OP_REFUNDED;
}
