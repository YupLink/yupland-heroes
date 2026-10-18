// Условия турнира для игрока: за что очки засчитываются и за что нет.
//
// Слово владельца (05.10.2026): у плашки турнира — условия (была кнопка «i»,
// теперь вкладка «Условия»), кратко и по пунктам — «засчитывается за» и «не
// засчитывается за». Пункты — ключи словаря tour.rules.* (ru + en, translations/tournament-rules.ts), по паре слов. Каждый пункт
// описывает то, что реально делает подсчёт (metricSources.ts, tour-sql.ts,
// goldProfit.ts, pieceFlow.ts, pieceLink.ts, buyBook.ts, tour-own-auction.ts,
// tour-hooks.ts, move-step-after.ts, fishing-note.ts): меняется подсчёт —
// меняются и пункты.
import type { TourMetric } from "./types";

export type TourRules = { yes: string[]; no: string[] };

const k = (metric: string, part: "y" | "n", n: number): string =>
  `tour.rules.${metric}.${part}${n}`;
const list = (metric: string, part: "y" | "n", count: number): string[] =>
  Array.from({ length: count }, (_, i) => k(metric, part, i + 1));

/** Не засчитывается для ресурсных категорий (дерево, камень) — одно и то же. */
const RES_NO = list("res", "n", 4);

export const TOUR_RULES: Record<TourMetric, TourRules> = {
  damage: { yes: list("damage", "y", 1), no: list("damage", "n", 1) },
  boss_kills: { yes: list("boss_kills", "y", 1), no: list("boss_kills", "n", 1) },
  gold: { yes: list("gold", "y", 2), no: list("gold", "n", 3) },
  wood: { yes: list("wood", "y", 4), no: RES_NO },
  stone: { yes: list("stone", "y", 4), no: RES_NO },
  chop: { yes: list("chop", "y", 1), no: list("chop", "n", 1) },
  steps: { yes: list("steps", "y", 1), no: list("steps", "n", 2) },
  step_energy: { yes: list("step_energy", "y", 1), no: list("step_energy", "n", 1) },
  farm: { yes: list("farm", "y", 1), no: list("farm", "n", 1) },
  fish_catch: { yes: list("fish_catch", "y", 2), no: list("fish_catch", "n", 2) },
  fish_sell: { yes: list("fish_sell", "y", 3), no: list("fish_sell", "n", 5) },
  potion_drink: { yes: list("potion_drink", "y", 2), no: list("potion_drink", "n", 3) },
};

/**
 * Какие зелья засчитываются — строкой с именами из списка турнира (у плашки
 * items): «зелья: Дурман зелье». Пусто — строки нет.
 */
export const TOUR_RULES_ITEMS_KEY = "tour.rules.potion_drink.items";

/** Общий пункт для всех категорий: очки идут только после записи. */
export const TOUR_RULES_JOIN_KEY = "tour.rules.join";

/** Общий пункт: ничья (владелец, 06.10.2026) — одно место, призы мест поровну. */
export const TOUR_RULES_TIE_KEY = "tour.rules.tie";
