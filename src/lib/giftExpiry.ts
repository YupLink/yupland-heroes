// Срок подарка на клиенте: жив ли ещё и сколько часов осталось.
//
// Сервер отдаёт expiresAt числом (мс эпохи) или null — бессрочный. Считаем
// от Date.now(), как секундомер шахт (minePending): между опросами список не
// перечитывается, а подпись «сгорит через N ч» и исчезновение сгоревшего
// должны жить сами. Старый сервер поля не отдаёт — undefined читаем как
// «бессрочный», чтобы новый клиент не прятал подарки на окне выката.
const HOUR_MS = 3_600_000;

/** Подарок ещё можно забрать. */
export function isLiveGift(expiresAt: number | null | undefined, now = Date.now()): boolean {
  return expiresAt == null || expiresAt > now;
}

/**
 * Целых часов до сгорания; null — бессрочный. Считаем ВНИЗ (floor): «через
 * 47 ч» при 47,5 честнее, чем «через 48», а в последний час получаем 0 —
 * это сигнал показать «меньше чем через час», не «через 1 ч».
 */
export function giftHoursLeft(
  expiresAt: number | null | undefined,
  now = Date.now(),
): number | null {
  if (expiresAt == null) return null;
  return Math.max(0, Math.floor((expiresAt - now) / HOUR_MS));
}
