import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Корабли и отказы шага на маршруте. Отдельный файл — braid-build.ts, где живут
// прежние ключи кораблей, давно за лимитом строк.
export const dict: Record<string, Entry> = {
  // Дорога лежит через океан, а свободного целого БОЛЬШОГО корабля нет —
  // маршрут не предлагаем и в малый не сажаем (владелец, 03.10.2026). Ключом
  // отвечает и сервер (move-step: посадка «только в большой»), и клиент
  // (routeSearch, routeFleet).
  "braid.ship_need_big": { ru: "Нет подходящего корабля", en: "No suitable ship" },
  "braid.bridge_ship_stop": {
    ru: "Под мостом нельзя остановить корабль",
    en: "A ship cannot stop beneath the bridge",
  },
  "braid.bridge_deck_only": {
    ru: "На мост можно войти только со стороны настила",
    en: "Enter the bridge from the deck side",
  },
  // Отказы шага на маршруте (сервер, move-step-guard). Тормоз частоты: чаще
  // клиент не ходит — это скрипт или зажатая клавиша.
  "braid.step_too_fast": {
    ru: "Слишком частые шаги — подожди секунду",
    en: "Too many steps — wait a second",
  },
  // Шаг пришёл с клетки, где героя уже нет (повтор того же шага, вторая вкладка):
  // не засчитан и не оплачен.
  "braid.step_stale": {
    ru: "Герой уже сдвинулся — шаг не засчитан",
    en: "Your hero has already moved — step not counted",
  },
  // Подбитый синим динамитом корабль (владелец, 30.10.2026; dynamite-08): не чинится
  // (доски, «Ремонт корабля» — ship-blasted), клетку держит, через час исчезает.
  "braid.ship_blasted_title": { ru: "Подбитый корабль", en: "Blasted ship" },
  "braid.ship_blasted_no_repair": {
    ru: "Подбитый корабль не починить",
    en: "A wrecked ship can't be repaired",
  },
  "braid.ship_blasted_cell": {
    ru: "Там подбитый корабль — клетка занята",
    en: "A wrecked ship blocks that tile",
  },
  "braid.ship_blasted_left": { ru: "Исчезнет через {n} мин", en: "Disappears in {n} min" },
  "braid.ship_blasted_gone": { ru: "Сейчас исчезнет", en: "Disappearing now" },
};
