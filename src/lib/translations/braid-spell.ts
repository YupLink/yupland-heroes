import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: КНИГА ЗАКЛИНАНИЙ героя и всё, что связано с кастом.
//
// Два слоя ключей и они разные по природе:
//   • `spell.*` — причины отказа, их присылает СЕРВЕР голым ключом. Сервер не
//     знает языка игрока, поэтому решает словами не он, а этот файл.
//   • `braid.spell_*` — подписи самого экрана.
// Держим вместе намеренно: отказ и место, где он показывается, правятся одной
// рукой, а разнесённые по двум файлам они разъезжались бы формулировками.
export const dict: Record<string, Entry> = {
  // ────────── причины отказа (ключи сервера) ──────────
  "spell.no_hero": {
    ru: "Сначала выбери главного героя",
    en: "Pick a main hero first",
  },
  "spell.unknown": { ru: "Заклинание недоступно", en: "Spell is unavailable" },
  "spell.not_learned": {
    ru: "Герой не знает этого заклинания",
    en: "This hero has not learned it",
  },
  "spell.low_int": { ru: "Нужен интеллект {need}", en: "Requires {need} intellect" },
  "spell.cooldown": { ru: "Идёт откат: ещё {sec} с", en: "On cooldown: {sec}s left" },
  "spell.no_energy": {
    ru: "Не хватает энергии: нужно {cost}",
    en: "Not enough energy: {cost} required",
  },
  "spell.failed": { ru: "Заклинание сорвалось", en: "The spell fizzled" },
  "spell.price_changed": {
    ru: "Цена изменилась: теперь {cost} энергии",
    en: "The price changed: {cost} energy now",
  },
  "spell.not_on_map": { ru: "Ты не на карте рейда", en: "You are not on the raid map" },
  "spell.already_on_ship": { ru: "Ты уже на корабле", en: "You are already aboard" },
  "spell.no_ship": { ru: "Свободных кораблей нет", en: "No free ships left" },
  "spell.no_water_near": { ru: "Рядом нет воды", en: "No water nearby" },
  "spell.ocean_small": {
    ru: "Рядом только океан — малый корабль туда не спустить",
    en: "Only ocean nearby — a small ship can't be launched there",
  },
  "spell.no_ship_to_repair": {
    ru: "Рядом нет корабля для ремонта",
    en: "No ship to repair nearby",
  },
  "spell.ship_already_near": {
    ru: "Свободный корабль и так рядом",
    en: "A free ship is already next to you",
  },
  "spell.castle_busy": {
    ru: "У замка нет свободной клетки",
    en: "No free tile next to the castle",
  },
  "spell.teleport_failed": { ru: "Перенос не удался", en: "Teleport failed" },
  "spell.already_learned": { ru: "Это заклинание уже выучено", en: "Already learned" },
  "spell.no_slots": {
    ru: "В книге нет места: всего {total}",
    en: "No free slot: {total} in total",
  },
  "spell.not_in_book": { ru: "Этого заклинания нет в книге", en: "Not in the spellbook" },
  "spell.pay_failed": { ru: "Оплата не прошла: {msg}", en: "Payment failed: {msg}" },
  "spell.hero_unavailable": { ru: "Этот герой недоступен", en: "This hero is unavailable" },

  // ────────── экран книги ──────────
  "braid.castle_tab_spells": { ru: "Книга", en: "Spells" },
  "braid.spell_owner": { ru: "Книга героя {hero}", en: "{hero}'s spellbook" },
  "braid.spell_no_hero": {
    ru: "Книга принадлежит герою — сначала выбери главного.",
    en: "The book belongs to a hero — pick your main one first.",
  },
  "braid.spell_slots": { ru: "Занято {used} из {total}", en: "{used} of {total} slots used" },
  "braid.spell_discount": {
    ru: "Интеллект {int}: −{percent}% к цене и откату",
    en: "Intellect {int}: −{percent}% cost and cooldown",
  },
  "braid.spell_energy_have": { ru: "Энергия: {n}", en: "Energy: {n}" },

  // Плитка заклинания.
  "braid.spell_cast": { ru: "Читать", en: "Cast" },
  "braid.spell_casting": { ru: "Читаем…", en: "Casting…" },
  "braid.spell_cost": { ru: "{n} энергии", en: "{n} energy" },
  "braid.spell_cd": { ru: "откат {n} мин", en: "{n} min cooldown" },
  "braid.spell_cd_left": { ru: "Откат {time}", en: "Cooldown {time}" },
  "braid.spell_base_was": {
    ru: "без интеллекта было {energy} энергии и {min} мин",
    en: "without intellect: {energy} energy and {min} min",
  },
  "braid.spell_gives": { ru: "Что даёт", en: "What it does" },
  "braid.spell_gift_ship": {
    ru: "Призывает ближайший свободный корабль к герою",
    en: "Summons the nearest free ship to the hero",
  },
  "braid.spell_gift_big_ship_create": {
    ru: "Спускает большой корабль на воду рядом с героем, и в океан тоже",
    en: "Launches a big ship next to the hero, ocean included",
  },
  "braid.spell_gift_ship_create": {
    ru: "Спускает новый корабль на воду рядом с героем",
    en: "Launches a new ship on the water next to the hero",
  },
  "braid.spell_gift_ship_repair": {
    ru: "Чинит корабль героя или разбитый рядом до полного запаса хода",
    en: "Fully repairs the hero's ship or a damaged one nearby",
  },
  "braid.spell_gift_teleport": {
    ru: "Переносит героя к своему замку",
    en: "Teleports the hero back to their castle",
  },
  "braid.spell_gift_none": {
    ru: "Прибавок к характеристикам не даёт",
    en: "Grants no stat bonuses",
  },
  "braid.spell_off": { ru: "Отключено", en: "Disabled" },

  // Итог каста.
  "braid.spell_done": { ru: "{name}: {line}", en: "{name}: {line}" },
  "braid.spell_done_plain": { ru: "{name} прочитано", en: "{name} cast" },
  "braid.spell_done_ship": { ru: "{name}: корабль подошёл", en: "{name}: a ship has arrived" },
  "braid.spell_done_big_ship_create": {
    ru: "{name}: большой корабль спущен на воду рядом с тобой",
    en: "{name}: a big ship has been launched next to you",
  },
  "braid.spell_done_ship_create": {
    ru: "{name}: корабль спущен на воду рядом с тобой",
    en: "{name}: a ship has been launched next to you",
  },
  "braid.spell_done_ship_repair": {
    ru: "{name}: корабль починен",
    en: "{name}: the ship is repaired",
  },
  "braid.spell_done_teleport": { ru: "{name}: ты у замка", en: "{name}: you are at the castle" },
  "braid.spell_repeat": { ru: "Уже прочитано", en: "Already cast" },

  // Забвение из книги: даром, с подтверждением.
  "braid.spell_forget": { ru: "Забыть", en: "Forget" },
  "braid.spell_forget_ask": { ru: "Забыть «{name}»?", en: "Forget “{name}”?" },
  "braid.spell_forgot": { ru: "Забыто: {name}", en: "Forgotten: {name}" },

  // ────────── рюкзак: товар-буст ──────────
  "braid.boost_item_title": { ru: "Товар-буст", en: "Booster item" },
  "braid.boost_item_count": { ru: "В рюкзаке: {n} шт", en: "In backpack: {n}" },
  "braid.boost_item_temp": {
    ru: "Прибавка временная и снимается сама.",
    en: "The bonus is temporary and wears off on its own.",
  },
};
