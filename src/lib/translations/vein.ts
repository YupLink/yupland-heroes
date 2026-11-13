import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Жила из лавки (lib/veinPlace): имена видов, кнопка в рюкзаке, окно укладки,
// жила в руке и отказы сервера (vein.*). «Разместить ×N» — общие с землёй
// (land.place, land.place_n).
export const dict: Record<string, Entry> = {
  "vein.name.gold": { ru: "Золотая жила", en: "Gold vein" },
  "vein.name.diamonds": { ru: "Алмазная жила", en: "Diamond vein" },
  "vein.put": { ru: "Положить", en: "Place" },
  "vein.title": { ru: "Положить жилу", en: "Place a vein" },
  "vein.placed": { ru: "Жила положена", en: "Vein placed" },
  "vein.placed_n": { ru: "Положено жил: {n}", en: "Veins placed: {n}" },
  "vein.partial": { ru: "Положено {done} из {all}", en: "Placed {done} of {all}" },
  "vein.hand_on_map": {
    ru: "Жила в руке — открой карту и тапай по клеткам рядом с героем",
    en: "Vein in hand — open the map and tap cells next to the hero",
  },
  "vein.cells_failed": { ru: "Не удалось проверить клетки", en: "Couldn't check the cells" },
  "vein.far": {
    ru: "Слишком далеко — до 3 клеток от героя",
    en: "Too far — up to 3 cells from the hero",
  },
  "vein.no_cell": { ru: "Здесь нет земли", en: "There's no land here" },
  "vein.void": {
    ru: "Под глухим туманом жилу не положить",
    en: "Can't place a vein under the dome",
  },
  "vein.water": { ru: "На воду жилу не положить", en: "Can't place a vein on water" },
  "vein.castle": {
    ru: "Грядки и земля замка — не для жил",
    en: "Gardens and castle land can't hold a vein",
  },
  "vein.road": { ru: "На дорогу жилу не положить", en: "Can't place a vein on a road" },
  "vein.built": {
    ru: "Здесь постройка — жила не ляжет",
    en: "There's a building here — the vein won't fit",
  },
  "vein.decor": {
    ru: "Этот декор не убрать — жила не ляжет",
    en: "This decoration can't be removed — the vein won't fit",
  },
  "vein.taken": { ru: "Здесь уже есть жила", en: "There's a vein here already" },
  "vein.spawn": {
    ru: "Здесь появляются мобы — жилу сюда нельзя",
    en: "Monsters respawn here — no vein",
  },
  "vein.no_item": { ru: "Жилы в рюкзаке нет", en: "No vein in the backpack" },
  "vein.main_world": {
    ru: "В Мире Альфа жилы свои — купленную клади в новых мирах",
    en: "Mir Alfa has its own veins — place bought ones in the new worlds",
  },
  "vein.island": {
    ru: "На острове жилы не кладут",
    en: "Veins can't be placed on the island",
  },
  "vein.busy": { ru: "Не получилось — попробуй ещё раз", en: "Didn't work — try again" },
};
