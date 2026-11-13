import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Мир строителей (lib/landPlace): кнопка в рюкзаке, окно укладки земли, земля в
// руке, отказы сервера (land.*), закрытый портал (builder.*) и общий для окон
// земли и динамита предел выбора клеток (pick.max).
export const dict: Record<string, Entry> = {
  "land.put": { ru: "Положить", en: "Place" },
  // Окно «!» у товара земли в лавке: сколько энергии уходит на клетку.
  "land.info_energy": {
    ru: "⚡ В пустоту — даром · поверх другой земли — {n}",
    en: "⚡ Into the void — free · over other land — {n}",
  },
  "land.title": { ru: "Положить землю", en: "Place land" },
  "land.place": { ru: "Разместить", en: "Place" },
  "land.placed": { ru: "Земля положена", en: "Land placed" },
  "land.place_n": { ru: "Разместить ×{n}", en: "Place ×{n}" },
  "land.placed_n": { ru: "Положено клеток: {n}", en: "Cells placed: {n}" },
  "land.partial": { ru: "Положено {done} из {all}", en: "Placed {done} of {all}" },
  "land.hand": { ru: "В руку", en: "To hand" },
  "land.hand_on_map": {
    ru: "Земля в руке — открой карту и тапай по клеткам рядом с героем",
    en: "Land in hand — open the map and tap cells next to the hero",
  },
  // Вещь в руке (hand/*): земля и динамит в главной руке.
  "hand.on_map": {
    ru: "В руке — открой карту и тапай по клеткам рядом с героем",
    en: "In hand — open the map and tap cells next to the hero",
  },
  "hand.put_away": { ru: "Убрать из руки", en: "Put away" },
  "hand.quick": { ru: "Тап = разместить", en: "Tap = place" },
  "hand.clear": { ru: "Снять отметки", en: "Clear marks" },
  "land.same": { ru: "Здесь уже эта земля", en: "This land is already here" },
  "land.built": {
    ru: "Здесь объект или декор — перестроить нельзя",
    en: "There's an object or decoration here — can't rebuild",
  },
  "land.building_other": {
    ru: "Под чужой постройкой землю не меняют",
    en: "Can't change the land under someone else's building",
  },
  "land.water_building": {
    ru: "Под постройку воду не кладут",
    en: "Water can't go under a building",
  },
  "land.hero": {
    ru: "Здесь стоит герой — перестроить нельзя",
    en: "A hero is standing here — can't rebuild",
  },
  "pick.max": { ru: "Больше нет в рюкзаке", en: "No more in the backpack" },
  "land.cells_failed": { ru: "Не удалось проверить клетки", en: "Couldn't check the cells" },
  "land.far": {
    ru: "Слишком далеко — до 3 клеток от героя",
    en: "Too far — up to 3 cells from the hero",
  },
  "land.edge": { ru: "Дальше мира нет", en: "The world ends here" },
  "land.taken": { ru: "Здесь уже есть земля", en: "There's land here already" },
  "land.no_item": { ru: "Земли в рюкзаке нет", en: "No land in the backpack" },
  "land.gone_kind": {
    ru: "Эта местность больше не продаётся",
    en: "This terrain is no longer available",
  },
  "land.busy": { ru: "Не получилось — попробуй ещё раз", en: "Didn't work — try again" },
  "land.wrong_world": {
    ru: "Землю можно класть только в мире строителей",
    en: "Land can only be placed in the Builders' world",
  },
  "land.closed": { ru: "Мир строителей пока закрыт", en: "The Builders' world is closed for now" },
  "builder.closed": {
    ru: "Мир строителей пока закрыт",
    en: "The Builders' world is closed for now",
  },
};
