import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Рынок героев (владелец, 22.10.2026; ПРАВИЛА §8.67): отказы сервера ключами.
// Сервер бросает «heromkt.<код>» или «heromkt.<код>|{json}» (serverErrorText /
// humanError подставят числа), в итоге пачки — { error, params }.
export const dict: Record<string, Entry> = {
  "heromkt.not_yours": { ru: "Это не твой герой", en: "This hero is not yours" },
  "heromkt.common": {
    ru: "Обычного героя выставить нельзя — только редкого, эпического или легендарного",
    en: "Common heroes can't be listed — only rare, epic or legendary",
  },
  "heromkt.active": {
    ru: "Это твой основной герой — сначала выбери основным другого",
    en: "This is your main hero — make another hero main first",
  },
  "heromkt.resting": {
    ru: "Герой отдыхает — выставить можно после отдыха",
    en: "The hero is resting — list it after the rest",
  },
  "heromkt.field": {
    ru: "Герой работает на грядке — сначала сними его",
    en: "The hero is working a field — recall it first",
  },
  "heromkt.fishing": {
    ru: "Герой рыбачит — сначала останови рыбалку",
    en: "The hero is fishing — stop fishing first",
  },
  "heromkt.no_position": {
    ru: "Карманы героя некуда выронить — сначала выйди на карту",
    en: "There's nowhere to drop the hero's pockets — enter the map first",
  },
  "heromkt.dmine_no_main": {
    ru: "В карманах героя гриб, а основного героя нет — выбери основного: гриб перейдёт к нему",
    en: "The hero carries a mushroom and you have no main hero — pick a main hero and the mushroom will move to them",
  },
  // Карманы выставляемого — основному герою (владелец, 22.10.2026): не влезает —
  // окно со списком (drops / toMain) этого героя, согласие — тот же запрос, у героя
  // acceptKey = dropsKey из того же ответа (превью или отказа).
  "heromkt.pockets_overflow": {
    ru: "Не всё из карманов героя влезет в рюкзак основного героя — остальное выпадет в мешочек на клетке, где он стоит",
    en: "Not everything from the hero's pockets fits into your main hero's backpack — the rest will drop in a bag on the cell where your main hero stands",
  },
  "heromkt.pockets_to_main": {
    ru: "{name} ×{n} — в рюкзак основного героя",
    en: "{name} ×{n} — into your main hero's backpack",
  },
  "heromkt.pockets_drop_bag": {
    ru: "{name} ×{n} — выпадет в мешочек",
    en: "{name} ×{n} — will drop in the bag",
  },
  "heromkt.pockets_drop_burn": {
    ru: "{name}: начатая штука сгорит — в мешочек она не ложится, как при «Выбросить»",
    en: "{name}: the started piece will be destroyed — it can't go into a bag, same as Discard",
  },
  "heromkt.pockets_drop_plant": {
    ru: "{name} ×{n} — встанет на карту рядом с героем сам, как через час в рюкзаке",
    en: "{name} ×{n} — will plant itself on the map next to your hero, as after an hour in the backpack",
  },
  "heromkt.pockets_accept": { ru: "Выставить, пусть выпадет", en: "List anyway" },
  "heromkt.pockets_moved": {
    ru: "Вещи из карманов — в рюкзаке основного героя",
    en: "Pocket items are in your main hero's backpack",
  },
  "heromkt.already_listed": {
    ru: "Этот герой уже на рынке",
    en: "This hero is already on the market",
  },
  "heromkt.duplicate": { ru: "Герой указан дважды", en: "The hero is listed twice in the request" },
  "heromkt.price_required": {
    ru: "Укажи цену: в золоте, в DARAI или обе",
    en: "Set a price: in gold, in DARAI or both",
  },
  "heromkt.price_bad": {
    ru: "Цена — целое число от 1 до {max}",
    en: "Price must be a whole number from 1 to {max}",
  },
  "heromkt.gold_min": {
    ru: "Цена в золоте — не меньше {min}",
    en: "Gold price must be at least {min}",
  },
  "heromkt.darai_min": {
    ru: "Цена в DARAI — не меньше {min} (минимум в золоте по курсу банка)",
    en: "DARAI price must be at least {min} (gold minimum at the bank rate)",
  },
  "heromkt.darai_rate": {
    ru: "Курс DARAI сейчас недоступен — выставь за золото",
    en: "The DARAI rate is unavailable right now — list for gold",
  },
  "heromkt.lot_none": { ru: "Лот не найден", en: "Listing not found" },
  "heromkt.lot_sold": { ru: "Этого героя уже купили", en: "This hero has already been bought" },
  "heromkt.lot_withdrawn": { ru: "Лот снят с продажи", en: "The listing was withdrawn" },
  "heromkt.market_locked": {
    ru: "Купи хотя бы 1 пак в Магазине, чтобы открыть рынок героев",
    en: "Buy at least 1 pack in the Shop to unlock the hero market",
  },
  "heromkt.lot_busy": {
    ru: "Герой этого лота сейчас занят — купить нельзя",
    en: "This hero is busy right now and can't be bought",
  },
  "heromkt.own_lot": {
    ru: "Свой лот купить нельзя — его можно снять",
    en: "You can't buy your own listing — withdraw it instead",
  },
  "heromkt.not_seller": { ru: "Это не твой лот", en: "This listing is not yours" },
  "heromkt.gold_off": {
    ru: "Этот герой не продаётся за золото",
    en: "This hero isn't sold for gold",
  },
  "heromkt.darai_off": {
    ru: "Этот герой не продаётся за DARAI",
    en: "This hero isn't sold for DARAI",
  },
  "heromkt.price_changed": {
    ru: "Цена лота другая: {price} — обнови рынок",
    en: "The listing price is different: {price} — refresh the market",
  },
  "heromkt.gold_short": {
    ru: "Не хватает золота: нужно {need}, у тебя {have}",
    en: "Not enough gold: need {need}, you have {have}",
  },
  "heromkt.darai_short": {
    ru: "Не хватает DARAI: нужно {need}, у тебя {have}",
    en: "Not enough DARAI: need {need}, you have {have}",
  },
  "heromkt.busy_retry": {
    ru: "Рынок занят — повтори через секунду",
    en: "The market is busy — try again in a second",
  },
  "heromkt.failed": {
    ru: "Не получилось — ничего не списано и не потеряно, попробуй ещё раз",
    en: "That didn't work — nothing was charged or lost, try again",
  },
  "heromkt.listed_n": { ru: "Выставлено: {n}", en: "Listed: {n}" },
  "heromkt.listed_partial": {
    ru: "Выставлено: {n}, не вышло: {failed}",
    en: "Listed: {n}, failed: {failed}",
  },
  "heromkt.bag_dropped": {
    ru: "Вещи из карманов — в мешочке у твоего героя ({q}, {r})",
    en: "Pocket items are in a bag where your hero stands ({q}, {r})",
  },
};
