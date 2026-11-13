import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Динамит (lib/dynamite): кнопка в рюкзаке, окно броска, итог и отказы сервера
// (dynamite.*). Нехватка энергии — общий mineplace.no_energy.
export const dict: Record<string, Entry> = {
  "dynamite.throw": { ru: "Бросить", en: "Throw" },
  "dynamite.title": { ru: "Бросить динамит", en: "Throw dynamite" },
  "dynamite.throw_cost": { ru: "Бросить · ⚡{n}", en: "Throw · ⚡{n}" },
  "dynamite.throw_many": { ru: "Бросить ×{k} · ⚡{n}", en: "Throw ×{k} · ⚡{n}" },
  "dynamite.partial": { ru: "Брошено {done} из {all}", en: "Thrown {done} of {all}" },
  "dynamite.cells_failed": { ru: "Не удалось проверить клетки", en: "Couldn't check the cells" },
  // Итог взрыва (тост)
  "dynamite.done": { ru: "Взрыв", en: "Blast" },
  "dynamite.done_empty": { ru: "Взрыв — ничего не задело", en: "Blast — nothing was hit" },
  "dynamite.part_mines": { ru: "шахт снесено: {n}", en: "mines destroyed: {n}" },
  "dynamite.part_hits": { ru: "задето целей: {n}", en: "targets hit: {n}" },
  "dynamite.part_kills": { ru: "повержено: {n}", en: "defeated: {n}" },
  "dynamite.part_decor": { ru: "деревьев и камней: {n}", en: "trees and rocks: {n}" },
  // Синий динамит (§8.75а): что стало с шахтой
  "dynamite.part_guards_off": { ru: "охрана снята: {n}", en: "guards removed: {n}" },
  "dynamite.part_levels": { ru: "уровень шахты −1: {n}", en: "mine level −1: {n}" },
  "dynamite.part_broken": { ru: "шахт разрушено: {n}", en: "mines wrecked: {n}" },
  // Синий по кораблям (26.10.2026): итог бросившему и тост экипажу
  "dynamite.part_ship": { ru: "корабль взорван", en: "ship blown up" },
  "dynamite.part_ships": { ru: "кораблей взорвано: {n}", en: "ships blown up: {n}" },
  // Синий по клетке, где задеть можно только свой корабль (30.10.2026)
  "dynamite.own_ship": {
    ru: "Свой корабль взрывать нельзя",
    en: "You can't blow up your own ship",
  },
  // Красный в воду (30.10.2026): рыбалка динамитом
  "dynamite.part_fish": { ru: "всплыло рыб: {n}", en: "fish floated up: {n}" },
  "dynamite.sent_home": {
    ru: "Ваш корабль подорвали — вас телепортировало в город",
    en: "Your ship was blown up — you've been teleported to your town",
  },
  "dynamite.got_it": { ru: "Понятно", en: "Got it" },
  // Отказы сервера и красные клетки окна
  "dynamite.far": {
    ru: "Слишком далеко — до 3 клеток от героя",
    en: "Too far — up to 3 cells from the hero",
  },
  "dynamite.no_cell": { ru: "Здесь нет клетки", en: "There's no cell here" },
  "dynamite.void": { ru: "Под куполом взрывать нельзя", en: "No blasting under the dome" },
  "dynamite.town": { ru: "В городе взрывать нельзя", en: "No blasting in town" },
  "dynamite.ship_blue_only": {
    ru: "Корабли взрывает только синий динамит",
    en: "Only blue dynamite blows up ships",
  },
  "dynamite.no_item": {
    ru: "Динамита в рюкзаке нет",
    en: "There's no dynamite in your backpack",
  },
  "dynamite.island": {
    ru: "На острове динамит не бросают",
    en: "Dynamite can't be thrown on the island",
  },
  "dynamite.busy": {
    ru: "Не вышло — попробуй ещё раз",
    en: "That didn't work — try again",
  },
};
