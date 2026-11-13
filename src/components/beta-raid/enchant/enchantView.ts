// Чистые расчёты окна лавки зачарования: подпись усиления, чипы цены с
// «не хватает», шаги − / + и кого можно выбрать. Правила чисел — общий модуль
// @/lib/enchant/enchant (его же читает сервер); здесь только то, что видит игрок.
import {
  ENCHANT_FX_STEPS,
  enchantPctText,
  enchantStepCost,
  signedPct,
  enchantTotalCost,
  type EnchantArtifactView,
  type EnchantCost,
  type EnchantCostView,
  type EnchantSpell,
  type EnchantSpellView,
} from "@/lib/enchant/enchant";

/** Чип цены: картинка, сколько и хватает ли. */
export type CostChip = {
  key: string;
  name: string;
  image: string | null;
  amount: number;
  short: boolean;
};

/** Откуда взять имя, картинку и запас позиции: вид цены с сервера или вариант админа. */
export type CostInfo = Pick<EnchantCostView, "kind" | "code" | "name" | "image"> & {
  have?: number;
};

const keyOf = (c: Pick<EnchantCost, "kind" | "code">): string => `${c.kind}:${c.code}`;

/**
 * Крупная подпись усиления: «+20%», «+50–90%», 100 — «×2»; с минусом — знак у
 * каждой границы: «−20…+50%», «−50…−20%», «−10%» (никогда «+−20%»).
 */
export function boostText(min: number, max: number): string {
  if (min === max) return min === 100 ? "×2" : enchantPctText(min);
  if (min > 0) return `+${min}–${max}%`;
  return `${signedPct(min)}…${signedPct(max)}%`;
}

/** Эффект для инфо заклинания: «+10%», «−10%», 100 — «×2»; диапазон — пара «от … до …». */
export function boostInfo(min: number, max: number): string | [string, string] {
  if (min === max) return min === 100 ? "×2" : enchantPctText(min);
  return [enchantPctText(min), enchantPctText(max)];
}

/** Шанс для текста инфо: целым процентом; есть, но меньше половины — «<1%», не «0%». */
export const oddsText = (n: number): string => (n > 0 && n < 0.5 ? "<1%" : pctText(n));

export type OddsPart = { key: "s" | "n" | "d"; text: string };

/** Шансы текстом: успех и «без изменений» всегда, разрушение — только если > 0 (тогда и warn). */
export function oddsLine(o: { success: number; none: number; destroy: number }): {
  parts: OddsPart[];
  warn: boolean;
} {
  const parts: OddsPart[] = [
    { key: "s", text: oddsText(o.success) },
    { key: "n", text: oddsText(o.none) },
  ];
  const warn = o.destroy > 0;
  if (warn) parts.push({ key: "d", text: oddsText(o.destroy) });
  return { parts, warn };
}

/** Позиции цены → чипы. check — сверять с запасом (у игрока), у админа нет. */
export function costChips(list: EnchantCost[], info: CostInfo[], check: boolean): CostChip[] {
  const by = new Map(info.map((v) => [keyOf(v), v]));
  return list.map((c) => {
    const v = by.get(keyOf(c));
    return {
      key: keyOf(c),
      name: v?.name ?? c.code,
      image: v?.image ?? null,
      amount: c.amount,
      short: check && (v?.have ?? 0) < c.amount,
    };
  });
}

/** Цена заклинания без шагов — для ячейки. */
export const spellChips = (s: EnchantSpellView): CostChip[] => costChips(s.cost, s.cost, true);

/** Вся цена попытки (база + шаги, одинаковые слиты) с отметкой нехватки. */
export const totalChips = (s: EnchantSpellView, steps: number): CostChip[] =>
  costChips(enchantTotalCost(s, steps), [...s.cost, s.fx.cost], true);

export const canPay = (chips: CostChip[]): boolean => chips.every((c) => !c.short);

/** Цена k шагов усиления: amount × (2^k − 1). */
export function stepsAmount(s: EnchantSpell, k: number): number {
  let n = 0;
  for (let i = 0; i < k; i++) n += enchantStepCost(s, i);
  return n;
}

/** Кнопки − / +: от «Без усиления» (0) до ENCHANT_FX_STEPS; выключено — всегда 0. */
export function nextSteps(s: EnchantSpell, steps: number, delta: number): number {
  if (!s.fx.on) return 0;
  return Math.min(ENCHANT_FX_STEPS, Math.max(0, steps + delta));
}

/** Зачарованный уже не выбрать: одно зачарование на артефакт. */
export const pickable = (a: EnchantArtifactView): boolean => a.enchant == null;

/** Шанс для подписи — целым процентом. */
export const pctText = (n: number): string => `${Math.round(n)}%`;
