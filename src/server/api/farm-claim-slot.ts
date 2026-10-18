// Замок на клейм фарма: одна выдача на аккаунт, событие и окно кулдауна.
//
// И билетный, и лайковый фарм читали время прошлого клейма, сравнивали с
// кулдауном и потом вставляли строку со свежим случайным id. Между чтением и
// вставкой успевало пройти второе нажатие — обе выдачи проходили. В проде так
// набралось 43 пары дублей по лайкам и 6 по билетам, крупнейший свип —
// 1404 лайка за нажатие.
//
// Теперь id строки клейма считается из аккаунта, события и окна: второе
// нажатие в том же окне упирается в первичный ключ, а не в удачу.
import { pg } from "../db/pg";

/** Минимальный промежуток между клеймами — он же ширина окна. */
export const CLAIM_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Ключ без хеширования: node:crypto тянет за собой серверный модуль в
 * клиентскую сборку и роняет её. Части просто чистим до безопасных символов —
 * колонка id текстовая, длины хватает.
 */
export function claimSlotId(prefix: string, eventId: string, account: string, now: number): string {
  const slot = Math.floor(now / CLAIM_WINDOW_MS);
  // Не режем, а кодируем: обрезка до сорока символов склеивала разные ключи в
  // один — «a.b.near» и «ab.near» делили окно и второй получал «уже собрано».
  const safe = (v: string) => encodeURIComponent(v).replace(/[^A-Za-z0-9_-]/g, "");
  return `${prefix}_${slot}_${safe(eventId)}_${safe(account)}`;
}

export function isDuplicateRow(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e);
  return /duplicate key|already exists|23505|unique constraint/i.test(msg);
}

/**
 * Аккаунт игрока — ключ окна. Без запасного пути на адрес: выдача идёт на
 * аккаунт, и окно, посчитанное по адресу, обходилось сменой кошелька.
 */
export async function claimAccountOf(wallet: string): Promise<string> {
  const { accountOf } = await import("./user-shared");
  return accountOf(wallet);
}
