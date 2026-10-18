import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: город глазами игрока — справка ратуши, голод и лавки города.
// Пульт ратуши админский и живёт по-русски (как остальные редакторы карты).
export const dict: Record<string, Entry> = {
  // ── справка ратуши ──
  "town.residents": { ru: "Жителей: {n}", en: "Residents: {n}" },
  "town.eats_title": { ru: "Едят за сутки", en: "Eaten per day" },
  "town.eats_none": { ru: "Жители ничего не едят", en: "The residents eat nothing" },
  "town.per_day": { ru: "{n} в сутки", en: "{n} a day" },
  "town.short": { ru: "не хватает", en: "short" },
  "town.settings": { ru: "Настройки города", en: "Town settings" },

  // ── голод ──
  "town.starving_badge": { ru: "Город голодает", en: "The town is starving" },
  "town.starving": {
    ru: "Город голодает: лавки города продают, только когда жителей накормят",
    en: "The town is starving: its shops sell again once the residents are fed",
  },
  "town.starving_hint": {
    ru: "Привезите еду в лавки города — как только запас вернётся к норме, всё заработает.",
    en: "Bring food to the town's shops — once the stock is back to normal, everything reopens.",
  },
  "town.shop_starving": {
    ru: "Город голодает: лавка только принимает еду",
    en: "The town is starving: the shop only accepts food",
  },

  // ── лавки города ──
  "town.not_traded": { ru: "Город этим не торгует", en: "The town doesn't trade this" },
  "market.price_changed": {
    ru: "Цена изменилась — посмотрите и повторите",
    en: "The price has changed — check it and try again",
  },
  "market.will_get": { ru: "Получишь:", en: "You'll get:" },
  // Особый спрос: запас сутки на НЗ и ниже — город скупает до НЗ по ×4 вместо ×2.
  "market.town_rush": { ru: "Особый спрос ×2", en: "Special demand ×2" },
};
