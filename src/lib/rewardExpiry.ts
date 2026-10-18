// Срок награды очереди на клиенте и сервере: ближайший срок группы и сколько
// до него осталось.
//
// Правило владельца (28.09.2026): добыча разграбленного магического сундука
// ждёт в «Добыче» 24 часа и сгорает; в окне у таких наград виден остаток.
// Срок — мс эпохи или null (бессрочная). Старый сервер поля не отдаёт —
// undefined читаем как «бессрочная», чтобы новый клиент не прятал награды на
// окне выката.
const MIN_MS = 60_000;

/** Ближайший из двух сроков: бессрочная награда срок группы не отодвигает. */
export function soonestExpiry(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

/**
 * Остаток до сгорания целыми часами и минутами, ВНИЗ: «23 ч 59 мин» при
 * 23:59:40 честнее, чем «24 ч». null — бессрочная или уже сгорела.
 */
export function rewardTimeLeft(
  expiresAt: number | null | undefined,
  now = Date.now(),
): { h: number; m: number } | null {
  if (expiresAt == null) return null;
  const left = expiresAt - now;
  if (!(left > 0)) return null;
  const min = Math.floor(left / MIN_MS);
  return { h: Math.floor(min / 60), m: min % 60 };
}

/** Ближайшее сгорание среди наград окна «Добыча»; null — сроков нет. */
export function nextRewardExpiry(
  sources: ReadonlyArray<{ rewards: ReadonlyArray<{ expiresAt?: number | null }> }> | undefined,
): number | null {
  let next: number | null = null;
  for (const s of sources ?? []) for (const r of s.rewards) next = soonestExpiry(next, r.expiresAt);
  return next;
}
