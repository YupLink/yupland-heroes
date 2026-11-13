// Банк замка (владелец, 14.10.2026): обмен по пулам, как DEX. Открыт игрокам 20.10.2026:
// здание строят в Ратуше (у админа — сразу); пулы заводит админ (пара + стартовый курс).
// С 25.10.2026 пара — любая: ресурсы игры и все монеты счёта (DARAI, USDT, звёзды, HOPE,
// GP, GDarai, RF…). Продажа золота за DARAI — по лицензии, покупка — без неё.
import { coinIcon } from "./coinIcon";

export type BankCost = { wood: number; stone: number; gold: number; diamonds: number };

/**
 * Цена постройки (владелец 14.10: «очень большая — предложи другую»): уровень «есть
 * у каждого пятого» — по запасам игроков 14.10 p80: дерево 1,1k, камень 257,
 * золото 5,7k, алмазы 75. Дешевле аукционного дома 1-го уровня по дереву и камню.
 */
export const BANK_COST: BankCost = { wood: 1_500, stone: 300, gold: 7_500, diamonds: 50 };

/** Ресурсы игры: в пул их выпускает игра, у остальных сторон — монеты счёта. */
export const BANK_RESOURCES = ["gold", "wood", "stone", "diamonds"] as const;
export type BankResource = (typeof BANK_RESOURCES)[number];
/** Сторона пула: ресурс игры или символ монеты счёта (reward_tokens: Darai, USDT, STARS…). */
export type BankToken = string;

export const isBankResource = (t: BankToken): t is BankResource =>
  (BANK_RESOURCES as readonly string[]).includes(t);

/** Монета или ресурс, которые можно поставить в пул: символ и знаки после запятой. */
export type BankTokenInfo = { symbol: BankToken; dp: number };

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
  /** Знаков после запятой у сторон: ресурс — 4, монета — как у монеты, ≤ 8 (bank-12). */
  dpA?: number;
  dpB?: number;
};

export type PairProblem = "same";

/** Можно ли завести такую пару; null — можно. С 25.10.2026 — любая из двух разных. */
export function pairProblem(a: BankToken, b: BankToken): PairProblem | null {
  return a === b ? "same" : null;
}

/** Пул с DARAI пишем DARAI второй стороной: курс читается в DARAI за монету. */
export function canonicalPair(
  a: BankToken,
  b: BankToken,
  wa: number,
  wb: number,
): { a: BankToken; b: BankToken; wa: number; wb: number } {
  return a === "Darai" ? { a: b, b: a, wa: wb, wb: wa } : { a, b, wa, wb };
}

/** Сколько B за одну A по стартовому курсу. */
export const startPrice = (p: Pick<BankPool, "weightA" | "weightB">): number =>
  p.weightB / p.weightA;

const RESOURCE_NAMES: Record<BankResource, [string, string]> = {
  gold: ["Золото", "Gold"],
  wood: ["Дерево", "Wood"],
  stone: ["Камень", "Stone"],
  diamonds: ["Алмазы", "Diamonds"],
};

export function tokenLabel(t: BankToken, ru: boolean): string {
  if (isBankResource(t)) return RESOURCE_NAMES[t][ru ? 0 : 1];
  if (t === "Darai") return "DARAI";
  if (t === "STARS") return ru ? "Звёзды" : "Stars";
  return t;
}

/** Иконка ресурса или монеты (из блокчейна); нет картинки — кружок с буквами, как в Казне. */
export const tokenIcon = (t: BankToken): string | null =>
  isBankResource(t) ? `/resources/${t === "diamonds" ? "crystal" : t}.webp` : coinIcon(t);

/** Буквы в кружке монеты: DARAI — «DA», прочие — первые две буквы символа. */
export const tokenLetters = (t: BankToken): string =>
  t === "STARS"
    ? "★"
    : t
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 2)
        .toUpperCase() || "?";
