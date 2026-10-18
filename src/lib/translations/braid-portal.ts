import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы портала бета-рейда: вход в сеть, платная дверь, требования к герою.
// Отдельный файл — braid-build.ts давно упёрся в лимит строк.
export const dict: Record<string, Entry> = {
  "braid.portal_enter": { ru: "Войти в портал", en: "Enter the portal" },
  "braid.portal_pass": { ru: "Пройти", en: "Pass through" },
  "braid.portal_free": { ru: "Проход бесплатный", en: "Passage is free" },
  "braid.portal_exits": { ru: "выходов: {n}", en: "exits: {n}" },
  "braid.portal_jumped": { ru: "Портал перенёс тебя", en: "The portal moved you" },
  "braid.portal_passed": { ru: "Проход оплачен", en: "Passage paid" },
  "braid.portal_level_hint": {
    ru: "Только герой уровня {range}",
    en: "Hero level {range} only",
  },
  "braid.portal_level": {
    ru: "Нужен герой уровня {range}",
    en: "Requires a hero of level {range}",
  },
  "braid.portal_unfinished": { ru: "Портал ещё строится", en: "The portal is still being built" },
  "braid.gate_on_step": {
    ru: "Плата берётся при входе на клетку",
    en: "The toll is charged when you step in",
  },
  "braid.gate_level": {
    ru: "{name}: пускают героя уровня {range}",
    en: "{name}: heroes of level {range} only",
  },
  "braid.gate_no_hero": { ru: "{name}: сначала выбери героя", en: "{name}: choose a hero first" },
  "braid.gate_move_energy": {
    ru: "{name}: пройди ещё {need}⚡ по клеткам",
    en: "{name}: walk {need}⚡ more across the map",
  },
  "braid.gate_passed": { ru: "Ты уже прошёл", en: "You are already through" },
  "braid.gate_paid": { ru: "Дверь: −{price}", en: "Gate: −{price}" },
  // Подсказка к плате в плашке маршрута: что спишут ворота на пути и когда.
  "braid.route_toll": {
    ru: "Ворота на пути: {price} — спишется при входе",
    en: "Gate on the way: {price} — charged when you step in",
  },
  "braid.need_toll": {
    ru: "Не хватает: {price}",
    en: "Not enough: {price}",
  },
  "braid.portal_alone": {
    ru: "В этой сети больше нет порталов",
    en: "This network has no other portals",
  },
  // Этажи (§8.39): комната портала на закрытом этаже или без второго портала.
  "braid.portal_floor_closed": { ru: "Этот этаж сейчас закрыт", en: "This floor is closed now" },
  "braid.portal_floor_empty": {
    ru: "На том этаже нет портала этой сети",
    en: "There is no portal of this network on that floor",
  },
};
