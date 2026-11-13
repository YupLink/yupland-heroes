import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Маркет
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  "market.title": { ru: "Маркет фишек", en: "Chip market" },
  "market.list_action": { ru: "Выставить", en: "List" },
  "market.stat_active": { ru: "Активные", en: "Active" },
  "market.stat_sold": { ru: "Продано", en: "Sold" },
  "market.sort_price_asc": { ru: "Цена ↑", en: "Price ↑" },
  "market.sort_price_desc": { ru: "Цена ↓", en: "Price ↓" },
  "market.sort_level_desc": { ru: "★ ↓", en: "★ ↓" },
  "market.sort_level_asc": { ru: "★ ↑", en: "★ ↑" },
  "market.bought_toast": { ru: "Куплено за {price} золота!", en: "Bought for {price} gold!" },
  "market.unlisted_toast": { ru: "Снято с продажи", en: "Removed from sale" },
  "market.empty": { ru: "Пока никто ничего не выставил.", en: "Nothing listed yet." },
  "market.you": { ru: "ты", en: "you" },
  "market.unlist_confirm": { ru: "Снять с продажи?", en: "Remove from sale?" },
  "market.unlist": { ru: "Снять с продажи", en: "Remove" },
  "market.buy": { ru: "Купить", en: "Buy" },
  "market.lvl": { ru: "Уровень", en: "Level" },
  "market.attack": { ru: "Атака", en: "Attack" },
  "market.hp": { ru: "Жизнь", en: "HP" },
  "market.serial": { ru: "Серийник", en: "Serial" },
  "market.tpl_no": { ru: "Вид", en: "Template" },
  "market.seller": { ru: "Продавец", en: "Seller" },
  "market.listed_toast": { ru: "Выставлено на продажу", en: "Listed for sale" },
  "market.modal_title": { ru: "Выставить фишку", en: "List a chip" },
  "market.no_chips": { ru: "Нет фишек для продажи.", en: "No chips to sell." },
  // Маркет фишек за золото (владелец, 21.10.2026): цена — целое золото; минимум 10
  // с 22.10.2026 (lib/chipMarketGold). price_min — отказ сервера с числом.
  "market.price_label": { ru: "Цена в золоте", en: "Price in gold" },
  "market.price_placeholder": { ru: "целое число, от 10", en: "whole number, from 10" },
  "market.price_invalid": {
    ru: "Цена — целое золото от 10 до 1 000 000",
    en: "Price must be whole gold from 10 to 1,000,000",
  },
  "market.price_min": { ru: "Цена — целое золото от {n}", en: "Price must be whole gold from {n}" },
  "market.gold_amount": { ru: "{n} золота", en: "{n} gold" },
  // История фишек: сделки и лоты за золото (прежние — chips.hist_* в билетах).
  "market.hist_listed_gold": {
    ru: "Выставил на продажу за {n} золота",
    en: "Listed for sale at {n} gold",
  },
  "market.hist_sold_gold": { ru: "Продал за {n} золота · {who}", en: "Sold for {n} gold · {who}" },
  "market.hist_bought_gold": {
    ru: "Купил за {n} золота · {who}",
    en: "Bought for {n} gold · {who}",
  },
  "market.commission_note": {
    ru: "С продажи будет удержано 9% комиссии. Ты получишь {amount}.",
    en: "A 9% fee is deducted from the sale. You'll get {amount}.",
  },
  "market.tickets_amount": { ru: "{n} билетов", en: "{n} tickets" },
  "market.mine_filter": { ru: "Мои", en: "Mine" },
  "market.mine_empty": { ru: "У тебя нет активных листингов.", en: "You have no active listings." },
  "market.load_more": { ru: "Показать ещё", en: "Show more" },
  "market.sort_price": { ru: "Цена", en: "Price" },
  "market.all_collections": { ru: "Все паки", en: "All packs" },
  // Отказ выставить оглушённую фишку. Первый вариант сервер бросает ошибкой
  // (в ключ параметры не передать), второй показывает интерфейс, когда знает
  // срок из ответа пачки.
  "market.chip_stunned": {
    ru: "Фишка без сознания — продать её нельзя, дождись, пока очнётся",
    en: "The chip is out cold — you can't sell it until it comes to",
  },
  "market.chip_stunned_min": {
    ru: "Фишка без сознания — продать её нельзя, приходи через {n} мин",
    en: "The chip is out cold — you can't sell it, come back in {n} min",
  },
  // Итог выставления пачкой. Раньше строка была прибита по-русски прямо в
  // компоненте, и англоязычный игрок читал «Выставлено 3, не вышло 2» — без
  // причины, почему не вышло. Причину подставляем первой отказавшей фишки.
  "market.listed_n": { ru: "Выставлено {n}", en: "Listed {n}" },
  "market.listed_partial": {
    ru: "Выставлено {n}, не вышло {failed}: {reason}",
    en: "Listed {n}, {failed} failed: {reason}",
  },
};
