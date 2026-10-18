// Редкости для панели раздачи: подписи по-русски и цвет из общего справочника.
//
// Цвета берём у админки предметов (itemsAdminShared), а не заводим свои: одна
// и та же легендарка не должна светиться в раздаче другим золотом, чем в
// списке артефактов.
import { RARITY, RARITY_COLOR } from "@/components/admin/itemsAdminShared";

export { RARITY, RARITY_COLOR };

export const RARITY_LABEL: Record<string, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

/** Цвет редкости; неизвестная — серая, а не пропавшая. */
export function rarityColor(rarity: string | null): string {
  return rarity ? (RARITY_COLOR[rarity] ?? "#9aa4bd") : "#9aa4bd";
}

export function rarityLabel(rarity: string | null): string {
  return rarity ? (RARITY_LABEL[rarity] ?? rarity) : "любая";
}
