// Зелья турнира «Зелья скорости» в форме черновика: ключ кэша справочника,
// какие зелья выбираются и выбор по умолчанию (владелец, 12.10.2026: «Дурман
// зелье» — «зелье скорости, делается из рыбы»). Чистая логика без React — для
// формы и выбора зелий.
import type { CustomItem } from "@/server/api/beta-raid/market-custom";

/** Ключ кэша справочника своих товаров — общий с маркетом и призами. */
export const CUSTOM_ITEMS_KEY = ["market-custom-items"] as const;

/** Зелье со скоростью в бусте — как у сервера (tour-rows.POTION_PICK_SQL). */
export const isSpeedPotion = (c: CustomItem): boolean =>
  c.isPotion && (c.boost ?? []).some((b) => b.stat === "spd");

/** Зелья по умолчанию для «Зелий скорости» — «Дурман зелье». */
export const defaultPotions = (list: readonly CustomItem[]): string[] =>
  list.filter((c) => isSpeedPotion(c) && /дурман/i.test(c.name)).map((c) => c.id);

/**
 * Что подставить в выбор зелий: не выбирали (undefined) и справочник уже
 * пришёл — «Дурман зелье»; выбрано (в том числе «все» — []) или справочника
 * ещё нет — ничего (null).
 */
export const potionFill = (
  value: readonly string[] | undefined,
  list: readonly CustomItem[] | undefined,
): string[] | null => (value === undefined && list ? defaultPotions(list) : null);
