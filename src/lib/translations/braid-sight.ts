import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Бинокль и лестница (08.11.2026): «Применить» из рюкзака.
export const dict: Record<string, Entry> = {
  "braid.sight": { ru: "Бинокль: обзор {n}", en: "Binoculars: sight {n}" },
  "braid.sight_use": { ru: "Применить", en: "Use" },
  "braid.sight_effect": {
    ru: "Обзор {n} клеток · {m} мин",
    en: "Sight {n} cells · {m} min",
  },
  // Владелец 12.11: «писать бинокль активирован и т. п.».
  "braid.sight_done": {
    ru: "Бинокль активирован · обзор {n} клеток до {time}",
    en: "Binoculars activated · sight {n} cells until {time}",
  },
  "braid.sight_short": { ru: "Столько биноклей нет", en: "Not enough binoculars" },
  "braid.ladder_use": { ru: "Перелезть · {n} золота", en: "Climb over · {n} gold" },
  "braid.ladder_gold": {
    ru: "Не хватает золота на лестницу",
    en: "Not enough gold for the ladder",
  },
  "braid.ladder_pick": { ru: "Куда перелезть?", en: "Where to climb?" },
  "braid.ladder_none": {
    ru: "Рядом нет препятствия со свободной клеткой за ним",
    en: "No obstacle with a free cell behind it nearby",
  },
  "braid.ladder_cancel": { ru: "Отмена", en: "Cancel" },
  "braid.ladder_done": { ru: "Перелез", en: "Climbed over" },
  "braid.ladder_bad": { ru: "Сюда не перелезть", en: "Can't climb there" },
  "braid.ladder_short": { ru: "Лестницы нет", en: "No ladder" },
  "braid.ladder_map": { ru: "Перелезть можно на карте", en: "Climbing works on the map" },
  "braid.ladder_on": { ru: "Лестница активирована", en: "Ladder activated" },
};
