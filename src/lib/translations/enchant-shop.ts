// ЛАВКА ЗАЧАРОВАНИЯ: окно постройки — вид игрока и вкладка админа.
//
// Ключи окна начинаются с `enchantshop.`; отказы сервера (`enchant.*`) живут
// в своём словаре у серверной части — их переводит humanError.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  // ── Вкладки и разделы ──
  "enchantshop.tab_player": { ru: "Игрок", en: "Player" },
  "enchantshop.tab_admin": { ru: "Админ", en: "Admin" },
  "enchantshop.artifact": { ru: "Артефакт", en: "Artifact" },
  "enchantshop.spell": { ru: "Заклинание", en: "Spell" },
  "enchantshop.empty": { ru: "Заклинаний нет", en: "No spells" },

  // ── Выбор артефакта ──
  "enchantshop.pick_art": { ru: "Выбрать артефакт", en: "Choose artifact" },
  "enchantshop.arts": { ru: "Артефакты", en: "Artifacts" },
  "enchantshop.arts_none": { ru: "Артефактов нет", en: "No artifacts" },
  "enchantshop.arts_error": { ru: "Не удалось загрузить", en: "Failed to load" },
  "enchantshop.retry": { ru: "Повторить", en: "Retry" },
  "enchantshop.confirm": { ru: "Подтвердить", en: "Confirm" },
  "enchantshop.enchanted": { ru: "Зачарован", en: "Enchanted" },

  // ── Редкость заклинания ──
  "enchantshop.rarity_common": { ru: "Обычное", en: "Common" },
  "enchantshop.rarity_rare": { ru: "Редкое", en: "Rare" },
  "enchantshop.rarity_epic": { ru: "Эпическое", en: "Epic" },
  "enchantshop.rarity_legendary": { ru: "Легендарное", en: "Legendary" },
  "enchantshop.odds": {
    ru: "Успех {s}% · без изменений {n}% · разрушение {d}%",
    en: "Success {s}% · no change {n}% · destroyed {d}%",
  },

  // ── Усиление шанса и оплата ──
  "enchantshop.chance": { ru: "Шанс успеха", en: "Success chance" },
  "enchantshop.no_boost": { ru: "Без усиления", en: "No boost" },
  "enchantshop.less": { ru: "Меньше", en: "Less" },
  "enchantshop.more": { ru: "Больше", en: "More" },
  "enchantshop.go": { ru: "Зачаровать", en: "Enchant" },

  // ── Итог ──
  // {pct} — со знаком: «+12%» / «−12%» (enchantPctText).
  "enchantshop.res_ok": { ru: "Зачаровано: {pct}", en: "Enchanted: {pct}" },
  "enchantshop.res_none": { ru: "Не вышло", en: "It didn't work" },
  "enchantshop.res_none_sub": { ru: "Артефакт без изменений", en: "Artifact unchanged" },
  "enchantshop.res_gone": {
    ru: "Артефакт разрушен — исчез навсегда",
    en: "Artifact destroyed — gone for good",
  },

  // ── Инфо выбранного заклинания (под ячейками) ──
  "enchantshop.info_effect": {
    ru: "Усиление всех характеристик артефакта: {v}",
    en: "Boost to all artifact stats: {v}",
  },
  "enchantshop.info_range": { ru: "от {a} до {b}", en: "from {a} to {b}" },
  "enchantshop.info_s": { ru: "Успех {n}", en: "Success {n}" },
  "enchantshop.info_n": { ru: "Без изменений {n}", en: "No change {n}" },
  "enchantshop.info_d": { ru: "Разрушение {n}", en: "Destroyed {n}" },
  "enchantshop.info_warn": {
    ru: "Артефакт может исчезнуть навсегда",
    en: "The artifact may be destroyed for good",
  },
  "enchantshop.stat_fishing": { ru: "Рыбалка", en: "Fishing" },
  // Над строками «стат: было → стало» выбранного артефакта.
  "enchantshop.prev_head": { ru: "При успехе", en: "On success" },

  // ── Админ ──
  "enchantshop.new_spell": { ru: "Новое заклинание", en: "New spell" },
  "enchantshop.new_name": { ru: "Новое", en: "New" },
  "enchantshop.f_name": { ru: "Название", en: "Name" },
  "enchantshop.f_rarity": { ru: "Редкость", en: "Rarity" },
  "enchantshop.f_boost": { ru: "Усиление, %", en: "Boost, %" },
  "enchantshop.f_boost_ph": { ru: "20 или 50-90", en: "20 or 50-90" },
  "enchantshop.f_success": { ru: "Успех", en: "Success" },
  "enchantshop.f_destroy": { ru: "Может разрушить", en: "Can destroy" },
  "enchantshop.f_destroy_chance": { ru: "Разрушение", en: "Destruction" },
  "enchantshop.f_cost": { ru: "Цена", en: "Price" },
  "enchantshop.f_add_cost": { ru: "+ позиция", en: "+ item" },
  "enchantshop.f_remove": { ru: "Убрать", en: "Remove" },
  "enchantshop.f_search": { ru: "Поиск", en: "Search" },
  "enchantshop.f_nothing": { ru: "Ничего не найдено", en: "Nothing found" },
  "enchantshop.f_amount": { ru: "Количество", en: "Amount" },
  "enchantshop.f_fx": { ru: "Можно усилить шанс", en: "Chance can be boosted" },
  "enchantshop.f_fx_pct": { ru: "За шаг, % к шансу", en: "Per step, % to chance" },
  "enchantshop.f_fx_cost": { ru: "Цена 1-го шага", en: "1st step price" },
  "enchantshop.f_fx_steps": {
    ru: "До {n} шагов, каждый следующий ×2: {list}",
    en: "Up to {n} steps, each next ×2: {list}",
  },
  "enchantshop.f_delete": { ru: "Удалить заклинание", en: "Delete spell" },
  "enchantshop.save": { ru: "Сохранить", en: "Save" },
  "enchantshop.saved": { ru: "Сохранено", en: "Saved" },
};
