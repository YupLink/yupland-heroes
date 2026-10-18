import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Карта мира (кнопка у миникарты рейда): режимы, легенда, отказ сервера.
export const dict: Record<string, Entry> = {
  "wmap.title": { ru: "Карта мира", en: "World map" },
  "wmap.mode_seen": { ru: "Разведанное", en: "Explored" },
  "wmap.mode_all": { ru: "Вся карта", en: "Whole map" },
  "wmap.legend": { ru: "Легенда", en: "Legend" },
  // Метки на карте и в легенде
  "wmap.hero": { ru: "Герой", en: "Hero" },
  "wmap.castle": { ru: "Замок", en: "Castle" },
  "wmap.treasure": { ru: "Клады", en: "Treasures" },
  "wmap.buildings": { ru: "Все постройки", en: "All buildings" },
  // Постройки — по поведению (cellBuildingEffect)
  "wmap.town": { ru: "Город", en: "Town" },
  "wmap.shop": { ru: "Лавка", en: "Shop" },
  "wmap.mine": { ru: "Шахта", en: "Mine" },
  "wmap.field": { ru: "Поле", en: "Field" },
  "wmap.warehouse": { ru: "Склад", en: "Warehouse" },
  "wmap.portal": { ru: "Портал", en: "Portal" },
  "wmap.tavern": { ru: "Таверна", en: "Tavern" },
  "wmap.shipyard": { ru: "Верфь", en: "Shipyard" },
  "wmap.watchtower": { ru: "Вышка", en: "Watchtower" },
  "wmap.sign": { ru: "Табличка", en: "Sign" },
  "wmap.university": { ru: "Университет", en: "University" },
  "wmap.museum": { ru: "Музей", en: "Museum" },
  "wmap.chambers": { ru: "Покои", en: "Chambers" },
  "wmap.boost": { ru: "Алтарь", en: "Altar" },
  "wmap.spellbook": { ru: "Столб заклинаний", en: "Spell pillar" },
  "wmap.oblivion": { ru: "Забвение", en: "Oblivion" },
  "wmap.leveltree": { ru: "Дерево уровней", en: "Level tree" },
  "wmap.tournament": { ru: "Турнир", en: "Tournament" },
  "wmap.other": { ru: "Прочие постройки", en: "Other buildings" },
  // Отказ сервера (world-map.ts)
  "wmap.no_access": { ru: "Карта мира недоступна", en: "World map is not available" },
};
