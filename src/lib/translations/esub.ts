import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Подписка на энергию (витрина в окне «Купить энергию» и подарки дня).
export const dict: Record<string, Entry> = {
  "esub.title": { ru: "Подписка на энергию", en: "Energy subscription" },
  "esub.energy_day": { ru: "+{n} энергии в день", en: "+{n} energy per day" },
  "esub.boxes_day": { ru: "+{n} × {box} в день", en: "+{n} × {box} per day" },
  "esub.days": { ru: "{n} дней", en: "{n} days" },
  "esub.no_decay": {
    ru: "Энергия не тает, пока действует подписка",
    en: "Energy doesn't melt while the subscription lasts",
  },
  "esub.license": {
    ru: "Лицензия банка «{tier}», пока действует подписка",
    en: "Bank license “{tier}” while the subscription lasts",
  },
  "esub.withdraw_bonus": {
    ru: "+{n} млн DARAI к выводу в месяц",
    en: "+{n}M DARAI withdrawal per month",
  },
  "esub.buy_confirm": { ru: "Оформить «{tier}» за {price}?", en: "Get “{tier}” for {price}?" },
  "esub.buy": { ru: "Оформить", en: "Subscribe" },
  "esub.cancel": { ru: "Отмена", en: "Cancel" },
  "esub.done": {
    ru: "Подписка оформлена — начисление дня уже в «Подарках»",
    en: "Subscribed — today's accrual is already in Gifts",
  },
  "esub.active": {
    ru: "«{tier}» до {date} · выдано {given} из {days}",
    en: "“{tier}” until {date} · {given} of {days} given",
  },
  "esub.mine": { ru: "Мои подписки", en: "My subscriptions" },
  "esub.gift_note": { ru: "Начисление по подписке «{tier}»", en: "“{tier}” subscription accrual" },
  // Срок в карточке начисления: день в день, а не «сгорит через N ч» (владелец 25.10.2026).
  "esub.gift_today": { ru: "только сегодня", en: "today only" },
  // Отказы сервера (humanError переводит их по ключу).
  "esub.no_rate": {
    ru: "Цена в DARAI сейчас недоступна — оплатите USDT или Stars",
    en: "DARAI price is unavailable right now — pay with USDT or Stars",
  },
  "esub.price_changed": {
    ru: "Курс изменился — проверьте новую цену и оформите ещё раз",
    en: "The rate changed — check the new price and try again",
  },
  "esub.unavailable": { ru: "Подписка пока недоступна", en: "Subscription is not available yet" },
  "esub.no_tier": { ru: "Такого тарифа нет", en: "No such plan" },
  "esub.one_active": {
    ru: "Такая подписка уже действует — она снова доступна после окончания",
    en: "This plan is already active — it's available again after it ends",
  },
  "esub.retry": {
    ru: "Эта попытка уже отменена, деньги вернулись — оформите ещё раз",
    en: "This attempt was cancelled and refunded — please subscribe again",
  },
};
