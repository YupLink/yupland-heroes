// «Забрать охрану» со своей шахты (владелец, 22.10.2026): босс уходит в рюкзак
// тем же предметом, каким его покупают в лавке (стопка boss:<шаблон>), шахта
// остаётся без охраны и работает дальше. Цена — энергия по здоровью ШАХТЫ
// относительно починки, то есть по запасу службы шахты v2 (§8.59; владелец,
// 22.10.2026: «считать по здоровью шахты относительно починки»):
//
//   запас больше 50 %   — 100 энергии
//   от 20 до 50 %       — 200
//   меньше 20 %         — 300
//
// У шахт без запаса службы (энергия, пыль, старого образца) — 100. На DARAI-
// шахту охрану не ставят вовсе (lib/daraiMine). Тот же порог считает SQL
// (mine-guard-take-sql: guardTakeEnergySql по lifeNowSql).

/** Цена по ступеням запаса службы: [порог «больше», энергия]. */
export const GUARD_TAKE_HIGH = { above: 0.5, energy: 100 } as const;
export const GUARD_TAKE_MID = { from: 0.2, energy: 200 } as const;
export const GUARD_TAKE_LOW = { energy: 300 } as const;

/**
 * Энергия за «Забрать охрану». life — запас службы шахты 0..1 (mineLifeNow);
 * null — у шахты запаса нет (не v2): 100.
 */
export function guardTakeEnergy(life: number | null | undefined): number {
  if (life == null || !Number.isFinite(life)) return GUARD_TAKE_HIGH.energy;
  if (life > GUARD_TAKE_HIGH.above) return GUARD_TAKE_HIGH.energy;
  if (life >= GUARD_TAKE_MID.from) return GUARD_TAKE_MID.energy;
  return GUARD_TAKE_LOW.energy;
}

/** Префикс отказа «цена изменилась» (mine-guard-take-sql: guardTakeVerdict). */
export const GUARD_PRICE_CHANGED = "mineguard.price_changed";

/** Новая цена из отказа «цена изменилась»; иначе null. */
export function changedPriceOf(e: unknown): number | null {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const head = `${GUARD_PRICE_CHANGED}|`;
  if (!msg.startsWith(head)) return null;
  try {
    const need = Number((JSON.parse(msg.slice(head.length)) as { need?: unknown }).need);
    return Number.isFinite(need) && need > 0 ? need : null;
  } catch {
    return null;
  }
}
