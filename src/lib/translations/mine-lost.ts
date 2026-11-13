// Отнятые шахты и грибы: что случилось, вид шахты и место — «Каменную шахту
// захватили — Асгард (12, 34)» (владелец 23.10: «краткость»; 04.11, §8.106:
// мир и вид шахты, чтобы было понятно, куда идти). Место дописывает
// lib/mineLost (lostPlace). Кто отнял — не пишем.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  "minelost.mark": { ru: "отнята", en: "lost" },
  "minelost.mark.level": { ru: "уровень снижен", en: "level lowered" },
  // Вид шахты в трёх падежах; «any» — DARAI, энергия и прочее старое.
  "minelost.acc.wood": { ru: "Лесопилку", en: "sawmill" },
  "minelost.acc.stone": { ru: "Каменную шахту", en: "stone mine" },
  "minelost.acc.gold": { ru: "Золотую шахту", en: "gold mine" },
  "minelost.acc.diamonds": { ru: "Алмазную шахту", en: "diamond mine" },
  "minelost.acc.any": { ru: "Шахту", en: "mine" },
  "minelost.nom.wood": { ru: "Лесопилка", en: "sawmill" },
  "minelost.nom.stone": { ru: "Каменная шахта", en: "stone mine" },
  "minelost.nom.gold": { ru: "Золотая шахта", en: "gold mine" },
  "minelost.nom.diamonds": { ru: "Алмазная шахта", en: "diamond mine" },
  "minelost.nom.any": { ru: "Шахта", en: "mine" },
  "minelost.dat.wood": { ru: "Лесопилке", en: "sawmill" },
  "minelost.dat.stone": { ru: "Каменной шахте", en: "stone mine" },
  "minelost.dat.gold": { ru: "Золотой шахте", en: "gold mine" },
  "minelost.dat.diamonds": { ru: "Алмазной шахте", en: "diamond mine" },
  "minelost.dat.any": { ru: "Шахте", en: "mine" },
  "minelost.say.capture": { ru: "{acc} захватили", en: "Your {nom} was captured" },
  "minelost.say.break": { ru: "{nom} сломалась", en: "Your {nom} broke down" },
  "minelost.say.dismantle": { ru: "{acc} разобрали", en: "Your {nom} was dismantled" },
  // Синий динамит снизил уровень (§8.75а): прошедшее по старому уровню — к сбору.
  "minelost.say.level": { ru: "{dat} снизили уровень", en: "Your {nom} lost a level" },
  // Снос острова уведомления не шлёт; строка — на случай чужого вида в пачке.
  "minelost.say.island": { ru: "Остров закрыт", en: "Island closed" },
  "minelost.say.take": { ru: "Гриб подняли", en: "Your mushroom was picked up" },
  "minelost.say.take.darai": { ru: "Гриб DARAI подняли", en: "Your DARAI mushroom was picked up" },
  "minelost.say.take.gold": { ru: "Золотой гриб подняли", en: "Your gold mushroom was picked up" },
  "minelost.say.take.diamonds": {
    ru: "Алмазный гриб подняли",
    en: "Your diamond mushroom was picked up",
  },
  "minelost.say.expire": { ru: "Гриб сгнил", en: "Your mushroom rotted" },
  "minelost.say.expire.darai": { ru: "Гриб DARAI сгнил", en: "Your DARAI mushroom rotted" },
  "minelost.say.expire.gold": { ru: "Золотой гриб сгнил", en: "Your gold mushroom rotted" },
  "minelost.say.expire.diamonds": { ru: "Алмазный гриб сгнил", en: "Your diamond mushroom rotted" },
  // Уведомления в «Добыче» (§8.106): строка, закрыть, показать; письмо бота.
  "minelost.notices": { ru: "Уведомления · {n}", en: "Notifications · {n}" },
  "minelost.close": { ru: "Закрыть", en: "Close" },
  "minelost.close_all": { ru: "Закрыть все", en: "Close all" },
  "minelost.show": { ru: "Показать", en: "Show" },
  "minelost.show_label": { ru: "Показать на карте: {place}", en: "Show on the map: {place}" },
  "minelost.other_world": { ru: "Другой мир: {world}", en: "Another world: {world}" },
};
