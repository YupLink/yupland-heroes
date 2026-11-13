import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Метки ассетов карты в админке: к каким типам местности и расам относится
// декор, постройка и облик (галочки; пусто = подходит всем).
export const dict: Record<string, Entry> = {
  "tags.title": { ru: "Метки", en: "Tags" },
  "tags.building": { ru: "Метки постройки", en: "Building tags" },
  "tags.skin": { ru: "Метки облика", en: "Skin tags" },
  "tags.terrain": { ru: "Местность", en: "Terrain" },
  "tags.race": { ru: "Раса", en: "Race" },
  "tags.auto": { ru: "авто", en: "auto" },
  "tags.any": { ru: "любая", en: "any" },
  // Природа декора (шахты v2, §8.59.8): лесопилке нужны деревья, каменной — горы.
  "tags.nature": { ru: "Природа", en: "Nature" },
  "tags.nature.tree": { ru: "Дерево", en: "Tree" },
  "tags.nature.mountain": { ru: "Гора", en: "Mountain" },
  "tags.race.Пчела": { ru: "Пчела", en: "Bee" },
  "tags.race.Кабан": { ru: "Кабан", en: "Boar" },
  "tags.race.ДраКошка": { ru: "ДраКошка", en: "Dragon Cat" },
  "tags.race.Юпик": { ru: "Юпик", en: "Yupik" },
  "tags.race.Единорог": { ru: "Единорог", en: "Unicorn" },
  "tags.race.Дракон": { ru: "Дракон", en: "Dragon" },
};
