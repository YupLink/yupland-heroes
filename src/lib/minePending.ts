// Живой расчёт добычи шахты у клиента: секундомер идёт от захвата, добыча
// капает ЦЕЛЫМИ часами, уже собранное вычтено. Та же арифметика в SQL
// raid_mine_pending — здесь для мгновенного показа без запроса к серверу.
//
// Дробные часы (04.09) заставляли плашку «Собрать с шахт» пересчитываться
// каждую секунду: числа дёргались над картой и мешали смотреть. Владелец
// вернул прежнее правило — час отработан, час и капнул, счётчик меняется
// раз в час.
//
// Считаем floor ОСТАТКА, а не floor всего времени: у части шахт claimed_hours
// остался дробным после вчерашних сборов, и хвост должен доживать до
// следующего целого часа, а не пропадать.
const HOUR_MS = 3_600_000;

/** Сколько часов (с долями) накопилось и ещё не собрано. */
export function livePendingHours(
  capturedAt: number | null,
  claimedHours: number,
  now = Date.now(),
  /** Предел добычи от захвата (лесопилка острова — неделя); нет — без предела. */
  maxHours?: number | null,
): number {
  if (!capturedAt) return 0;
  const raw = (now - capturedAt) / HOUR_MS;
  const hours = maxHours && maxHours > 0 ? Math.min(raw, maxHours) : raw;
  return Math.max(0, Math.floor(hours - (claimedHours || 0)));
}

/** Готовая к сбору добыча (часы × выход), округлено до 4 знаков (как в SQL). */
export function livePendingAmount(
  capturedAt: number | null,
  claimedHours: number,
  yieldAmount: number,
  now = Date.now(),
  maxHours?: number | null,
): number {
  const raw = livePendingHours(capturedAt, claimedHours, now, maxHours) * (yieldAmount || 0);
  return Math.round(raw * 10_000) / 10_000;
}

/** Часы:минуты:секунды с момента захвата — для секундомера. */
export function elapsedClock(capturedAt: number | null): string | null {
  if (!capturedAt) return null;
  const s = Math.max(0, Math.floor((Date.now() - capturedAt) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}
