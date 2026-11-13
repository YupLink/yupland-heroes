// Зачарованный экземпляр артефакта в расчёте статов (владелец, 28.10.2026):
// все числовые характеристики ЭТОГО экземпляра × (1 + pct/100), каждая вверх.
//
// Одна точка для всех: загрузчики артефактов (hero-load — бой и сила героя,
// heroes-gear-read — окно снаряжения, «надеть лучшее», торговля/алхимия/рыбалка)
// пропускают строку через withEnchant, карточки инвентаря и рынка героев — через
// enchantStatsOf. Само умножение — applyEnchant, копий формулы нет.
import { applyEnchant } from "./enchant";

/** Числовые характеристики артефакта — те же имена полей, что у GearPiece и карточек. */
export const ENCHANT_STAT_FIELDS = [
  "statAmount",
  "raceAmount",
  "specAmount",
  "landAmount",
  "fishBonusPct",
] as const;
type StatField = (typeof ENCHANT_STAT_FIELDS)[number];
export type EnchantableStats = { [K in StatField]?: number | null };

const finite = (v: unknown): number | null =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

/** Экземпляр с зачарованием pct (и минусовым −99…−1). Нет зачарования (null/0) — как есть; пустые поля не трогаем. */
export function enchantStatsOf<T extends EnchantableStats>(
  p: T,
  pct: number | null | undefined,
): T {
  const k = finite(pct);
  if (k == null || k === 0) return p;
  const nums: Record<string, number> = {};
  for (const f of ENCHANT_STAT_FIELDS) {
    const v = finite(p[f]);
    if (v != null) nums[f] = v;
  }
  return { ...p, ...applyEnchant(nums, k) };
}

/** Строка загрузчика с полем enchantPct (item_enchant.pct) → числа для расчёта. */
export function withEnchant<T extends EnchantableStats & { enchantPct?: number | null }>(p: T): T {
  return enchantStatsOf(p, p.enchantPct);
}

/** Артефакт так, как его показывает лавка: числа и подписи к ним. */
export type EnchantStatSource = EnchantableStats & {
  statType?: string | null;
  race?: string | null;
  specialization?: string | null;
  land?: string | null;
  landName?: string | null;
};

/** Ключ строки «рыбалка, %» — подпись через metaLabel, как у остальных. */
export const ENCHANT_FISH_KEY = "Fishing";

/**
 * Статы для окна лавки: подпись → число. Подписи — то, что клиент переводит
 * metaLabel: основной стат («Attack»), раса и специализация бонуса, имя земли,
 * рыбалка. Нули и пустое не показываем — их нет и на самом предмете.
 */
export function enchantStatRecord(p: EnchantStatSource): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (label: string | null | undefined, v: unknown) => {
    const n = finite(v);
    const key = (label ?? "").trim();
    if (key && n) out[key] = (out[key] ?? 0) + n;
  };
  put(p.statType, p.statAmount);
  put(p.race, p.raceAmount);
  put(p.specialization, p.specAmount);
  put(p.landName || p.land, p.landAmount);
  put(ENCHANT_FISH_KEY, p.fishBonusPct);
  return out;
}
