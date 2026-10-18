import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: постройки гекс-рейда — верфь, вышка, дерево уровней, корабли,
// герой и причины отказа, которые сервер отдаёт ключом.
// Вынесено из braid.ts, чтобы файлы словаря оставались ≤250 строк.
export const dict: Record<string, Entry> = {
  // ────────── табличка ──────────
  "braid.sign_title": { ru: "Табличка", en: "Sign" },
  "braid.sign_read": { ru: "Прочитать", en: "Read" },
  "braid.sign_faded": {
    ru: "Надпись стёрлась от дождей — не разобрать.",
    en: "The writing has washed away — nothing to make out.",
  },
  // ────────── постройки ──────────
  "braid.building": { ru: "Постройка", en: "Building" },
  "braid.build_done": { ru: "Постройка готова", en: "Building complete" },
  "braid.build_maxed": { ru: "Здесь уже всё построено", en: "Everything is built here" },
  "braid.build_for": { ru: "Построить {name} за {price}", en: "Build {name} for {price}" },
  "braid.built_toast": { ru: "Построено: {name}", en: "Built: {name}" },
  "braid.open_failed": { ru: "Не открылось", en: "Failed to open" },
  "braid.building_open_error": {
    ru: "Не удалось открыть постройку",
    en: "Could not open the building",
  },
  "braid.requires_hero": { ru: "Нужен герой{race}{spec}", en: "Requires a hero{race}{spec}" },
  "braid.price_tickets": { ru: "{n} билетов", en: "{n} tickets" },
  "braid.price_likes": { ru: "{n} лайков", en: "{n} likes" },
  "braid.price_energy": { ru: "{n} энергии", en: "{n} energy" },
  "braid.price_tokens": { ru: "{n} {token}", en: "{n} {token}" },
  "braid.no_price": { ru: "цена не задана", en: "price not set" },
  "braid.price_tokens_any": { ru: "{n} токенов", en: "{n} tokens" },
  "braid.req_race": { ru: " расы «{race}»", en: " of the {race} race" },

  // ────────── верфь и вышка ──────────
  "braid.launch_ship_for": {
    ru: "Спустить корабль за {n} лайков",
    en: "Launch a ship for {n} likes",
  },
  "braid.build_ship": { ru: "Построить корабль", en: "Build a ship" },
  "braid.ship_launched_toast": {
    ru: "Корабль спущен на воду · −{n} лайков",
    en: "Ship launched · −{n} likes",
  },
  // Большой корабль: цена деревом и товаром, ходит по океану.
  "braid.big_ship_for": {
    ru: "Большой корабль — {wood} дерева + {item}",
    en: "Big ship — {wood} wood + {item}",
  },
  "braid.build_big_ship": { ru: "Построить большой", en: "Build a big ship" },
  "braid.big_ship_launched_toast": {
    ru: "Большой корабль спущен на воду",
    en: "Big ship launched",
  },
  "braid.scout_for": {
    ru: "Осмотреть округу на {r} клеток за {e} энергии",
    en: "Scout {r} cells around for {e} energy",
  },
  "braid.reveal_terrain": { ru: "Открыть местность", en: "Reveal terrain" },
  "braid.scouted_toast": {
    ru: "Округа осмотрена · открыто клеток: {n}",
    en: "Area scouted · cells revealed: {n}",
  },

  // ────────── дерево уровней ──────────
  "braid.plus_level": { ru: "+1 уровень", en: "+1 level" },
  "braid.tree_desc": {
    ru: "Дерево растит уровень основного героя",
    en: "The tree grows your main hero's level",
  },
  "braid.tree_becomes": { ru: "{hero} станет {n} ур.", en: "{hero} becomes lvl {n}" },
  "braid.tree_once": {
    ru: "Дерево помогает один раз — вернуться к нему не выйдет.",
    en: "The tree helps only once — you can't come back to it.",
  },
  "braid.tree_grow_for": { ru: "Прокачать за {price}", en: "Grow for {price}" },
  "braid.tree_other_price": { ru: "Выбрать другую цену", en: "Choose another price" },
  "braid.tree_grown_toast": { ru: "{hero} — {n} ур. · −{paid}", en: "{hero} — lvl {n} · −{paid}" },
  "braid.tree_price_lost": {
    ru: "Цена не найдена — открой дерево заново",
    en: "Price not found — reopen the tree",
  },
  "braid.lvl_of": { ru: "{n} ур. из {max}", en: "lvl {n} of {max}" },

  // ────────── таверна: смена основного героя за лайки ──────────
  "braid.tavern_title": { ru: "Таверна", en: "Tavern" },
  "braid.tavern_open": { ru: "Сменить героя", en: "Change hero" },
  "braid.tavern_screen": { ru: "Таверна: герои и артефакты", en: "Tavern: heroes and artifacts" },
  "braid.tavern_hint": {
    ru: "Трактирщик поменяет основного героя. Сколько раз в сутки — решает тир таверны.",
    en: "The innkeeper swaps your main hero. The tavern's tier sets how many times a day.",
  },
  "braid.tavern_swaps_left": {
    ru: "Смены героя: {n} из {max}",
    en: "Hero swaps: {n} of {max}",
  },
  "braid.tavern_next_swap": {
    ru: "Следующая через {h} ч {m} мин",
    en: "Next one in {h}h {m}m",
  },
  "braid.tavern_next_swap_min": {
    ru: "Следующая через {m} мин",
    en: "Next one in {m}m",
  },
  "braid.tavern_no_swaps": {
    ru: "В этой таверне смены кончились",
    en: "No swaps left at this tavern",
  },
  "braid.tavern_pick": { ru: "Выбери героя", en: "Pick a hero" },
  "braid.tavern_current": { ru: "Сейчас основной", en: "Current main" },
  "braid.tavern_your_likes": { ru: "У тебя {n} лайков", en: "You have {n} likes" },
  "braid.tavern_swap_for": { ru: "Сменить за {n} лайков", en: "Change for {n} likes" },
  "braid.tavern_swap_free": { ru: "Сменить бесплатно", en: "Change for free" },
  "braid.tavern_swapped_toast": {
    ru: "{hero} — основной герой · −{n} лайков",
    en: "{hero} is your main hero · −{n} likes",
  },
  "braid.tavern_need_likes": {
    ru: "Не хватает лайков: нужно {n}",
    en: "Not enough likes: {n} needed",
  },
  "braid.tavern_unfinished": {
    ru: "Таверна ещё строится — трактирщика нет",
    en: "The tavern is still being built — no innkeeper yet",
  },

  // ────────── корабль ──────────
  "braid.ship": { ru: "Корабль", en: "Ship" },
  "braid.ship_yours": { ru: "Ты у штурвала", en: "You're at the helm" },
  "braid.ship_busy": { ru: "Занят другим игроком", en: "Taken by another player" },
  // Список складов игрока: «где мои вещи».
  "braid.wh_my_list": { ru: "Мои склады", en: "My storages" },
  "braid.wh_at_cell": { ru: "Клетка {q}:{r}", en: "Cell {q}:{r}" },
  // Склад: куда класть вещи из рюкзака.
  "braid.wh_scope_auto": { ru: "Сам", en: "Auto" },
  "braid.wh_scope_own": { ru: "Себе", en: "Mine" },
  "braid.wh_scope_shared": { ru: "В общую", en: "Shared" },
  "braid.ship_free": { ru: "Свободен", en: "Free" },
  // Несколько судов на одной клетке: игрок выбирает борт, а не «какой-то».
  "braid.ship_pick": { ru: "Какой корабль", en: "Which ship" },
  "braid.ship_small": { ru: "Малое судно", en: "Small ship" },
  "braid.ship_big": { ru: "Большой корабль", en: "Big ship" },
  "braid.ship_leave": { ru: "Сойти", en: "Disembark" },
  "braid.ship_take": { ru: "Занять", en: "Take" },
  "braid.ship_mine_title": { ru: "Твой корабль", en: "Your ship" },
  "braid.ship_other_title": { ru: "Чужой корабль", en: "Someone else's ship" },
  "braid.ship_mine_hint": {
    ru: "Сойти можно на любой берег рядом.",
    en: "You can step ashore on any nearby coast.",
  },
  "braid.ship_other_hint": {
    ru: "На борту другой игрок — дождись, пока он сойдёт.",
    en: "Another player is aboard — wait until they disembark.",
  },
  "braid.ship_free_hint": {
    ru: "Корабль ничей: занимай, пока не увели.",
    en: "The ship belongs to nobody: take it before someone else does.",
  },
  "braid.ship_go_ashore": { ru: "Сойти на берег", en: "Go ashore" },
  // Почему кнопка схода не нажимается: берега нет — или цена не доехала.
  "braid.ship_no_shore": {
    ru: "Рядом нет берега — сходить некуда",
    en: "No shore nearby — nowhere to step off",
  },
  "braid.ship_ashore_retry": {
    ru: "Цена схода не загрузилась — повторить",
    en: "Landing cost didn't load — retry",
  },
  "braid.ship_board": { ru: "Занять корабль", en: "Board the ship" },
  // ── запас хода и починка ──
  "braid.ship_hp": { ru: "Запас хода", en: "Hull" },
  "braid.hero_at_field": { ru: "батрачит", en: "in the field" },
  "braid.ship_dead_title": { ru: "Разбитый корабль", en: "Wrecked ship" },
  "braid.ship_wreck_far": {
    ru: "Корабль разбит — до него надо доплыть на другом",
    en: "The ship is wrecked — sail there on another one",
  },
  "braid.ship_dead_hint": {
    ru: "Запас хода кончился — судно стоит, пока его не починят досками.",
    en: "Out of hull — the ship stays put until it is repaired with planks.",
  },
  "braid.ship_repair": { ru: "Починить", en: "Repair" },
  "braid.ship_repair_hint": {
    ru: "Одна доска возвращает {n} запаса хода",
    en: "One plank restores {n} hull",
  },
  "braid.ship_repair_need": { ru: "нужно досок: {n}", en: "planks needed: {n}" },
  "braid.ship_repair_have": { ru: "в рюкзаке: {n}", en: "in backpack: {n}" },
  "braid.ship_repaired": {
    ru: "Починили: {n} досок, запас хода {hp}",
    en: "Repaired: {n} planks, hull {hp}",
  },
  "braid.ship_repair_far": {
    ru: "До корабля надо дойти",
    en: "Get closer to the ship first",
  },
  "braid.ship_repair_none": { ru: "Чинить нечего", en: "Nothing to repair here" },
  "braid.ship_scrap": {
    ru: "Разобрать · {n} досок · {e}⚡",
    en: "Scrap · {n} planks · {e}⚡",
  },
  "braid.ship_scrapped": {
    ru: "Разобрал: {n} досок в рюкзаке",
    en: "Scrapped: {n} planks added to backpack",
  },
  "braid.ship_scrap_far": {
    ru: "До корабля надо дойти",
    en: "Get closer to the ship first",
  },
  "braid.ship_scrap_none": {
    ru: "Разбирать нечего — судно ещё живо",
    en: "Nothing to scrap — the ship is still afloat",
  },
  "braid.ship_repair_no_planks": {
    ru: "Нет досок в рюкзаке героя",
    en: "No planks in the hero's backpack",
  },
  "braid.ship_aboard_toast": {
    ru: "Ты на борту · −{n} энергии",
    en: "You're aboard · −{n} energy",
  },
  "braid.ship_ashore_toast": {
    ru: "Сошёл на берег · −{n} энергии",
    en: "Ashore · −{n} energy",
  },
  // Маршрут с пересадкой: пока шли по суше, судно на той стороне заняли.
  // Говорим об этом ДО того, как за шаг в воду списана энергия.
  "braid.ship_taken": {
    ru: "Корабль заняли, пока ты шёл — дальше пути нет",
    en: "The ship was taken while you walked — no way onward",
  },

  // ────────── турнир гекс-рейда ──────────
  "braid.beta_raid": { ru: "Бета рейд", en: "Beta raid" },
  "braid.tour_by_objects": { ru: "Урон по объектам", en: "Damage to objects" },
  "braid.tour_empty": {
    ru: "Пока никто не бил объекты бета-рейда",
    en: "Nobody has fought beta-raid objects yet",
  },
  "braid.tour_more": { ru: "Ещё {n} из {total}", en: "{n} more of {total}" },

  // ────────── карта и тосты ──────────
  "braid.chip": { ru: "Фишка", en: "Chip" },
  "braid.effects_summary": { ru: "Эффектов: {n}", en: "Effects: {n}" },
  "braid.no_map": { ru: "Карта не установлена", en: "No map is set" },
  "braid.main_hero": { ru: "Основной герой", en: "Main hero" },
  "braid.to_castle": { ru: "К замку", en: "To castle" },
  "braid.by_damage": { ru: "по урону", en: "by damage" },
  "braid.toast_stunned": {
    ru: "{chip} оглушена — отдых {n} мин",
    en: "{chip} stunned — resting {n} min",
  },
  // Награда ждёт не «над картой»: плашки убраны, всё забирается в окне
  // «Добыча» за кружком с киркой под мини-картой.
  "braid.toast_loot": {
    ru: "{badge}: {rewards} — забери в «Добыче»",
    en: "{badge}: {rewards} — claim in Harvest",
  },
  "braid.toast_killed": {
    ru: "{badge} повержен — награда ждёт в «Добыче»",
    en: "{badge} defeated — the reward waits in Harvest",
  },
  "braid.toast_emptied": { ru: "{badge} опустошён", en: "{badge} emptied" },
  "braid.toast_hp_left": { ru: "{badge}: осталось {n}%", en: "{badge}: {n}% left" },
  "braid.move_failed": { ru: "Не дошли", en: "Didn't get there" },
  "braid.no_path": { ru: "Туда не пройти", en: "Can't go there" },
  "braid.need_ship": { ru: "Нужен корабль", en: "You need a ship" },
  "braid.water_target_only": {
    ru: "Он на воде — подойти можно только на корабле",
    en: "It's on the water — only reachable by ship",
  },
  "braid.ship_unreachable": {
    ru: "До свободного корабля не добраться посуху",
    en: "No land route to a free ship",
  },
  // Океан — глубокая вода: пройдёт только большой корабль. Ключом отвечает и
  // сервер (move-step), и клиент (useCellTap).
  "braid.ship_too_small": {
    ru: "Ваш корабль слишком мал для этих вод",
    en: "Your ship is too small for these waters",
  },

  // Ключом отвечает сервер (ship-ride.boardShipCore): на одном судне один
  // игрок, и в двух лодках сразу не сидят.
  "braid.already_aboard": {
    ru: "Ты уже на корабле",
    en: "You're already aboard a ship",
  },
  // Ключом отвечает и сам сервер (helpers.isValidMove) — см. serverErrorText.
  "braid.void_blocked": {
    ru: "Здесь глухой туман — пройти нельзя",
    en: "Dead fog — there's no way through",
  },

  // ────────── основной герой и его отряд ──────────
  "braid.hero_squad": { ru: "Отряд героя", en: "Hero squad" },
  "braid.squad_hint": {
    ru: "До {n} фишек. Этим отрядом герой пойдёт в бой.",
    en: "Up to {n} chips. The hero fights with this squad.",
  },
  "braid.squad_save": { ru: "Сохранить отряд", en: "Save squad" },
  "braid.squad_saved_toast": {
    ru: "Отряд героя сохранён: {n} фишек",
    en: "Hero squad saved: {n} chips",
  },
  "braid.hero_pick_hint": {
    ru: "Герой ходит по карте и открывает постройки. Сменить основного героя можно раз в сутки",
    en: "The hero walks the map and opens buildings. You can change your main hero once a day",
  },
  "braid.hero_switch_in": { ru: " — следующая смена через {n} ч", en: " — next change in {n} h" },
  "braid.no_heroes": {
    ru: "Героев пока нет — преврати фишку в героя в инвентаре.",
    en: "No heroes yet — turn a chip into a hero in your inventory.",
  },
  "braid.hero_lvl_short": { ru: "ур. {n}/{max}", en: "lvl {n}/{max}" },
  "braid.make_main_q": {
    ru: "Сделать основным? Следующая смена станет доступна только через сутки.",
    en: "Make this hero your main? The next change unlocks only in a day.",
  },
  "braid.main_hero_set": { ru: "Основной герой выбран", en: "Main hero selected" },

  // ────────── причины отказа (приходят с сервера ключом) ──────────
  "braid.tree_not_grown": { ru: "Дерево ещё не выросло", en: "The tree hasn't grown yet" },
  "braid.tree_not_set": { ru: "Дерево ещё не настроено", en: "The tree isn't set up yet" },
  "braid.pick_hero_first": {
    ru: "Сначала выбери основного героя",
    en: "Pick your main hero first",
  },
  // Дерево поднимает только до обычного потолка (повышенные уровни — лайками, 02.10).
  "braid.hero_at_max": { ru: "Дерево поднимает до {n} ур.", en: "The tree raises up to lvl {n}" },
  "braid.tree_used": { ru: "Это дерево тебе уже помогло", en: "This tree has already helped you" },
  "braid.shipyard_unfinished": { ru: "Верфь ещё не достроена", en: "The shipyard isn't finished" },
  "braid.no_free_water": {
    ru: "Рядом с верфью нет воды",
    en: "No water next to the shipyard",
  },
  "braid.tower_unfinished": { ru: "Вышка ещё не достроена", en: "The tower isn't finished" },
  "braid.tower_used": {
    ru: "Ты уже осмотрел округу отсюда",
    en: "You've already scouted from here",
  },

  // ────────── алтарь-БУСТ: временная прибавка к характеристике ──────────
  "braid.boost_free": { ru: "бесплатно", en: "free" },
  "braid.boost_for_hero": { ru: "герою {hero}", en: "for {hero}" },
  "braid.boost_active": { ru: "Сейчас действует: {line}", en: "Active now: {line}" },
  "braid.boost_confirm": { ru: "{gift} · цена: {cost}", en: "{gift} · price: {cost}" },
  "braid.boost_take": { ru: "Получить буст", en: "Take the boost" },
  "braid.boost_done_toast": { ru: "{hero}: {line}", en: "{hero}: {line}" },
  "braid.boost_temp_note": {
    ru: "Действует указанное время и снимется само",
    en: "Lasts the stated time, then wears off",
  },
  "braid.boost_unfinished": { ru: "Алтарь ещё не достроен", en: "The altar isn't finished" },
  "braid.boost_no_hero": {
    ru: "Сначала выбери основного героя",
    en: "Pick your main hero first",
  },
  "braid.boost_item_use": { ru: "Использовать", en: "Use" },
  "braid.boost_item_gives": { ru: "Даёт {gift}", en: "Gives {gift}" },
  "braid.boost_item_done": { ru: "{hero}: {line}", en: "{hero}: {line}" },
};
