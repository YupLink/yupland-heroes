import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Генератор артефактов (§8.122): окно постройки и отказы сервера.
export const dict: Record<string, Entry> = {
  "artgen.title": { ru: "Генератор артефактов", en: "Artifact generator" },
  "artgen.create": { ru: "Создать · {price}", en: "Create · {price}" },
  "artgen.paying": { ru: "Оплата…", en: "Paying…" },
  "artgen.failed": { ru: "Не вышло — цена возвращена", en: "Failed — price refunded" },
  "artgen.unique": { ru: "Уникальный", en: "Unique" },
  "artgen.make_unique": { ru: "Сделать уникальным · {price}", en: "Make unique · {price}" },
  "artgen.mass": { ru: "Массовый: может выпасть другим", en: "Mass: can drop for others" },
  "artgen.copied": {
    ru: "Уже выпал другому — останется массовым",
    en: "Already dropped — stays mass",
  },
  "artgen.done": { ru: "Артефакт создан", en: "Artifact created" },
  "artgen.unique_done": { ru: "Артефакт теперь уникальный", en: "The artifact is unique now" },
  "artgen.not_here": { ru: "Здесь нет генератора", en: "No generator here" },
  "artgen.unbuilt": { ru: "Генератор ещё строится", en: "The generator is still being built" },
  "artgen.not_set": { ru: "Генератор ещё не настроен", en: "The generator isn't set up yet" },
  "artgen.no_price": {
    ru: "Эту редкость здесь не заказать",
    en: "This rarity isn't available here",
  },
  "artgen.no_unique_price": {
    ru: "Здесь не делают арты уникальными",
    en: "Artifacts can't be made unique here",
  },
  "artgen.unique_late": {
    ru: "Копия уже выпала другому — уникальным не сделать",
    en: "A copy already dropped — can't make it unique",
  },
  "artgen.day_limit": { ru: "На сегодня заказов хватит", en: "Enough orders for today" },
  "artgen.queue_full": {
    ru: "Сначала дождись уже заказанных",
    en: "Wait for the ones already ordered",
  },
  "artgen.not_found": { ru: "Задание не найдено", en: "Order not found" },
  "artgen.not_owned": {
    ru: "Уникальным делают только свой арт",
    en: "Only your own artifact can be made unique",
  },
  "artgen.left": { ru: "Осталось {n} из {max}", en: "{n} of {max} left" },
  "artgen.next_at": { ru: "Следующий — в {time}", en: "Next one at {time}" },
  "artgen.price_changed": {
    ru: "Цена изменилась — проверь и нажми ещё раз",
    en: "The price changed — check it and tap again",
  },
  "artgen.world_limit": {
    ru: "Генерации на сегодня кончились",
    en: "No generations left for today",
  },
  "artgen.repeat": { ru: "Заказ уже принят", en: "The order is already placed" },
  "artgen.failed_order": {
    ru: "Заказ не принят — цена возвращена",
    en: "Order not placed — price refunded",
  },
  "artgen.unique_other": {
    ru: "Уникальным делает генератор, где арт создан",
    en: "Only the generator that made it can make it unique",
  },
};
