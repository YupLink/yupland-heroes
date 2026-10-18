import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Магический сундук — тексты окна, рюкзака, захвата и «Забрать сундук».
// Отказы сервера (chest.gone, chest.net_full…) живут в braid-market.ts рядом с
// market.*: их бросает и маркет. Здесь — только то, что пишет сам интерфейс.
export const dict: Record<string, Entry> = {
  "chest.title": { ru: "Магический сундук", en: "Magic Chest" },
  "chest.mine": { ru: "Твой сундук", en: "Your chest" },
  "chest.foreign": { ru: "Чужой сундук", en: "Someone else's chest" },
  "chest.owner": { ru: "Сундук: {name}", en: "Chest of {name}" },
  "chest.net_cells": { ru: "Сундук · {used}/{all}", en: "Chest · {used}/{all}" },
  "chest.guard_title": { ru: "Охрана сундука", en: "Chest guard" },
  // Установка из рюкзака: охрана по желанию.
  "chest.no_guard": { ru: "Без охраны", en: "No guard" },
  // Кнопка на стеке-сундуке в рюкзаке: ставит его на клетку под героем.
  "chest.place": { ru: "Поставить", en: "Place" },
  "chest.placed_toast": { ru: "Сундук поставлен", en: "Chest placed" },
  "chest.stored_toast": { ru: "В сундук: {n} шт", en: "Into the chest: {n} pcs" },
  // Свой сундук: открыть сеть или забрать сундук в рюкзак.
  "chest.open": { ru: "Открыть", en: "Open" },
  "chest.pickup": { ru: "Забрать сундук", en: "Pick up the chest" },
  "chest.pickup_do": { ru: "Забрать", en: "Take" },
  "chest.picked_toast": { ru: "Сундук в рюкзаке", en: "The chest is in your backpack" },
  "chest.lifted_bag_toast": {
    ru: "Места нет — сундук лежит мешочком на клетке",
    en: "No room — the chest is in a loot bag on the cell",
  },
  "chest.to_backpack": { ru: "В рюкзак", en: "Into the backpack" },
  "chest.to_bag": { ru: "В мешочек", en: "Into a loot bag" },
  "chest.lost": { ru: "Пропадёт", en: "Will be lost" },
  "chest.guard_wounded": {
    ru: "Охрана ранена — не вернётся",
    en: "The guard is wounded — it won't come back",
  },
  // Чужой сундук: грабёж без охраны или после победы над ней.
  "chest.plunder": { ru: "Разграбить", en: "Plunder" },
  // Четвёртая редакция (29.09): «Разграбить» снята — вкладке прошлой версии.
  "chest.no_plunder": {
    ru: "Грабежа больше нет — открой сундук",
    en: "No more plundering — open the chest",
  },
  "chest.plundered_toast": { ru: "Сундук разграблен", en: "Chest plundered" },
  "chest.claimed": { ru: "Сундук уже вскрыли", en: "Someone has already broken it open" },
  "chest.loot_title": { ru: "Добыча сундука", en: "Chest loot" },
  "chest.to_harvest": { ru: "В «Добычу»", en: "Into Harvest" },
};
