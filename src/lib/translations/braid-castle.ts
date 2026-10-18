import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: замок гекс-рейда — смена героя, снаряжение и то, что герой даёт в
// бою и на карте. Отдельный файл, потому что braid-build.ts уже подошёл к
// лимиту 250 строк, а тема здесь своя.
//
// Строки отряда остались: состав по-прежнему собирают — только не в замке, а
// в окне боя с боссом. Ушли лишь подписи вкладки «Отряд» замка.
//
// Ключей "braid.squad_save", "braid.squad_hint", "braid.no_heroes",
// "braid.main_hero_set" тут НЕТ намеренно: они живут в braid-build.ts, окно
// замка зовёт их оттуда, а дубль ключа ловит scripts/check-i18n.ts.
export const dict: Record<string, Entry> = {
  // ────────── замок ──────────
  "braid.castle": { ru: "Замок", en: "Castle" },
  "braid.castle_title": { ru: "Замок", en: "Castle" },
  "braid.castle_open": { ru: "Войти в замок", en: "Enter the castle" },
  "braid.castle_enter": { ru: "Войти в замок", en: "Enter the castle" },
  "braid.castle_hint": {
    ru: "В замке меняют героя и надевают артефакты.",
    en: "In the castle you change your hero and put on artifacts.",
  },
  // Этот же текст сервер отдаёт при отказе (requireAtCastle) — держим слово в слово.
  "braid.castle_only": {
    ru: "Это делается в замке — дойди до замка",
    en: "This is done in the castle — walk over to it",
  },
  "braid.castle_need_castle": {
    ru: "Отсюда не сохранить — дойди до замка",
    en: "Can't save from here — walk over to the castle",
  },
  "braid.castle_no_hero": {
    ru: "Сначала выбери героя — вкладка «Герой»",
    en: "Pick a hero first — the Hero tab",
  },
  "braid.center_hero": { ru: "К герою", en: "To hero" },
  // Тот же кружок героя во время ходьбы: идёт по маршруту — нажал и встал.
  "braid.stop_walk": { ru: "Стоп: встать на месте", en: "Stop: halt here" },

  // ────────── вкладки окна замка ──────────
  // Имена вкладок берутся переменной (CastleTabs гоняет их списком), поэтому
  // check-i18n такую опечатку не ловит — держим единый префикс castle_.
  "braid.castle_tab_hero": { ru: "Герой", en: "Hero" },
  "braid.castle_tab_gear": { ru: "Снаряжение", en: "Gear" },
  "braid.castle_tab_backpack": { ru: "Рюкзак", en: "Backpack" },

  // ────────── рюкзак героя (BackpackGrid) ──────────
  // Купленные в маркете арт/босс/свой товар падают в рюкзак ВЫБРАННОГО героя.
  // Число ячеек зависит от спеца, редкости и Торговли; ячейка вмещает до 20
  // единиц одного вида.
  "braid.backpack_no_hero": {
    ru: "Сначала выбери героя — рюкзак у него",
    en: "Pick a hero first — the backpack is theirs",
  },
  "braid.backpack_empty": {
    ru: "Рюкзак пуст — купи товары в маркете",
    en: "The backpack is empty — buy goods at the market",
  },
  "braid.backpack_discard": { ru: "Выбросить", en: "Discard" },
  "braid.backpack_discard_q": { ru: "Выбросить в мешочек?", en: "Drop into a loot bag?" },
  // Окно выброса: сколько именно выкинуть (стек занимает несколько ячеек).
  "braid.backpack_have": { ru: "В рюкзаке: {n}", en: "In backpack: {n}" },
  "braid.backpack_one_cell": { ru: "Ячейку ({n})", en: "One cell ({n})" },
  "braid.backpack_all": { ru: "Всё ({n})", en: "All ({n})" },
  "braid.backpack_discard_note": {
    ru: "Выбросим {n} шт. в мешочек на клетке — освободится ячеек: {cells}.",
    en: "Dropping {n} into a loot bag on this cell — frees {cells} cell(s).",
  },
  "braid.backpack_cells": {
    ru: "Ячейки: {occupied}/{capacity}",
    en: "Cells: {occupied}/{capacity}",
  },
  "braid.backpack_trade_bonus": {
    ru: "+{n} за торговлю",
    en: "+{n} from trade",
  },
  "braid.trade_stat": { ru: "Торговля", en: "Trade" },

  // ────────── выбор героя ──────────
  "braid.hero_pick": { ru: "Выбрать героя", en: "Choose a hero" },
  "braid.hero_picked": { ru: "Герой выбран: {name}", en: "Hero selected: {name}" },
  "braid.hero_no_heroes": {
    ru: "Героев нет — преврати фишку в героя в инвентаре",
    en: "No heroes — turn a chip into a hero in your inventory",
  },
  "braid.castle_switch_free": {
    ru: "В замке героя меняют без суточного ожидания.",
    en: "In the castle you change heroes without the daily wait.",
  },
  "braid.castle_make_main_q": { ru: "Сделать основным?", en: "Make this hero your main?" },
  "braid.castle_unknown_race": {
    ru: "Раса героя не распознана — характеристики нулевые",
    en: "The hero's race isn't recognized — the stats are zero",
  },
  // Раньше на пустой спец показывалась строка выше и врала: раса-то на месте.
  // Теперь такой герой считается по запасному Воину (heroStats.FALLBACK_SPEC).
  "braid.castle_no_spec": {
    ru: "У героя не задана специализация — считаем как Воина, сообщите администратору",
    en: "The hero has no specialization set — counted as a Warrior, tell an admin",
  },

  // ────────── что герой даёт (HeroEffectSummary) ──────────
  // Один текст на замок и на окно героя с карты. Прежние строки-плашки
  // castle_bonus_line / castle_bonus_more / castle_field_line убраны: они
  // объясняли то же самое другими словами и жили только в шапке замка.
  // Порядок и смысл — по спеке владельца: атака и здоровье процентами от
  // статов, броня читается как промах врага, удача — шанс доп. урона с его
  // множителем. Обзора в спеке нет, и строки про него здесь тоже нет.
  "braid.hero_fx_title": { ru: "Что это даёт", en: "What this gives" },
  "braid.hero_fx_atk": { ru: "Атака отряда", en: "Squad attack" },
  "braid.hero_fx_hp": { ru: "Здоровье отряда", en: "Squad health" },
  "braid.hero_fx_miss": { ru: "Враг промахивается", en: "Enemy misses" },
  "braid.hero_fx_extra": { ru: "Доп. урон", en: "Extra damage" },
  // Число и множитель одной строкой — иначе «×2–10» пришлось бы клеить в коде.
  "braid.hero_fx_extra_val": { ru: "{n}% (×{mult})", en: "{n}% (×{mult})" },
  "braid.hero_fx_step": { ru: "Шаг дешевле", en: "Cheaper steps" },
  "braid.hero_fx_energy_max": { ru: "Максимум энергии", en: "Max energy" },
  "braid.hero_fx_energy_regen": { ru: "Добыча энергии", en: "Energy regen" },
  "braid.hero_fx_none": {
    ru: "Пока ничего — надень артефакты или подними уровень",
    en: "Nothing yet — equip artifacts or level up",
  },
  // ────────── отряд ──────────
  "braid.squad_busy_chip": {
    ru: "{chip} отдыхает — в бой не выйдет",
    en: "{chip} is resting — sits this fight out",
  },
  "braid.squad_fight_count": {
    ru: "В бой вышли {n} из {total}",
    en: "{n} of {total} went into the fight",
  },
  // Сообщения сервера, когда выходить в бой некому.
  "braid.squad_all_busy": {
    ru: "Весь отряд сейчас недоступен — фишки отдыхают",
    en: "The whole squad is unavailable — the chips are resting",
  },
  "braid.squad_gone": {
    ru: "Отряд героя разбежался — собери новый в замке",
    en: "The hero's squad is gone — gather a new one in the castle",
  },
  // Кнопка боя, когда выходить некому. «Пусто» и «все отдыхают» — разные беды:
  // в первом случае идти в замок собирать отряд, во втором просто ждать.
  "braid.squad_all_out": { ru: "Весь отряд отдыхает", en: "The whole squad is resting" },
  "braid.squad_none": { ru: "Отряд не собран", en: "No squad gathered" },
  // Пустой отряд — не отказ: бой идёт прежним автоподбором, и игрок должен
  // понимать, почему в поле вышли не те фишки, что он ожидал увидеть.
  "braid.squad_none_fallback": {
    ru: "Отряд не собран — бьём кем есть",
    en: "No squad gathered — we fight with whoever's around",
  },

  // Ключи из домена «squad.» (его дом — chips.ts), но живут они здесь: строки
  // показывает поле отряда героя, и ради них править чужой словарь ни к чему —
  // агрегатор всё равно склеивает файлы в один объект.
  "squad.out_of_fight": { ru: "Вне боя", en: "Out of the fight" },
  "squad.in_fight_of": { ru: "{n} из {total} в бою", en: "{n} of {total} in the fight" },
  "squad.locked_at_castle": { ru: "состав закреплён в замке", en: "set in the castle" },
  "squad.empty_locked": {
    ru: "Отряд пуст — собери его в замке, здесь фишки уже не выбрать.",
    en: "The squad is empty — gather it in the castle; chips can't be picked here.",
  },

  // ────────── снаряжение ──────────
  // Мест у героя не восемь: редкость добавляет карманы, руки и тело. Без этой
  // строки разное число ячеек у двух героев читается как сбой, а не как
  // награда за редкость.
  "braid.gear_slots_count": {
    ru: "Герой {rarity} — мест под артефакты: {n}",
    en: "{rarity} hero — artifact slots: {n}",
  },
  "braid.gear_slot_empty": { ru: "Пусто", en: "Empty" },
  "braid.gear_equip": { ru: "Надеть", en: "Equip" },
  "braid.gear_unequip": { ru: "Снять", en: "Take off" },
  "braid.gear_take_off": { ru: "Снять", en: "Take off" },
  "braid.gear_pick": {
    ru: "Слот «{slot}» — выбери артефакт",
    en: '"{slot}" slot — pick an artifact',
  },
  "braid.gear_none": {
    ru: "Артефактов нет — они падают из мистических паков.",
    en: "No artifacts yet — they drop from mystic packs.",
  },
  "braid.gear_none_for_slot": {
    ru: "Для этого слота артефактов нет",
    en: "No artifacts for this slot",
  },
  "braid.gear_equipped": { ru: "Артефакт надет", en: "Artifact equipped" },
  "braid.gear_unequipped": { ru: "Артефакт снят", en: "Artifact taken off" },
  // ── «Надеть лучшее» (BestGearButton) ──
  // Прибавка идёт отдельной строкой от команды: она меняется на каждый предмет
  // в инвентаре, а подпись кнопки — нет.
  "braid.gear_best_equip": { ru: "Надеть лучшее", en: "Equip best" },
  "braid.gear_best_gain": { ru: "+{n} к характеристикам", en: "+{n} to stats" },
  "braid.gear_best_none": {
    ru: "Уже надеты лучшие артефакты",
    en: "Best artifacts are already equipped",
  },
  "braid.gear_best_toast": {
    ru: "Надето лучшее: {n} {word}",
    en: "Best gear equipped: {n} {word}",
  },
  // Склонение: «1 предмет», «2 предмета», «5 предметов» — замен бывает и одна.
  "braid.pl_item": { ru: "предмет|предмета|предметов", en: "item|items" },
  // ── построчный разбор артефакта (GearItemLines) ──
  // Слева — что написано НА ПРЕДМЕТЕ, справа в скобке — что дошло до героя.
  // gear_line_spec/race/land берутся ПО ИМЕНИ ЧАСТИ (GearPart.kind), поэтому
  // грепом по коду не находятся — не считать их мёртвыми.
  "braid.gear_line_main": { ru: "+{n} {stat}", en: "+{n} {stat}" },
  "braid.gear_line_spec": { ru: "Специализация {name} +{n}", en: "Class {name} +{n}" },
  "braid.gear_line_race": { ru: "Раса {name} +{n}", en: "Race {name} +{n}" },
  // Земельный бонус зависит от клетки под ногами — в замке его не посчитать.
  "braid.gear_line_land": {
    ru: "Земля {name} +{n} — считается на своей земле",
    en: "Land {name} +{n} — counts on its own land",
  },
  "braid.gear_immune_line": { ru: "Иммунитет: {list}", en: "Immunity: {list}" },
  "braid.gear_no_stat": { ru: "Характеристик не задано", en: "No stats set" },
  // «Торговля» боевого стата не даёт, зато растит рюкзак — говорим об этом прямо,
  // иначе торг-артефакт в точке надевания выглядит бесполезным.
  "braid.gear_trade_hint": { ru: "растит рюкзак", en: "grows the backpack" },
  "braid.gear_fish_line": { ru: "Рыбалка: {n} к шансу улова", en: "Fishing: {n} catch chance" },
  "braid.gear_total_for_hero": { ru: "Этому герою: +{n} {stat}", en: "For this hero: +{n} {stat}" },
  "braid.gear_total_zero": { ru: "Этому герою ничего не даст", en: "Gives this hero nothing" },
  // Блок «нельзя надеть» собирает две беды сразу, поэтому заголовок общий, а
  // причина пишется у каждого предмета.
  "braid.gear_no_slot_block": { ru: "Нельзя надеть", en: "Can't be equipped" },
  "braid.gear_no_slot": { ru: "слот у предмета не задан", en: "the item has no slot" },
  // Слот в базе есть, но такого слота у героя нет — предмет молча исчезал из
  // всех списков, и владелец не мог найти свою броню.
  "braid.gear_unknown_slot": {
    ru: "слот «{slot}» игре неизвестен",
    en: 'slot "{slot}" is unknown to the game',
  },
  // Отказ сервера на надевании: прилетает ключом, параметры через ключ не идут,
  // поэтому фраза обходится без имени предмета. Ключ отдельный от подписи в
  // списке (braid.gear_no_slot) — та строчная и живёт внутри чужого предложения.
  "braid.gear_no_slot_equip": {
    ru: "Нельзя надеть: у предмета не задан слот",
    en: "Can't be equipped: the item has no slot",
  },
  "braid.gear_locked": {
    ru: "Снаряжение героя пока недоступно",
    en: "Hero gear isn't available yet",
  },

  // ────────── разбор характеристик героя (HeroStatBreakdown) ──────────
  "braid.hero_stats_title": {
    ru: "Откуда числа",
    en: "Where the numbers come from",
  },
  "braid.hero_stats_stat": { ru: "Характеристика", en: "Stat" },
  "braid.hero_stats_base": { ru: "База", en: "Base" },
  "braid.hero_stats_gear": { ru: "Артефакты", en: "Gear" },
  "braid.hero_stats_effects": { ru: "Эффекты", en: "Effects" },

  // ────────── комплекты одежды: сохранить набор и надевать одним тапом ──────────
  "braid.presets_title": { ru: "Комплекты", en: "Outfits" },
  "braid.presets_empty": {
    ru: "Комплектов нет. Одень героя и нажми «Сохранить» — набор запомнится.",
    en: "No outfits yet. Dress your hero and hit “Save” to remember the set.",
  },
  "braid.preset_add": { ru: "Сохранить", en: "Save" },
  "braid.preset_new": { ru: "Новый комплект", en: "New outfit" },
  "braid.preset_edit": { ru: "Комплект", en: "Outfit" },
  "braid.preset_name_hint": { ru: "Название: Бой, Добыча…", en: "Name: Combat, Farming…" },
  "braid.preset_save_current": { ru: "Запомнить, что надето", en: "Remember current gear" },
  "braid.preset_rename": { ru: "Переименовать", en: "Rename" },
  "braid.preset_overwrite": {
    ru: "Перезаписать тем, что надето",
    en: "Overwrite with current gear",
  },
  "braid.preset_delete": { ru: "Удалить комплект", en: "Delete outfit" },
  "braid.preset_saved": { ru: "«{name}» запомнен: {n} предметов", en: "“{name}” saved: {n} items" },
  "braid.preset_renamed": { ru: "Переименован", en: "Renamed" },
  "braid.preset_deleted": { ru: "Комплект удалён", en: "Outfit deleted" },
  "braid.preset_applied": { ru: "«{name}»: надето {n}", en: "“{name}”: {n} equipped" },
  "braid.preset_applied_partial": {
    ru: "«{name}»: надето {n}, не нашлось {lost}",
    en: "“{name}”: {n} equipped, {lost} missing",
  },
  // Подписи значков буста над героем: вид эффекта — по характеристике.
  "braid.buff_atk": { ru: "Буст: Атака", en: "Boost: Attack" },
  "braid.buff_arm": { ru: "Буст: Броня", en: "Boost: Armor" },
  "braid.buff_int": { ru: "Буст: Интеллект", en: "Boost: Intellect" },
  "braid.buff_spd": { ru: "Буст: Скорость", en: "Boost: Speed" },
  "braid.buff_hp": { ru: "Буст: Здоровье", en: "Boost: Health" },
  "braid.buff_luck": { ru: "Буст: Удача", en: "Boost: Luck" },
  "braid.hero_stats_total": { ru: "Итого", en: "Total" },

  // ────────── новые строки лога боя (их шлёт encounter-sim) ──────────
  "braid.ab_hero_crit": { ru: "Доп. урон", en: "Extra damage" },
  "braid.ab_hero_miss": { ru: "Промах врага", en: "Enemy missed" },
  // Те же слова во множественном числе: в сводке боя считают не событие,
  // а их количество — «Криты: 3», а не «Крит: 3».
  "braid.pl_crit": { ru: "Доп. урон", en: "Extra damage" },
  "braid.pl_miss": { ru: "Промахи врага", en: "Enemy misses" },

  // ────────── карточка героя в инвентаре ──────────
  // Раньше эти подписи были русскими литералами прямо в HeroItemPanel:
  // английский игрок видел в одной карточке два языка сразу.
  "heroes.pick_for_map": { ru: "Выбрать для карты", en: "Send to the map" },
  "heroes.on_map_remove": { ru: "На карте — снять", en: "On the map — remove" },
  "heroes.picked_toast": { ru: "Этот герой пойдёт на карту", en: "This hero goes to the map" },
  "heroes.unpicked_toast": { ru: "Снова рыцарь", en: "Back to the knight" },
  "heroes.next_level_cost": {
    ru: "Уровень {n} — {c} лайков",
    en: "Level {n} — {c} likes",
  },
  // ── окно героя с карты и прокачка уровня ──
  "braid.hero_quick_title": { ru: "Герой", en: "Hero" },
  "braid.hero_level_up": { ru: "Поднять уровень", en: "Level up" },
  "braid.hero_level_cost": { ru: "Стоит {n} лайков", en: "Costs {n} likes" },
  "braid.hero_likes_left": { ru: "У тебя {n}", en: "You have {n}" },
  "braid.hero_level_max": {
    ru: "Потолок уровня для этой редкости",
    en: "Level cap for this rarity",
  },
  "braid.hero_level_poor": { ru: "Не хватает лайков", en: "Not enough likes" },
  "braid.hero_level_up_toast": {
    ru: "Уровень {n} — статы выросли",
    en: "Level {n} — stats are up",
  },
};
