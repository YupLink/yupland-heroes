import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Мешочки на карте рейда (владелец, 29.09.2026; ПРАВИЛА §8.21): окно мешочка
// (как у склада: забрать и положить), тосты и отказы сервера (bag.* — их
// бросают ручки мешочка).
export const dict: Record<string, Entry> = {
  // Окно
  "bag.kicker": { ru: "Добыча на земле", en: "Loot on the ground" },
  "bag.title": { ru: "Мешочек", en: "Loot bag" },
  "bag.mound": { ru: "Бугорок", en: "Mound" },
  "bag.title_many": { ru: "Мешочков: {n}", en: "Loot bags: {n}" },
  // Рыба, всплывшая от красного динамита (30.10.2026): тот же мешочек, только рыба
  "bag.fish": { ru: "Рыба", en: "Fish" },
  "bag.fish_boot": { ru: "Упс, показалось", en: "Oops, must have imagined it" },
  "bag.left_h": { ru: "осталось {h} ч", en: "{h} h left" },
  "bag.left_m": { ru: "осталось {m} мин", en: "{m} min left" },
  "bag.have": { ru: "В мешочке: {n}", en: "In the bag: {n}" },
  "bag.take": { ru: "Забрать", en: "Take" },
  "bag.put": { ru: "Положить", en: "Put in" },
  "bag.take_all": { ru: "Забрать всё", en: "Take all" },
  "bag.bury": { ru: "Закопать", en: "Bury" },
  "bag.dig": { ru: "Выкопать", en: "Dig up" },
  "bag.open_building": { ru: "Постройка", en: "Building" },
  // Вход за энергию (ПРАВИЛА §8.23): мешочек — 1, сундук — по занятым ячейкам, не меньше 1.
  "pass.open": { ru: "Открыть · {n}⚡", en: "Open · {n}⚡" },
  // Пока кнопка показывала цену, сундук наполнили: ничего не списано, окно покажет новую.
  "pass.price_changed": {
    ru: "Цена изменилась: {n}⚡ — открой ещё раз",
    en: "The price changed: {n}⚡ — open it again",
  },
  // Тосты
  "bag.took": { ru: "Забрано: {n}", en: "Taken: {n}" },
  // «Забрать всё» унесло не всё: что осталось в мешочке.
  "bag.not_fit": { ru: "Не влезло: {list}", en: "Didn't fit: {list}" },
  "bag.put_toast": { ru: "Положено в мешочек: {n}", en: "Put in the bag: {n}" },
  "bag.buried_toast": { ru: "Мешочек закопан", en: "The bag is buried" },
  "bag.dug_toast": { ru: "Бугорок раскопан", en: "The mound is dug up" },
  "bag.dropped": {
    ru: "Не влезло — выпал мешочек ({n})",
    en: "Didn't fit — a loot bag dropped ({n})",
  },
  "bag.discarded": { ru: "Выброшено в мешочек ({n})", en: "Dropped into a loot bag ({n})" },
  // Окно выброса: изношенная штука инструмента при «Всё» сгорает (§8.21 п. 13).
  "braid.backpack_discard_worn": {
    ru: "Изношенная штука ({n}%) будет уничтожена",
    en: "The worn item ({n}%) will be destroyed",
  },
  "bag.discard_worn_gone": { ru: "Изношенная штука уничтожена", en: "The worn item is destroyed" },
  "bag.toast_backpack": {
    ru: "{badge}: {rewards} — в рюкзаке",
    en: "{badge}: {rewards} — in the backpack",
  },
  // Отказы сервера
  "bag.gone": { ru: "Мешочка здесь больше нет", en: "The bag is gone" },
  "bag.approach": { ru: "Подойди к мешочку вплотную", en: "Come right up to the bag" },
  "bag.guarded": {
    ru: "Сначала победи того, кто стоит на клетке",
    en: "Defeat whoever stands on this cell first",
  },
  "bag.decor": { ru: "Сначала освободи клетку", en: "Clear the cell first" },
  "bag.discard_off_map": {
    ru: "Выбросить можно только на карте",
    en: "You can only discard on the map",
  },
  "pass.closed": { ru: "Сначала открой", en: "Open it first" },
  "bag.buried": { ru: "Мешочек уже закопан", en: "The bag is already buried" },
  "bag.not_buried": { ru: "Бугорок уже раскопали", en: "The mound has already been dug up" },
  "bag.taken": { ru: "Это уже забрали", en: "Someone already took it" },
  // Ресурс счёта появляется в мешочке только разборкой шахты (§8.70).
  "bag.res_no_put": {
    ru: "Ресурсы в мешочек не кладут",
    en: "Resources can't be put into a loot bag",
  },
  "bag.need_shovel": { ru: "Нужна лопата", en: "Shovel needed" },
  "bag.drop_failed": {
    ru: "Не получилось — энергия и инструмент вернулись, попробуй ещё раз",
    en: "It didn't work — energy and the tool are back, try again",
  },
  "bag.busy": {
    ru: "Из мешочка сейчас забирают — повтори через пару секунд",
    en: "Someone is taking from the bag — try again in a moment",
  },
  "bag.shovel_busy": {
    ru: "Лопата ещё в деле — повтори через пару секунд",
    en: "The shovel is still in use — try again in a moment",
  },
};
