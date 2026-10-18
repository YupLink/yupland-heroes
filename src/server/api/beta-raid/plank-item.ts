// «Доска» — одна на всех: разборка корабля, починка и рюкзак берут вид
// доски ОТСЮДА, а не собирают его каждый по-своему.
//
// Почему отдельный модуль. На проде (21.09) «Доска» лежала в рюкзаках тремя
// разными стеками: 'custom:cst_pykrpujitzq0' (шаблон справочника, из маркета),
// 'custom:' без картинки (разборка до фикса 17.09 и возвраты со склада) и
// 'custom:' с /resources/wood.png (разборка между двумя фиксами). Стеки не
// складывались друг с другом (у героя на одну ячейку — «Свободных ячеек нет»),
// скупка искала только канон («не продать»), рюкзак рисовал коробку вместо
// доски. Причина одна — доска без ref шаблона. Здесь ref никогда не пустой.
import { canonRef } from "./item-alias";

export const PLANK_NAME = "Доска";

/**
 * Запасная картинка. Картинку стека даёт ШАБЛОН справочника (canonCustomMeta
 * в depositToBackpack) — wood.webp попадает в ячейку только когда шаблона нет.
 */
export const PLANK_IMAGE = "/resources/wood.webp";

/**
 * Шаблон «Доска» на проде — страховка на случай, когда справочник не читается
 * (мост лёг, кэш пуст) или доску переименовали. Пересоздал владелец «Доску» под
 * новым id — старые стеки и скупка сводятся связкой в item_alias, как у любого
 * другого товара.
 */
export const PLANK_TEMPLATE_FALLBACK = "cst_pykrpujitzq0";

/** Ref шаблона доски: по основе имени из справочника, иначе — константа. Никогда не null. */
export async function plankRefId(): Promise<string> {
  const byName = await canonRef("custom", null, PLANK_NAME).catch(() => null);
  return byName && byName.startsWith("cst_") ? byName : PLANK_TEMPLATE_FALLBACK;
}

/** Ключ стека досок в рюкзаке/на складе: тот же, что у досок из маркета. */
export async function plankStackKey(): Promise<string> {
  return `custom:${await plankRefId()}`;
}

/** Доска как товар для depositToBackpack: id и refId — один и тот же шаблон. */
export async function plankItem(): Promise<{
  id: string;
  kind: "custom";
  refId: string;
  name: string;
  image: string;
}> {
  const ref = await plankRefId();
  return { id: ref, kind: "custom", refId: ref, name: PLANK_NAME, image: PLANK_IMAGE };
}
