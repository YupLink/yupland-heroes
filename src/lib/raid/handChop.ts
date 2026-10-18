// Рубка руками (владелец, 17.10.2026, ПРАВИЛА §8.56): «рубить можно и руками
// те деревья, которые можно рубить деревянным и каменным топором — но это
// отнимает 10 энергии и 30 сытости».
//
// Руками рубится декор, у которого среди допустимых инструментов шаблона
// (meta.interact.toolItemIds и старый toolItemId, lib/raid/decorTools) есть
// деревянный или каменный топор. Цена своя, а не декора: 10 энергии и 30
// сытости героя; инструмент не тратится. Есть подходящий инструмент — рубят
// им, как раньше.
import { SATIETY_COST } from "@/lib/hero/satiety";

/** «Деревянный Топор» и «Каменный Топор» — свои товары (cst_…). */
export const HAND_CHOP_TOOL_IDS: readonly string[] = ["cst_frxf3xh6mq6g", "cst_g7uwp1syvmng"];

/** Энергия за рубку руками — вместо цены декора. */
export const HAND_CHOP_ENERGY = 10;
/** Сытость героя за рубку руками; меньше — отказ. */
export const HAND_CHOP_SATIETY = SATIETY_COST.handChop;

/** Отказ: сытости меньше нужного — `braid.decor_hand_hungry|{"n":30}`. */
export const HAND_CHOP_HUNGRY = "braid.decor_hand_hungry";
/** Отказ: этот декор руками не рубится. */
export const HAND_CHOP_NOT_ALLOWED = "braid.decor_hand_no";

/** Рубится ли руками: среди инструментов декора есть деревянный или каменный топор. */
export function canChopByHand(toolIds: readonly string[]): boolean {
  return toolIds.some((id) => HAND_CHOP_TOOL_IDS.includes(id));
}

/** Что мешает рубить руками: сытость, энергия или ничего. */
export type HandChopBlock = "satiety" | "energy" | null;

/**
 * Помеха по данным клиента — для неактивной кнопки с причиной. Числа нет
 * (героя нет, баланс не приехал) — не мешает: решает сервер.
 */
export function handChopBlock(o: {
  energy?: number | null;
  satiety?: number | null;
}): HandChopBlock {
  if (o.satiety != null && o.satiety < HAND_CHOP_SATIETY) return "satiety";
  if (o.energy != null && o.energy < HAND_CHOP_ENERGY) return "energy";
  return null;
}
