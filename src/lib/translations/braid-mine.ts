import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы шахты бета-рейда: захват за энергию, часовая добыча ресурса,
// таймер до начисления. Механика админ-онли, тексты всё равно двумя языками.
// Отдельный файл — braid-build.ts уже упёрся в лимит строк.
export const dict: Record<string, Entry> = {
  // ────────── ресурсы шахты ──────────
  "mine.res.likes": { ru: "лайки", en: "likes" },
  "mine.res.tickets": { ru: "билеты", en: "tickets" },
  "mine.res.energy": { ru: "энергия", en: "energy" },
  "mine.res.gold": { ru: "золото", en: "gold" },
  "mine.res.stone": { ru: "камень", en: "stone" },
  "mine.res.diamonds": { ru: "алмазы", en: "diamonds" },
  "mine.res.wood": { ru: "дерево", en: "wood" },
  "mine.res.token": { ru: "токен", en: "token" },
  "mine.res.custom": { ru: "товар", en: "item" },

  // ────────── окно шахты ──────────
  "mine.mines_res": { ru: "Добывает {res}", en: "Mines {res}" },
  "mine.yield_per_hour": { ru: "{n} {res} в час", en: "{n} {res} per hour" },
  "mine.working": { ru: "Шахта работает", en: "Mine is running" },
  "mine.owner_enemy": {
    ru: "Шахтой владеет другой — можно перехватить",
    en: "Owned by someone else — you can seize it",
  },
  "mine.owner_free": { ru: "Ничья — захвати первым", en: "Unclaimed — seize it first" },
  "mine.collect_for": { ru: "Собрать {n} {res}", en: "Collect {n} {res}" },
  "mine.nothing_yet": { ru: "Пока нечего собирать", en: "Nothing to collect yet" },
  "mine.collected_toast": { ru: "Собрано: {n} {res}", en: "Collected: {n} {res}" },
  "mine.collect_mines": { ru: "Собрать с шахт: {line}", en: "Collect from mines: {line}" },
  "mine.collected_all_toast": {
    ru: "Собрано с шахт: {line}",
    en: "Collected from mines: {line}",
  },
  "mine.capture_for": { ru: "Захватить за {n} энергии", en: "Seize for {n} energy" },
  "mine.capture_free": { ru: "Захватить бесплатно", en: "Seize for free" },
  "mine.capture_btn": { ru: "Захватить шахту", en: "Seize the mine" },
  "mine.captured_toast": {
    ru: "Шахта захвачена — добыча пошла",
    en: "Mine seized — mining has started",
  },
  "mine.captured_toast_cost": {
    ru: "Шахта захвачена · −{n} энергии",
    en: "Mine seized · −{n} energy",
  },
  "mine.not_configured": {
    ru: "Шахта ещё не настроена",
    en: "The mine isn't set up yet",
  },
  // Пендинг-модель: перехват останавливает секундомер прежнего, целые часы
  // начисляются ему сразу (SQL raid_mine_capture). Прежний текст про «теряет
  // накопленное» остался от крон-эпохи, и игроки читали его как правило игры.
  "mine.reseize_hint": {
    ru: "Перехват останавливает секундомер прежнего хозяина — целые часы начислятся ему сразу, минуты сгорят.",
    en: "Seizing stops the old owner's stopwatch — whole hours are credited to them at once, minutes are lost.",
  },
  "mine.you_have": { ru: "У тебя: {n} {res}", en: "You have: {n} {res}" },

  // ────────── «Шахты отбили» в окне «Добыча» ──────────
  "mine.captured_notice_title": { ru: "Шахты отбили · {n}", en: "Mines seized · {n}" },
  "mine.captured_notice_row": {
    ru: "начислено {n} {res} за {h} ч",
    en: "{n} {res} credited for {h} h",
  },
  "mine.captured_notice_zero": {
    ru: "накопленного не было (меньше часа)",
    en: "nothing accrued (under an hour)",
  },
  "mine.captured_notice_ok": { ru: "Понятно", en: "Got it" },

  // ────────── причины отказа (приходят с сервера ключом) ──────────
  "braid.mine_not_grown": {
    ru: "Шахта ещё не построена",
    en: "The mine isn't built yet",
  },
  "braid.mine_not_set": {
    ru: "Шахта ещё не настроена — добыча не задана",
    en: "The mine isn't set up yet — no yield defined",
  },
  "braid.mine_yours": { ru: "Шахта уже твоя", en: "The mine is already yours" },
  // Сбор из устаревшего окна шахты, которую уже отбили (SQL raid_mine_claim).
  "braid.mine_not_owner": {
    ru: "Шахта уже не твоя — накопленное начислено при перехвате",
    en: "The mine isn't yours anymore — the accrued yield was credited on seizure",
  },
  "braid.mine_guarded": {
    ru: "Шахту стережёт босс — сначала победи его",
    en: "A boss guards the mine — defeat it first",
  },

  // ────────── охранник шахты ──────────
  "mine.guard_title": { ru: "Охрана шахты", en: "Mine guard" },
  "mine.guard_none": { ru: "Охраны нет", en: "No guard" },
  "mine.guard_add_hint": {
    ru: "Поставь босса из рюкзака — он будет держать шахту от захвата.",
    en: "Place a boss from your backpack — it holds the mine against seizure.",
  },
  "mine.guard_pick_title": { ru: "Выбери босса", en: "Pick a boss" },
  "mine.guard_pick_empty": {
    ru: "В рюкзаке героя нет боссов. Купи босса в маркете.",
    en: "No bosses in the hero's backpack. Buy one at the market.",
  },
  "mine.guard_place": { ru: "Поставить охрану", en: "Place guard" },
  "mine.guard_placed_toast": { ru: "Босс встал на охрану шахты", en: "Boss now guards the mine" },
  "mine.guard_on_duty": { ru: "На страже", en: "On guard" },
  "mine.guard_fight": { ru: "В бой с охранником", en: "Fight the guard" },
  "mine.guard_defeated_toast": {
    ru: "Охранник повержен — шахту можно захватить",
    en: "Guard defeated — the mine can be seized",
  },
  "mine.guard_hit_toast": {
    ru: "Урон охраннику: {n} · осталось {hp} HP",
    en: "Guard damage: {n} · {hp} HP left",
  },
  "mine.guard_wiped_toast": {
    ru: "Отряд выбит — охранник устоял",
    en: "Squad wiped — the guard held",
  },
  "market.item_info": { ru: "Подробности", en: "Details" },
  "market.item_info_hint": {
    ru: "Бонусы работают только у героя нужной расы/специализации/земли",
    en: "Bonuses apply only to heroes of matching race/spec/land",
  },
  "market.item_level": { ru: "Уровень {n}", en: "Level {n}" },
  "market.item_hp": { ru: "Здоровье", en: "Health" },
  "market.item_damage": { ru: "Урон", en: "Damage" },
  "market.item_abilities": { ru: "Способности", en: "Abilities" },
  "market.item_ability_chance": { ru: "шанс {n}%", en: "{n}% chance" },
  "market.item_no_details": {
    ru: "Подробностей у этого товара нет",
    en: "This item has no extra details",
  },
  // ────────── грядка: поле, где батрачат герои ──────────
  "braid.field_yield_total": { ru: "{n} {res}/час с поля", en: "{n} {res}/h from the field" },
  "braid.field_share": { ru: "твоя доля {n} {res}/час", en: "your share {n} {res}/h" },
  "braid.field_workers": { ru: "рабочих: {n}", en: "workers: {n}" },
  "braid.field_who": { ru: "Могут работать", en: "Who can work" },
  "braid.field_any_rarity": { ru: "герои любой редкости", en: "heroes of any rarity" },
  "braid.field_any_lvl": { ru: "любой уровень", en: "any level" },
  "braid.field_lvl_from": { ru: "от {n} уровня", en: "level {n}+" },
  "braid.field_lvl_to": { ru: "до {n} уровня", en: "up to level {n}" },
  "braid.field_lvl_range": { ru: "уровни {a}–{b}", en: "levels {a}–{b}" },
  "braid.rarity_rare": { ru: "редкие", en: "rare" },
  "braid.rarity_epic": { ru: "эпические", en: "epic" },
  "braid.rarity_legendary": { ru: "легендарные", en: "legendary" },
  "braid.field_my_hero": { ru: "Батрачит: {hero}", en: "Working: {hero}" },
  "braid.field_remove": { ru: "Снять", en: "Recall" },
  "braid.field_busy": { ru: "занят", en: "busy" },
  "braid.field_here": { ru: "тут", en: "here" },
  "braid.field_lvl": { ru: "{n} ур.", en: "lvl {n}" },
  "braid.field_send": { ru: "Отправить батрачить", en: "Send to work" },
  "braid.field_send_note": {
    ru: "Герой будет недоступен, пока батрачит на поле",
    en: "The hero stays busy while working the field",
  },
  "braid.field_no_fit": {
    ru: "Нет героев, подходящих под условия поля",
    en: "No heroes match this field's terms",
  },
  "braid.field_hero_busy": {
    ru: "Герой батрачит на поле — сначала сними его оттуда",
    en: "The hero is working a field — recall him first",
  },
  "braid.field_hero_unfit": {
    ru: "Этот герой не подходит для работы на поле",
    en: "This hero doesn't match the field's terms",
  },
  "braid.field_full": {
    ru: "На поле нет свободных мест",
    en: "The field has no free spots",
  },
  "braid.field_placed": { ru: "{hero} вышел батрачить", en: "{hero} started working" },
  "braid.field_removed": { ru: "Герой снят с поля", en: "Hero recalled" },
  "braid.field_to_warehouse": {
    ru: "Урожай сам уходит на ближайший склад",
    en: "The harvest goes to the nearest warehouse automatically",
  },
  "braid.field_unfinished": { ru: "Грядка ещё не готова", en: "The field isn't ready" },
  "braid.field_unset": { ru: "Грядка не настроена", en: "The field isn't configured" },
  // ────────── склад: две личные ячейки и восемь общих ──────────
  "braid.wh_title": { ru: "Склад", en: "Warehouse" },
  "braid.wh_own": { ru: "Мои ячейки · {used}/{all}", en: "My cells · {used}/{all}" },
  "braid.wh_shared": { ru: "Общие ячейки · {used}/{all}", en: "Shared cells · {used}/{all}" },
  "braid.wh_backpack": {
    ru: "Рюкзак · {hero} · {used}/{all}",
    en: "Backpack · {hero} · {used}/{all}",
  },
  "braid.wh_no_hero": {
    ru: "Нет выбранного героя — рюкзака нет",
    en: "No hero selected — no backpack",
  },
  "braid.wh_units": { ru: "{n} шт · ячеек {cells}", en: "{n} pcs · {cells} cells" },
  "braid.wh_put": { ru: "Положить", en: "Store" },
  "braid.wh_take": { ru: "Забрать", en: "Take" },
  // Окно «сколько» у «Забрать»: сколько этого вида на полке.
  "braid.wh_have": { ru: "На складе: {n}", en: "In the warehouse: {n}" },
  "braid.wh_empty": { ru: "Пусто", en: "Empty" },
  "braid.wh_stored": {
    ru: "На склад: {own} в свои, {shared} в общие",
    en: "Stored: {own} to yours, {shared} to shared",
  },
  "braid.wh_taken": { ru: "Забрано: {n} шт", en: "Taken: {n} pcs" },
  "braid.wh_hint": {
    ru: "Из общих ячеек товар может забрать любой игрок",
    en: "Anyone can take goods from shared cells",
  },
  "braid.wh_growing": {
    ru: "Зреет (упадёт целым)",
    en: "Ripening (drops when whole)",
  },
  "braid.wh_growing_hint": {
    ru: "Зелёный «+» — зреет на поле и ещё не на полке; забирается только то, что на полке",
    en: "Green “+” is still ripening in the field; only what is on the shelf can be taken",
  },
  "braid.wh_full": { ru: "Склад заполнен", en: "The warehouse is full" },
  // Отказы по выбору полки: с «Себе» при свободной общей общее «заполнен» врало.
  "braid.wh_own_full": {
    ru: "Твои ячейки заняты — положи в общую",
    en: "Your cells are full — try the shared shelf",
  },
  "braid.wh_shared_full": { ru: "Общая полка заполнена", en: "The shared shelf is full" },
  "braid.wh_too_small": {
    ru: "Слишком мало — на полку не ляжет",
    en: "Too little to put on the shelf",
  },
  "braid.wh_not_enough": { ru: "В рюкзаке столько нет", en: "Not that much in the backpack" },
  "braid.wh_gone": { ru: "Этот товар уже забрали", en: "Someone already took it" },
  "braid.wh_unfinished": { ru: "Склад ещё не достроен", en: "The warehouse isn't finished" },
};
