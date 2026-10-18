import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Остров новичка (владелец, 14.10.2026): «игроку вначале нужна конкретная
// инструкция — куда нажать, чтобы перейти туда». Тексты шагов называют кнопки
// ровно так, как они подписаны в игре.
export const dict: Record<string, Entry> = {
  "island.title": { ru: "Остров", en: "Island" },
  "island.step_of": { ru: "Шаг {n} из {total}", en: "Step {n} of {total}" },
  "island.show": { ru: "Показать", en: "Show" },
  "island.collapse": { ru: "Свернуть задание", en: "Collapse quest" },
  "island.expand": { ru: "Развернуть задание", en: "Expand quest" },
  "island.step_done": { ru: "Готово: {title}", en: "Done: {title}" },
  "island.all_done": { ru: "Задание острова пройдено", en: "Island quest complete" },

  "island.hello.title": { ru: "Твой остров", en: "Your island" },
  "island.hello.text": {
    ru: "Здесь только ты. Открой 8 ачивок: руби деревья, добывай кристаллы, бей боссов, копай клады, лови рыбу, построй корабль на верфи и плавай, разведывай остров, собирай с шахты. Когда все 8 возьмут «Обычную», почини портал — он ведёт в основной мир. Подсказки — во вкладке «Обучение».",
    en: "Only you live here. Unlock 8 achievements: chop trees, mine crystals, fight bosses, dig treasure, fish, build a ship at the shipyard and sail, explore the island, collect from the mine. When all 8 reach «Common», repair the portal — it leads to the main world. Tips are in the «Tutorial» tab.",
  },
  "island.hello.go": { ru: "Начать", en: "Start" },

  "island.walk.title": { ru: "Дойди до сундука", en: "Walk to the chest" },
  "island.walk.text": {
    ru: "Нажми на сундук — появится маршрут. Нажми на нём «Забрать»: герой дойдёт до сундука. Каждый шаг тратит энергию.",
    en: "Tap the chest — a route appears. Tap «Take» on it: the hero walks to the chest. Every step costs energy.",
  },
  "island.chest.title": { ru: "Открой сундук", en: "Open the chest" },
  "island.chest.text": {
    ru: "Сундук рядом: нажми на него — откроется сразу. Внутри доски: из них делают топор.",
    en: "The chest is next to you: tap it — it opens right away. It holds planks: an axe is made of them.",
  },
  "island.axe.title": { ru: "Сделай топор", en: "Make an axe" },
  "island.axe.text": {
    ru: "Нажми на кузницу у города, на маршруте — «Кузница»: герой дойдёт, откроется её окно. У «Деревянный Топор» нажми «+», затем «Купить». Цена — 1 доска.",
    en: "Tap the forge by the town, then «Forge» on the route: the hero walks there and its window opens. Tap «+» on «Wooden Axe», then «Buy». It costs 1 plank.",
  },
  "island.chop.title": { ru: "Сруби дуб", en: "Chop an oak" },
  "island.chop.text": {
    ru: "Нажми на дуб, затем «Срубить». Топор берётся в руку сам; если попросит — «Взять». Деревянный топор ломается за 2 удара — новый делается из доски.",
    en: "Tap an oak, then «Chop». The axe goes into your hand by itself; if asked — «Take». A wooden axe breaks after 2 hits — craft another from a plank.",
  },
  "island.slime.title": { ru: "Победи слизня", en: "Defeat a slime" },
  "island.slime.text": {
    ru: "Нажми на слизня → «В бой» → «Атаковать». Бьются фишки, герой усиливает их. Слизень оставит горную руду.",
    en: "Tap a slime → «Fight» → «Attack». Chips fight, the hero boosts them. The slime drops mountain ore.",
  },
  "island.pickaxe.title": { ru: "Сделай кирку", en: "Make a pickaxe" },
  "island.pickaxe.text": {
    ru: "В кузнице у «Каменная Кирка» нажми «+», затем «Купить». Цена — 1 бревно дуба и 1 горная руда.",
    en: "In the forge tap «+» on «Stone Pickaxe», then «Buy». It costs 1 oak log and 1 mountain ore.",
  },
  "island.crystal.title": { ru: "Добудь кристалл", en: "Mine a crystal" },
  "island.crystal.text": {
    ru: "Нажми на синий кристалл, затем «Добыть». Если попросит взять кирку в руку — «Взять». Получишь магическую пыльцу — она нужна порталу.",
    en: "Tap the blue crystal, then «Mine». If asked to take the pickaxe — «Take». You get magic dust — the portal needs it.",
  },
  "island.mine.title": { ru: "Захвати шахту", en: "Seize the mine" },
  "island.mine.text": {
    ru: "Нажми на лесопилку, на маршруте — «Лесопилка»: откроется её окно. Нажми «Захватить за 10 энергии». Лесопилка сама добывает 1 дерево в час, не дольше недели — забирай его в «Добыче».",
    en: "Tap the sawmill, then «Sawmill» on the route: its window opens. Tap «Seize for 10 energy». It produces 1 wood per hour, for up to a week — collect it in «Harvest».",
  },
  "island.shovel.title": { ru: "Сделай лопату", en: "Make a shovel" },
  "island.shovel.text": {
    ru: "В кузнице у «Каменная Лопата» нажми «+», затем «Купить». Цена — 1 бревно дуба и 1 горная руда.",
    en: "In the forge tap «+» on «Stone Shovel», then «Buy». It costs 1 oak log and 1 mountain ore.",
  },
  "island.dig.title": { ru: "Выкопай клад", en: "Dig up the treasure" },
  "island.dig.text": {
    ru: "Нажми на бугорок у портала, затем «Выкопать». Если попросит взять лопату в руку — «Взять». Внутри слиток железа.",
    en: "Tap the mound by the portal, then «Dig up». If asked to take the shovel — «Take». An iron ingot is inside.",
  },
  "island.portal.title": { ru: "Почини портал", en: "Repair the portal" },
  "island.portal.text": {
    ru: "Нажми на разрушенный портал, на маршруте — «Портал острова»: откроется окно. Нажми «Построить». Нужно 2 бревна дуба, 2 магической пыльцы и 1 слиток железа.",
    en: "Tap the ruined portal, then «Island portal» on the route: its window opens. Tap «Build». It takes 2 oak logs, 2 magic dust and 1 iron ingot.",
  },
  "island.leave.title": { ru: "Иди в основной мир", en: "Go to the main world" },
  "island.leave_warn": {
    ru: "Назад на остров не вернуться",
    en: "No way back to the island",
  },
  "island.leave.text": {
    ru: "Нажми на портал, затем «Войти в портал». В основном мире все игроки и вся движуха.",
    en: "Tap the portal, then «Enter the portal». The main world is where all players and all the action are.",
  },

  "island.final.title": { ru: "Ты в основном мире", en: "You are in the main world" },
  "island.final.text": {
    ru: "Здесь все игроки: города, лавки, шахты, боссы и турниры. Всё, что собрал на острове, — в рюкзаке героя.",
    en: "All players are here: towns, shops, mines, bosses and tournaments. Everything you gathered on the island is in your hero's backpack.",
  },
  "island.final.go": { ru: "Вперёд", en: "Let's go" },

  // Дополнительные задания (14.10 вечер) — коротко.
  "island.tour.training": {
    ru: "Тренировочный лагерь — твои фишки и паки: «Паки» → «Открыть».",
    en: "Training camp — your chips and packs: «Packs» → «Open».",
  },
  "island.tour.tavern": {
    ru: "Таверна — герои и артефакты: смена героя и снаряжение.",
    en: "Tavern — heroes and artifacts: switch heroes and gear up.",
  },
  "island.tour.shop": {
    ru: "Торговый дом — паки фишек и артефакты.",
    en: "Trading house — chip packs and artifacts.",
  },
  "island.tour.warehouse": {
    ru: "Склад — вещи, которым не хватило места в рюкзаке.",
    en: "Warehouse — things that do not fit in the backpack.",
  },
  "island.tour.hall": {
    ru: "Ратуша — дела замка: аукционный дом и казино.",
    en: "Town hall — castle affairs: auction house and casino.",
  },
  "island.tour.gates": {
    ru: "Ворота — выход обратно на карту.",
    en: "Gates — back out to the map.",
  },
  "island.no_home": {
    ru: "На острове основной замок не выбирают",
    en: "You can't choose a main castle on the island",
  },

  // Тест админа
  "island.admin": { ru: "Остров новичка", en: "Newbie island" },
  "island.admin_enter": { ru: "На остров", en: "To the island" },
  "island.admin_leave": { ru: "Вернуться", en: "Go back" },
  "island.admin_reset": { ru: "Новый остров", en: "New island" },
  "island.admin_reset_confirm": {
    ru: "Остров и задание начнутся заново",
    en: "The island and the quest will start over",
  },
  "island.not_yours": { ru: "Это не твой остров", en: "This is not your island" },
  "island.move_failed": {
    ru: "Не удалось перейти — попробуй ещё раз",
    en: "Could not move — try again",
  },
  "island.no_world": { ru: "Нет образца мира для острова", en: "No world sample for the island" },
};
