// Лавка зачарования (владелец, 28.10.2026): правила заклинаний одним чистым
// модулем — его читают и окно постройки, и сервер. Шансы, цена шагов усиления,
// итоговая цена и усиление статов артефакта. БД, сети и случайности здесь нет:
// бросок делает только сервер (secureRandom), а числа можно проверить тестом.
//
// Усиление шанса: успех × (1 + шаги × pct / 100), не выше 100. Остаток
// (100 − успех) делится между «без изменений» и «разрушением» в прежней
// пропорции. Цена шага i (0…4) = amount × 2^i; за k шагов — amount × (2^k − 1).
// Успех — все числовые статы ЭТОГО экземпляра × (1 + pct / 100), вверх.

export type EnchantRarity = "common" | "rare" | "epic" | "legendary";
export type EnchantCost = { kind: "resource" | "token" | "custom"; code: string; amount: number };
export type EnchantSpell = {
  id: string;
  name: string;
  rarity: EnchantRarity;
  boostMin: number; // %
  boostMax: number; // %
  success: number; // 0..100
  destroy: boolean;
  destroyChance: number; // 0..100-success
  cost: EnchantCost[]; // ≥ 1
  fx: { on: boolean; pct: number; cost: EnchantCost };
};

export const ENCHANT_FX_STEPS = 5;
export const ENCHANT_RARITIES: readonly EnchantRarity[] = ["common", "rare", "epic", "legendary"];

// Усиление бывает и отрицательным (владелец, 28.10: «от −20 до 50»): низ не
// меньше −99, чтобы стат не уходил в ноль и минус; верх — 1000.
export const ENCHANT_BOOST_MIN = -99;
export const ENCHANT_BOOST_MAX = 1000;

/** Пара усиления годится: целые, −99 ≤ min ≤ max ≤ 1000, не ровно 0. Одна проверка для формы и сервера. */
export function enchantBoostOk(min: number, max: number): boolean {
  const ok = (v: number) => Number.isInteger(v) && v >= ENCHANT_BOOST_MIN && v <= ENCHANT_BOOST_MAX;
  return ok(min) && ok(max) && min <= max && !(min === 0 && max === 0);
}

/** Процент со знаком: «+12», «−12» (минус типографский), «0». */
export const signedPct = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** Подпись зачарования экземпляра: «+12%», «−12%». */
export const enchantPctText = (pct: number): string => `${signedPct(pct)}%`;

/** Подпись ✦ в инвентаре и Таверне: «Зачарован −12%» / «Enchanted +12%». */
export const enchantSealText = (pct: number, ru: boolean): string =>
  `${ru ? "Зачарован" : "Enchanted"} ${enchantPctText(pct)}`;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const fin = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** Дробные проценты без хвостов float: 33.33333333 → 33.333333. */
const tidy = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Шаги усиления 0…5; выключенное усиление — всегда 0. */
export function enchantSteps(s: EnchantSpell, steps: number): number {
  if (!s.fx.on) return 0;
  return clamp(Math.floor(fin(steps)), 0, ENCHANT_FX_STEPS);
}

/** Шансы исходов в процентах (сумма 100) при выбранных шагах усиления. */
export function enchantOdds(
  s: EnchantSpell,
  steps: number,
): { success: number; none: number; destroy: number } {
  const base = clamp(fin(s.success), 0, 100);
  const k = enchantSteps(s, steps);
  const success = clamp(base * (1 + (k * Math.max(0, fin(s.fx.pct))) / 100), 0, 100);
  const destroy0 = s.destroy ? clamp(fin(s.destroyChance), 0, 100 - base) : 0;
  const none0 = 100 - base - destroy0;
  const rest = 100 - success;
  const share = none0 + destroy0 > 0 ? destroy0 / (none0 + destroy0) : 0;
  const destroy = tidy(rest * share);
  return { success: tidy(success), none: tidy(rest - rest * share), destroy };
}

/** Цена i-го шага усиления (i = 0…4): amount × 2^i. */
export function enchantStepCost(s: EnchantSpell, i: number): number {
  const n = clamp(Math.floor(fin(i)), 0, ENCHANT_FX_STEPS - 1);
  return Math.max(0, fin(s.fx.cost.amount)) * 2 ** n;
}

const costKey = (c: Pick<EnchantCost, "kind" | "code">): string => `${c.kind}:${c.code}`;

/** Сливает одинаковые позиции (вид + код), пустые и нулевые отбрасывает. */
export function mergeEnchantCost(list: EnchantCost[]): EnchantCost[] {
  const out = new Map<string, EnchantCost>();
  for (const c of list) {
    const amount = fin(c.amount);
    if (!c.code || !(amount > 0)) continue;
    const prev = out.get(costKey(c));
    if (prev) prev.amount = tidy(prev.amount + amount);
    else out.set(costKey(c), { kind: c.kind, code: c.code, amount });
  }
  return [...out.values()];
}

/** Вся цена попытки: база + шаги (amount × (2^k − 1)), одинаковые слиты. */
export function enchantTotalCost(s: EnchantSpell, steps: number): EnchantCost[] {
  const k = enchantSteps(s, steps);
  const fx =
    k > 0 ? [{ ...s.fx.cost, amount: Math.max(0, fin(s.fx.cost.amount)) * (2 ** k - 1) }] : [];
  return mergeEnchantCost([...s.cost, ...fx]);
}

/** Один стат × (1 + pct/100) с округлением вверх (и на минусе: 7 × 0,8 → 6); хвосты float не считаются. */
export function enchantStat(v: number, pct: number): number {
  const x = (fin(v) * (100 + fin(pct))) / 100;
  return Math.ceil(Math.round(x * 1e9) / 1e9);
}

/** Все числовые статы экземпляра × (1 + pct/100), каждый вверх. */
export function applyEnchant(stats: Record<string, number>, pct: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) out[k] = enchantStat(v, pct);
  return out;
}

export type EnchantCostView = EnchantCost & { name: string; image: string | null; have: number };
export type EnchantSpellView = Omit<EnchantSpell, "cost" | "fx"> & {
  cost: EnchantCostView[];
  fx: { on: boolean; pct: number; cost: EnchantCostView };
};
export type EnchantArtifactView = {
  itemId: string;
  name: string;
  image: string | null;
  rarity: string | null;
  stats: Record<string, number>; // уже с зачарованием
  enchant: { pct: number; spellName: string } | null;
  equipped: boolean;
};
export type EnchantCostOption = {
  kind: EnchantCost["kind"];
  code: string;
  name: string;
  image: string | null;
};
