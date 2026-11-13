// Ловля руками (владелец, 21.10.2026: «рыбу можно ловить и голыми руками —
// расход энергии выше, примерно как и рубка»). Только на острове новичка, с
// берега, удочка не нужна. Одно нажатие — одна попытка с шансом рыбалки мира
// (с бонусом героя); цена — как у рубки руками: 10 энергии и 30 сытости, на
// острове ×0,1 (1 и 3).
import { HAND_CHOP_SATIETY } from "@/lib/raid/handChop";

/** 10 энергии — прежняя цена рубки руками; у рубки с 25.10 своя (×2 от топора). */
export const HAND_FISH_ENERGY = 10;
export const HAND_FISH_SATIETY = HAND_CHOP_SATIETY;

/** Отказ: ловить руками можно только на острове новичка. */
export const HAND_FISH_ISLAND_ONLY = "fish.hand_island_only";

/** Отказ: сытости меньше нужного — `fish.hand_hungry|{"n":3}`. */
export const HAND_FISH_HUNGRY = "fish.hand_hungry";

/** Подпись источника улова руками — у мешочка и в «Добыче». */
export const HAND_FISH_SOURCE = "Руками";
