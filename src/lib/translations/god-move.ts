import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Перемещение в режиме бога: кнопка, полоска режима, строки окна клетки, тосты
// и причины отказа сервера (godmove.<причина>, lib/godMove.ts).
export const dict: Record<string, Entry> = {
  "godmove.move": { ru: "Переместить", en: "Move" },
  "godmove.cancel": { ru: "Отмена", en: "Cancel" },
  "godmove.done": { ru: "Перемещено", en: "Moved" },
  "godmove.failed": {
    ru: "Перенос не ответил — открой клетку заново",
    en: "The move did not answer — reopen the tile",
  },
  "godmove.draft_pending": {
    ru: "Сначала выгрузи правки этих клеток",
    en: "Upload these tiles' edits first",
  },
  // Что едет — в полоске режима
  "godmove.kind.building": { ru: "Здание", en: "Building" },
  "godmove.kind.block": { ru: "Блок", en: "Block" },
  "godmove.kind.decor": { ru: "Декор", en: "Decor" },
  "godmove.kind.object": { ru: "Объект", en: "Object" },
  "godmove.kind.chest": { ru: "Сундук", en: "Chest" },
  "godmove.kind.bags": { ru: "Мешочки", en: "Bags" },
  // Строки окна клетки: что лежит на земле
  "godmove.row.chest": { ru: "Сундук", en: "Chest" },
  "godmove.row.bags": { ru: "Мешочки", en: "Bags" },
  "godmove.buried": { ru: "закопан", en: "buried" },
  // Отказы: само переносимое
  "godmove.same_cell": { ru: "Это та же клетка", en: "That is the same tile" },
  "godmove.other_map": {
    ru: "Карта сменилась — открой её заново",
    en: "The map has changed — reopen it",
  },
  "godmove.gone": { ru: "Этого на клетке уже нет", en: "It is no longer on that tile" },
  "godmove.changed": {
    ru: "На клетке уже другое — открой её заново",
    en: "Something else is on that tile now — reopen it",
  },
  "godmove.dead": { ru: "Объект повержен", en: "The object is defeated" },
  "godmove.block_many": {
    ru: "В блоке больше одного здания или декора — разъедини блок",
    en: "The block holds more than one building or decor — split it",
  },
  "godmove.chest_guard": {
    ru: "На клетке здания сундук с охраной",
    en: "A guarded chest stands on the building's tile",
  },
  // Отказы: целевая клетка
  "godmove.target_missing": { ru: "Здесь нет земли", en: "There is no ground here" },
  "godmove.target_block": { ru: "Клетка в блоке клеток", en: "The tile is in a tile block" },
  "godmove.target_water": { ru: "Это не ставят на воду", en: "This can't go on water" },
  "godmove.target_dome": { ru: "Клетка под куполом", en: "The tile is under the dome" },
  "godmove.target_building": {
    ru: "Здесь уже стоит здание",
    en: "A building already stands here",
  },
  "godmove.target_object": { ru: "Клетку занимает объект", en: "An object occupies the tile" },
  "godmove.target_runner": { ru: "На клетке беглец", en: "A runner is on the tile" },
  "godmove.target_player": { ru: "На клетке игрок", en: "A player is on the tile" },
  "godmove.target_chest": { ru: "На клетке сундук", en: "There is a chest on the tile" },
  "godmove.target_bag": { ru: "На клетке мешочек", en: "There is a bag on the tile" },
  "godmove.target_guard": { ru: "На клетке охрана", en: "There is a guard on the tile" },
  "godmove.target_decor": { ru: "Клетку занимает декор", en: "Decor occupies the tile" },
  "godmove.target_ship": { ru: "На клетке корабль", en: "There is a ship on the tile" },
  "godmove.target_leftovers": {
    ru: "На клетке остались данные убранного: {what}",
    en: "The tile still holds data of a removed one: {what}",
  },
  // Что осталось от убранного
  "godmove.lo.market": { ru: "лавка", en: "shop" },
  "godmove.lo.town": { ru: "ратуша", en: "town hall" },
  "godmove.lo.warehouse": { ru: "склад", en: "warehouse" },
  "godmove.lo.field": { ru: "грядка", en: "field" },
  "godmove.lo.mine": { ru: "шахта", en: "mine" },
  "godmove.lo.object": { ru: "бой объекта", en: "object's fight" },
};
