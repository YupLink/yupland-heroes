// Вид игрока в лавке зачарования (владелец, 28.10.2026): порядок ячеек —
// легендарные сверху, обычные снизу; превью «было → стало при успехе» по статам
// выбранного артефакта. Числа — той же applyEnchant, что считает сервер.
import { applyEnchant, ENCHANT_RARITIES, type EnchantRarity } from "@/lib/enchant/enchant";

const rank = (r: EnchantRarity): number => ENCHANT_RARITIES.indexOf(r);

/** legendary → epic → rare → common; внутри одной редкости — как пришли. */
export function spellsByRarity<T extends { rarity: EnchantRarity }>(list: T[]): T[] {
  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(b.s.rarity) - rank(a.s.rarity) || a.i - b.i)
    .map((x) => x.s);
}

export type PreviewTone = "up" | "down" | null;
export type PreviewNum = { n: number; tone: PreviewTone };
/** Стат: было и стало при успехе — одно число или пара «низ…верх». */
export type StatPreview = { key: string; before: number; after: PreviewNum[] };

/** Минус — красным, плюс — зелёным (как в итоге попытки). */
const tone = (pct: number): PreviewTone => (pct > 0 ? "up" : pct < 0 ? "down" : null);

/** Числовые статы × усиление заклинания: ровное — одно число, диапазон — «8…15». */
export function statPreview(
  stats: Record<string, number>,
  min: number,
  max: number,
): StatPreview[] {
  const nums = Object.fromEntries(Object.entries(stats).filter(([, v]) => Number.isFinite(v)));
  const lo = applyEnchant(nums, min);
  const hi = applyEnchant(nums, max);
  return Object.keys(nums).map((key) => {
    // Диапазон схлопнулся (0 → 0) — одно число; цвет, только если знак один.
    const same = Math.sign(min) === Math.sign(max);
    const after: PreviewNum[] =
      lo[key] === hi[key]
        ? [{ n: lo[key], tone: same ? tone(min) : null }]
        : [
            { n: lo[key], tone: tone(min) },
            { n: hi[key], tone: tone(max) },
          ];
    return { key, before: nums[key], after };
  });
}
