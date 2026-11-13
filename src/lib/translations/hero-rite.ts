// ЗАЧАРОВАНИЕ ГЕРОЕВ: окно постройки (вид игрока и вкладка админа) и отказы
// сервера (server/api/beta-raid/hero-rite — ключи herorite.*, их переводит
// humanError). Общие с лавкой артефактов слова (вкладки, цена, «Подтвердить») —
// в enchant-shop.ts.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  "herorite.heroes": { ru: "Герои", en: "Heroes" },
  "herorite.rite": { ru: "Обряд", en: "Rite" },
  "herorite.pick": { ru: "Выбрать героев", en: "Choose heroes" },
  "herorite.empty": { ru: "Обрядов нет", en: "No rites" },
  "herorite.go": { ru: "Зачаровать", en: "Enchant" },
  "herorite.lvl": { ru: "{n} ур.", en: "Lv {n}" },
  "herorite.r_rare": { ru: "Редкий", en: "Rare" },
  "herorite.r_epic": { ru: "Эпический", en: "Epic" },
  "herorite.r_legendary": { ru: "Легендарный", en: "Legendary" },
  "herorite.r_unique": { ru: "Уникальный", en: "Unique" },
  "herorite.info_unique": {
    ru: "Успех {n} — {name} станет уникальным, уровень сохранится",
    en: "Success {n} — {name} becomes Unique and keeps the level",
  },
  "herorite.info_first": { ru: "первый герой", en: "the first hero" },
  "herorite.res_unique": { ru: "Герой стал уникальным!", en: "The hero became Unique!" },
  "herorite.info_success": {
    ru: "Успех {n} — новый герой: {r}",
    en: "Success {n} — a new hero: {r}",
  },
  "herorite.info_lose": {
    ru: "Неудача {n} — пропадёт {k} из {need}",
    en: "Failure {n} — {k} of {need} will be lost",
  },
  "herorite.info_keep": {
    ru: "Неудача {n} — все герои вернутся",
    en: "Failure {n} — all heroes come back",
  },
  "herorite.info_level": { ru: "Новый герой — с 0 уровня", en: "The new hero starts at level 0" },
  "herorite.res_ok": { ru: "Новый герой!", en: "A new hero!" },
  "herorite.res_gone": { ru: "Не вышло — пропали", en: "Failed — lost" },
  "herorite.res_none": { ru: "Не вышло", en: "Failed" },
  "herorite.res_none_sub": { ru: "Все герои вернулись", en: "All heroes came back" },
  "herorite.pick_none": {
    ru: "Свободных героев этой редкости нет",
    en: "No free heroes of this rarity",
  },
  "herorite.picked": { ru: "{n} из {need}", en: "{n} of {need}" },
  "herorite.new_rite": { ru: "Новый обряд", en: "New rite" },
  "herorite.new_name": { ru: "Обряд", en: "Rite" },
  "herorite.f_from": { ru: "Какие герои", en: "Which heroes" },
  "herorite.f_need": { ru: "Сколько героев", en: "How many heroes" },
  "herorite.f_lose": { ru: "Пропадёт при неудаче", en: "Lost on failure" },
  "herorite.f_delete": { ru: "Удалить обряд", en: "Delete rite" },
  "herorite.f_lose_ph": { ru: "0, 1 или 1-2", en: "0, 1 or 1-2" },
  "herorite.no_rite": {
    ru: "Такого обряда здесь больше нет",
    en: "This rite is no longer here",
  },
  "herorite.need_count": {
    ru: "Выбери столько героев, сколько просит обряд",
    en: "Choose as many heroes as the rite asks for",
  },
  "herorite.hero_busy": {
    ru: "Кто-то из героев занят или уже не твой — выбери заново",
    en: "One of the heroes is busy or no longer yours — choose again",
  },
  "herorite.no_target": {
    ru: "Героев следующей редкости в игре пока нет",
    en: "There are no heroes of the next rarity yet",
  },
  "herorite.bad_need": { ru: "Героев — от 2 до 10", en: "Heroes — from 2 to 10" },
  "herorite.bad_lose": {
    ru: "«Пропадёт» — от 0 до числа героев: 1 или 1-2",
    en: "“Lost” — from 0 up to the number of heroes: 1 or 1-2",
  },
};
