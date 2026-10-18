// Урон цели в бою бета-рейда: эталонная формула роста и настройка админа.
//
// Вынесено из encounter-sim.ts, чтобы симуляция осталась ≤250 строк (§13.1).
// Формула — та же, что у обычного рейда (raid-combat.ts).
import { parseRange } from "./abilities";

const DMG_BASE = 80;
const DMG_GROWTH = 1.6;
const DMG_GROWTH_CAP_ROUND = 5;
const DMG_VARIANCE = 0.15;

export const rollIn = ([lo, hi]: [number, number]): number =>
  lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * Урон цели по игроку на N-м раунде БЕЗ настройки админа:
 * 80 · 1.6^(min(N,5)-1) — эталон обычного рейда.
 */
export const roundDamage = (round: number, base: number = DMG_BASE): number =>
  Math.round(base * Math.pow(DMG_GROWTH, Math.min(round, DMG_GROWTH_CAP_ROUND) - 1));

/**
 * Сколько цель бьёт за удар — диапазон для показа игроку («59-664»).
 * Считается по той же логике, что targetDamageOf, только границами:
 *   • фикс «250»    → 250–250 (бьёт ровно столько);
 *   • «10-1000»     → 10–1000 (случайное в диапазоне);
 *   • пусто         → эталон: 68 (1-й раунд, −15%) … 603 (потолок роста, +15%).
 * Саму формулу игроку не показываем, только числа.
 */
export function targetDamageRange(damage?: string | number): { min: number; max: number } {
  const [lo, hi] = parseRange(damage);
  if (hi > 0) return { min: Math.max(1, lo), max: Math.max(1, hi) };
  const capMult = Math.pow(DMG_GROWTH, DMG_GROWTH_CAP_ROUND - 1);
  return {
    min: Math.max(1, Math.round(DMG_BASE * (1 - DMG_VARIANCE))),
    max: Math.max(1, Math.round(DMG_BASE * capMult * (1 + DMG_VARIANCE))),
  };
}

/**
 * Сколько цель бьёт в этом раунде. Что задал админ — то и бьёт:
 *   • «250»       → ровно 250 каждый раунд (фикс — значит фикс);
 *   • «10-1000»   → своё случайное число каждый раунд;
 *   • пусто       → эталонная формула с ростом по раундам и разбросом ±15%.
 * Раньше настройка админа была лишь БАЗОЙ для роста: при «250» босс бил
 * 223 → 455 → 963 → 1818, и отряд выбивало за десяток раундов.
 */
export function targetDamageOf(round: number, lo: number, hi: number): number {
  if (hi <= 0) {
    const variance = 1 + (Math.random() * 2 - 1) * DMG_VARIANCE;
    return Math.max(1, Math.round(roundDamage(round) * variance));
  }
  if (lo === hi) return Math.max(1, lo);
  return Math.max(1, rollIn([lo, hi]));
}
