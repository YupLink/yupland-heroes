import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Рыбалка (владелец, 04.10.2026; ПРАВИЛА §8.35): удочка в руках, на берегу —
// «Забросить» — через N минут улов с шансом или «ничего»; ловить — забросить снова.
export const dict: Record<string, Entry> = {
  // Кнопка над картой и окно рыбалки
  "fish.title": { ru: "Рыбалка", en: "Fishing" },
  "fish.start": { ru: "Забросить", en: "Cast" },
  "fish.stop": { ru: "Хватит", en: "Stop" },
  "fish.caught": { ru: "Улов", en: "Catch" },
  "fish.progress": { ru: "Забросов", en: "Casts" },
  "fish.next": { ru: "Ждём", en: "Waiting" },
  // Окно заброса: на сколько минут закидываем
  "fish.cast_title": { ru: "На сколько забросить", en: "How long to fish" },
  "fish.bonus": { ru: "Бонус к рыбалке", en: "Fishing bonus" },
  "fish.minutes": { ru: "{n} мин", en: "{n} min" },
  "fish.cast_for": { ru: "Забросить на {n} мин", en: "Cast for {n} min" },
  "fish.tries_left": { ru: "Забросов у удочек: {n}", en: "Casts left in rods: {n}" },
  // Тосты
  "fish.got": { ru: "Улов: {items}", en: "Caught: {items}" },
  "fish.nothing": { ru: "Ничего не поймал", en: "Nothing caught" },
  "fish.rod_gone": { ru: "Удочка кончилась", en: "Your fishing rod is used up" },
  // Отказы сервера
  "fish.cant_here": {
    ru: "Рыбачить можно только с берега",
    en: "You can only fish from the shore",
  },
  "fish.need_rod": { ru: "Нужна удочка", en: "You need a fishing rod" },
  "fish.rods_short": {
    ru: "Удочек хватит только на {n} мин",
    en: "Your rods last only {n} min",
  },
  "fish.off": { ru: "Рыбалка пока не настроена", en: "Fishing is not set up yet" },
  // Ловля руками — остров новичка (владелец, 21.10.2026)
  "fish.hand": { ru: "Ловить руками", en: "Fish by hand" },
  "fish.hand_hungry": {
    ru: "Мало сытости — нужно {n}",
    en: "Not enough satiety — need {n}",
  },
  "fish.hand_island_only": {
    ru: "Руками ловят только на острове новичка",
    en: "Fishing by hand works only on the newbie island",
  },
};
