// Банк замка (владелец, 14.10.2026): обмен по пулам, как DEX. Пока — только админам:
// здание видит админ, админ заводит пулы (пара + стартовый курс), без запаса.
// DARAI меняется только на золото; продажа золота за DARAI — по лицензии (позже),
// покупка золота за DARAI — без неё. Комиссия остаётся в самом пуле.
export type BankCost = { wood: number; stone: number; gold: number; diamonds: number };

/**
 * Цена постройки (владелец 14.10: «очень большая — предложи другую»): уровень «есть
 * у каждого пятого» — по запасам игроков 14.10 p80: дерево 1,1k, камень 257,
 * золото 5,7k, алмазы 75. Дешевле аукционного дома 1-го уровня по дереву и камню.
 */
export const BANK_COST: BankCost = { wood: 1_500, stone: 300, gold: 7_500, diamonds: 50 };

export const BANK_TOKENS = ["gold", "wood", "stone", "diamonds", "Darai"] as const;
export type BankToken = (typeof BANK_TOKENS)[number];

/** Комиссия пула — из списка; по умолчанию 10 %. */
export const BANK_FEES = [0, 1, 2, 3, 5, 10, 15, 20] as const;
export const BANK_DEFAULT_FEE = 10;

export type BankPool = {
  id: string;
  tokenA: BankToken;
  tokenB: BankToken;
  /** Стартовый курс: weightA единиц A = weightB единиц B. */
  weightA: number;
  weightB: number;
  reserveA: number;
  reserveB: number;
  feePct: number;
  createdAt: string;
};

export type PairProblem = "same" | "darai_only_gold";

/** Можно ли завести такую пару; null — можно. */
export function pairProblem(a: BankToken, b: BankToken): PairProblem | null {
  if (a === b) return "same";
  if ((a === "Darai" || b === "Darai") && a !== "gold" && b !== "gold") return "darai_only_gold";
  return null;
}

/** Пул с DARAI всегда пишем как «золото → DARAI»: курс читается в DARAI за золото. */
export function canonicalPair(
  a: BankToken,
  b: BankToken,
  wa: number,
  wb: number,
): { a: BankToken; b: BankToken; wa: number; wb: number } {
  return a === "Darai" ? { a: b, b: a, wa: wb, wb: wa } : { a, b, wa, wb };
}

/** Сколько B за одну A по стартовому курсу. */
export const startPrice = (p: Pick<BankPool, "weightA" | "weightB">): number => p.weightB / p.weightA;

export function tokenLabel(t: BankToken, ru: boolean): string {
  if (t === "Darai") return "DARAI";
  const names: Record<Exclude<BankToken, "Darai">, [string, string]> = {
    gold: ["Золото", "Gold"],
    wood: ["Дерево", "Wood"],
    stone: ["Камень", "Stone"],
    diamonds: ["Алмазы", "Diamonds"],
  };
  return names[t][ru ? 0 : 1];
}

/** Иконка ресурса; у DARAI картинки нет — рисуем кружок с буквами, как в Казне. */
export const tokenIcon = (t: BankToken): string | null =>
  t === "Darai" ? null : `/resources/${t === "diamonds" ? "crystal" : t}.webp`;
