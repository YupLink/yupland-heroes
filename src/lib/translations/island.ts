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
    ru: "Здесь только ты. Открой 8 ачивок: руби деревья, добывай камни, бей боссов, копай клады, лови рыбу, построй корабль на верфи и плавай, разведывай остров, собирай с шахт. Когда все 8 возьмут «Обычную», почини портал — он ведёт в основной мир. Подсказки — во вкладке «Обучение».",
    en: "Only you live here. Unlock 8 achievements: chop trees, mine stones, fight bosses, dig treasure, fish, build a ship at the shipyard and sail, explore the island, collect from the mines. When all 8 reach «Common», repair the portal — it leads to the main world. Tips are in the «Tutorial» tab.",
  },
  "island.hello.go": { ru: "Начать", en: "Start" },
  "island.hero_pick.title": {
    ru: "Герой в подарок — выбери расу",
    en: "A hero as a gift — pick a race",
  },
  "island.hero_pick.done": { ru: "Герой с тобой", en: "Your hero is with you" },
  "island.hero_pick.text": {
    ru: "Выбери расу — обычный герой сразу встанет в твоих героях.",
    en: "Pick a race — a common hero joins your heroes right away.",
  },
  "island.gift_note": { ru: "Подарок острова", en: "Island gift" },

  "island.walk.title": { ru: "Дойди до сундука", en: "Walk to the chest" },
  "island.walk.text": {
    ru: "Нажми на сундук — появится маршрут. Нажми на нём «Забрать»: герой дойдёт до сундука. Каждый шаг тратит энергию.",
    en: "Tap the chest — a route appears. Tap «Take» on it: the hero walks to the chest. Every step costs energy.",
  },
  "island.chest.title": { ru: "Открой сундук", en: "Open the chest" },
  "island.chest.text": {
    ru: "Сундук рядом: нажми на него — откроется сразу. Внутри подарок острова: доски на топор, паки с фишками, лайки, золото и энергия.",
    en: "The chest is next to you: tap it — it opens right away. It holds the island gift: planks for an axe, chip packs, likes, gold and energy.",
  },
  "island.axe.title": { ru: "Сделай топор", en: "Make an axe" },
  "island.axe.text": {
    ru: "Нажми на кузницу у города, на маршруте — «Кузница»: герой дойдёт, откроется её окно. У «Деревянный Топор» нажми «+», затем «Купить». Цена — 1 доска.",
    en: "Tap the forge by the town, then «Forge» on the route: the hero walks there and its window opens. Tap «+» on «Wooden Axe», then «Buy». It costs 1 plank.",
  },
  "island.chop.title": { ru: "Сруби дуб", en: "Chop an oak" },
  "island.chop.text": {
    ru: "Нажми «Показать» и сруби отмеченный дуб. Если игра попросит, возьми топор в руку. Затем покажу бревно в рюкзаке.",
    en: "Tap «Show» and chop the marked oak. If prompted, take the axe in hand. Then I will show the log in your backpack.",
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
  "island.crystal.title": { ru: "Добудь камень", en: "Mine a stone" },
  "island.crystal.text": {
    ru: "Нажми на камень рядом с собой, затем «Добыть». Если игра попросит, возьми кирку в руку.",
    en: "Tap a stone near you, then «Mine». If prompted, take the pickaxe in hand.",
  },
  "island.shovel.title": { ru: "Сделай лопату", en: "Make a shovel" },
  "island.shovel.text": {
    ru: "В кузнице у «Каменная Лопата» нажми «+», затем «Купить». Цена — 1 бревно дуба и 1 горная руда.",
    en: "In the forge tap «+» on «Stone Shovel», then «Buy». It costs 1 oak log and 1 mountain ore.",
  },
  "island.dig.title": { ru: "Выкопай клад", en: "Dig up the treasure" },
  "island.dig.text": {
    ru: "1. Нажми «Показать»: нужен именно бугорок у портала, отмеченный жёлтой рамкой.\n2. Нажми на него и выбери «Выкопать». Если попросят, возьми лопату.\nВ этом кладе лежит слиток золота для починки лесопилки.",
    en: "1. Tap «Show»: you need the mound by the portal marked in gold.\n2. Tap it and choose «Dig up». If prompted, take the shovel.\nThis treasure holds a gold ingot for the sawmill repair.",
  },
  // Лесопилка — после клада (20.10): починка 20 золота = 10 из сундука + слиток.
  "island.mine.title": { ru: "Почини лесопилку", en: "Repair the sawmill" },
  "island.mine.text": {
    ru: "В кузнице открой «Продать» и продай слиток золота — 10 золота, ещё 10 было в сундуке. Нажми на лесопилку, на маршруте — «Лесопилка»: откроется её окно. Нажми «Починить за 20 и забрать». Лесопилка работает 7 дней — 1 дерево в час, забирай его в «Добыче».",
    en: "In the forge open «Sell» and sell the gold ingot — 10 gold, the chest gave another 10. Tap the sawmill, then «Sawmill» on the route: its window opens. Tap «Repair for 20 and claim». The sawmill works for 7 days — 1 wood per hour, collect it in «Harvest».",
  },
  "island.portal.title": { ru: "Почини портал", en: "Repair the portal" },
  "island.portal.text": {
    ru: "Нажми на разрушенный портал, на маршруте — «Портал острова»: откроется окно. Нажми «Построить». Нужно 100 дерева, 10 камня, 50 золота и 2 алмаза. Пройти в мир — герою от 5 уровня.",
    en: "Tap the ruined portal, then «Island portal» on the route: its window opens. Tap «Build». It takes 100 wood, 10 stone, 50 gold and 2 diamonds. Only a hero of level 5+ can pass to the world.",
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
    ru: "Тренировочный лагерь: здесь собираешь отряд из фишек, улучшаешь их и открываешь паки.",
    en: "Training camp: build your chip squad, upgrade chips and open packs here.",
  },
  "island.tour.tavern": {
    ru: "Таверна: здесь выбираешь героя, повышаешь его уровень и меняешь снаряжение.",
    en: "Tavern: choose a hero, raise their level and change equipment here.",
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
    ru: "Ворота: через них ты позже вернёшься на свой остров.",
    en: "Gates: you will return to your island through them later.",
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
  "island.admin_restart": { ru: "Обучение с нуля", en: "Tutorial from scratch" },
  "island.admin_restart_confirm": {
    ru: "Начать обучение с нуля? Вещи и ресурсы останутся, награды повторно не выдаются. Остров создастся заново: оставленное на нём (склад, сундуки, суда, мешочки) пропадёт вместе с ним, рюкзак героя останется.",
    en: "Start the tutorial from scratch? Items and resources stay, rewards are not given again. The island is created anew: whatever is left on it (warehouse, chests, ships, bags) is lost with it; the hero's backpack stays.",
  },
  "island.admin_restart_go": { ru: "Начать с нуля", en: "Start over" },
  "island.not_yours": { ru: "Это не твой остров", en: "This is not your island" },
  "island.hero_unknown": { ru: "Такого героя на выбор нет", en: "This hero is not on the list" },
  "island.none": { ru: "Острова нет", en: "No island" },
  "island.kept": {
    ru: "Этот остров сохранён — его не сносим и не пересоздаём",
    en: "This island is saved — it is not removed or recreated",
  },
  "island.move_failed": {
    ru: "Не удалось перейти — попробуй ещё раз",
    en: "Could not move — try again",
  },
  "island.no_world": { ru: "Нет образца мира для острова", en: "No world sample for the island" },
  "island.start_not_island": {
    ru: "Старт ставится только на острове",
    en: "The start can only be set on an island",
  },
  "island.start_bad_cell": {
    ru: "Старт — только на свободную сушу или на ратушу",
    en: "The start goes only on free land or on the town hall",
  },
  // Потолок выноса с острова (§8.114): что осталось на острове при выходе порталом.
  "island.exit_cut": {
    ru: "Лишнее осталось на острове: {list}",
    en: "The excess stayed on the island: {list}",
  },
  "island.cut_wood": { ru: "дерево {n}", en: "wood {n}" },
  "island.cut_stone": { ru: "камень {n}", en: "stone {n}" },
  "island.cut_gold": { ru: "золото {n}", en: "gold {n}" },
  "island.cut_diamonds": { ru: "алмазы {n}", en: "diamonds {n}" },
  // Потолок накопления на острове (§8.114 п. 5) — отказ продажи сверх него.
  "island.res_cap": {
    ru: "На острове новичка больше не набрать: дерево до 15 000, камень до 5 000, золото до 2 000, алмазы до 10",
    en: "The newbie island holds no more: wood up to 15,000, stone 5,000, gold 2,000, diamonds 10",
  },
  // Сдача лишних тренировочных фишек (§8.114 п. 7).
  "island.training_sale": {
    ru: "Тренировочные фишки · лишних {n}",
    en: "Training chips · spare {n}",
  },
  "island.training_sale_btn": { ru: "Сдать: +{e} энергии", en: "Hand in: +{e} energy" },
  "island.training_sale_done": {
    ru: "Сдано фишек: {n} · +{e} энергии",
    en: "Chips handed in: {n} · +{e} energy",
  },
  "island.training_sale_here": {
    ru: "Сдать фишки можно на острове новичка",
    en: "Chips can be handed in on the newbie island",
  },
  "island.training_sale_none": {
    ru: "Сдавать нечего: 10 сильнейших фишек остаются",
    en: "Nothing to hand in: the 10 strongest chips stay",
  },
};
