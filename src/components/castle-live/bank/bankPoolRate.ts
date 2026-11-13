// Курс пула словами на карточке админа (владелец, 29.10.2026): «1 GP = 1 000 золота».
// Пул пуст — по весам (стартовый курс), наполнен — по запасам, как poolPrice. Сторону
// берём так, чтобы число было не меньше единицы (не «1 золото = 0,001 GP»). Число —
// как в обмене (fmtNum, до 6 знаков), слово — в числе: «1 алмаз», «5 алмазов».
import { tokenLabel, type BankPool, type BankToken } from "@/lib/castleBank";
import { poolLive } from "@/lib/bankSwap";
import { ruPlural } from "@/lib/tourLetterText";
import { fmtNum } from "./bankUi";

/** ru — 1 / 2–4 / 5+; сыпучее не склоняется («1 000 золота»). Прочие монеты — символом. */
const RU: Record<string, [string, string, string]> = {
  gold: ["золото", "золота", "золота"],
  wood: ["дерево", "дерева", "дерева"],
  stone: ["камень", "камня", "камня"],
  diamonds: ["алмаз", "алмаза", "алмазов"],
  STARS: ["звезда", "звезды", "звёзд"],
};
const EN: Record<string, [string, string]> = {
  gold: ["gold", "gold"],
  wood: ["wood", "wood"],
  stone: ["stone", "stone"],
  diamonds: ["diamond", "diamonds"],
  STARS: ["star", "stars"],
};

function word(t: BankToken, n: number, ru: boolean): string {
  if (ru) {
    const f = RU[t];
    return f ? ruPlural(n, ...f) : tokenLabel(t, true);
  }
  const f = EN[t];
  return f ? (n === 1 ? f[0] : f[1]) : tokenLabel(t, false);
}

type RatePool = Pick<BankPool, "tokenA" | "tokenB" | "weightA" | "weightB" | "reserveA" | "reserveB">;

export function poolRateText(p: RatePool, ru: boolean): string {
  const [a, b] = poolLive(p) ? [p.reserveA, p.reserveB] : [p.weightA, p.weightB];
  const flip = b < a; // одна A дешевле одной B — читаем «A за 1 B»
  const [one, other] = flip ? [p.tokenB, p.tokenA] : [p.tokenA, p.tokenB];
  const rate = Math.round((flip ? a / b : b / a) * 1e6) / 1e6;
  return `1 ${word(one, 1, ru)} = ${fmtNum(rate, ru)} ${word(other, rate, ru)}`;
}
