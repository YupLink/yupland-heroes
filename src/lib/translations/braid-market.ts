import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы маркет-постройки: витрина, покупка, фильтр покупателей. Механику
// настройки товаров держит админ; тексты — двумя языками.
export const dict: Record<string, Entry> = {
  "market.title": { ru: "Маркет", en: "Market" },
  "market.buy_for": { ru: "Купить за {price}", en: "Buy for {price}" },
  "market.buy": { ru: "Купить", en: "Buy" },
  "market.cart_buy": { ru: "Купить · {n}", en: "Buy · {n}" },
  "market.cart_pick": { ru: "Выбери товары", en: "Pick goods" },
  "market.cart_done": { ru: "Куплено: {n}", en: "Bought: {n}" },
  "market.will_spend": { ru: "Потратишь:", en: "You'll spend:" },
  "market.will_give": { ru: "Отдашь:", en: "You'll give:" },
  "market.unavailable": { ru: "Недоступно", en: "Unavailable" },
  "market.empty": { ru: "Товаров пока нет", en: "No goods yet" },
  "market.sold_toast": { ru: "Куплено: {name}", en: "Bought: {name}" },
  "market.to_account": { ru: "Зачислено на счёт", en: "Credited to your account" },
  "market.to_inventory": { ru: "Лежит в инвентаре", en: "Added to your inventory" },
  // Рюкзак героя: куда легли art/boss/custom, и отказ при переполнении.
  "market.to_backpack": { ru: "В рюкзак героя", en: "Into the hero's backpack" },
  "market.backpack_full": { ru: "Рюкзак героя полон", en: "Hero's backpack is full" },
  // С числами: игроку нужно знать, сколько ячеек освободить, а не просто «полно».
  "market.backpack_need": {
    ru: "Освободи место в рюкзаке: нужно {need} яч., свободно {free}",
    en: "Free up backpack space: {need} more cell(s) needed, {free} free",
  },
  // Рюкзак принадлежит герою, поэтому без выбранного героя его просто нет.
  // Ключ кидают field-reward, warehouse и market-backpack-read — они за
  // пределами замка, где живёт braid.backpack_no_hero, и без своей записи
  // игрок видел вместо текста голый ключ.
  "market.backpack_no_hero": {
    ru: "Сначала выбери героя — рюкзак у него",
    en: "Pick a hero first — the backpack is theirs",
  },
  // Без {price}: сервер в точке отказа не знает цену, а t() вызывается без
  // подстановок — иначе игрок видел литеральное «{price}».
  "market.not_enough": { ru: "Не хватает средств", en: "Not enough" },
  // Отказ оплаты покупки словами (market-buy-short): список уже на обоих языках.
  "market.short": { ru: "Не хватает: {ru}", en: "Not enough: {en}" },
  // Товар без вида (ключ 'custom:' без шаблона) в рюкзак не кладём: такой стек
  // не продать и не сложить с нормальным — см. stackKeyFor.
  "market.bad_item": {
    ru: "Товар без шаблона — сообщи админу",
    en: "Item has no template — tell an admin",
  },
  "market.locked_hero": {
    ru: "Только для определённых героев",
    en: "For specific heroes only",
  },
  // «Только для расы: … · специализация: …» — говорим о фильтре, а не «о герое»;
  // сам герой один, а ограничение может быть по расе, спецу или обоим сразу.
  "market.shop_locked": { ru: "Только {who}", en: "For {who} only" },
  "market.shop_fits": { ru: "Магазин работает для тебя · {who}", en: "Open to you · {who}" },
  "market.shop_by_race": { ru: "для расы {race}", en: "for race {race}" },
  "market.shop_by_spec": { ru: "для специализации {spec}", en: "for specialization {spec}" },
  "market.need_hero": { ru: "Нужен основной герой", en: "Pick a main hero first" },
  "market.art_rarity_empty": {
    ru: "В каталоге нет активных артефактов этой редкости — админ пусть добавит",
    en: "No active artifacts of this rarity in the catalog — an admin needs to add one",
  },
  // «Нет свободного» — не придирка: надетые артефакты не считаются, и игрок с
  // полным героем должен понимать, почему сдавать нечего.
  // Изношенные тоже: маркет и ломбард берут только целые (износ, 22.10.2026).
  "market.art_rarity_none": {
    ru: "Нет свободного целого артефакта такой редкости — надетые и изношенные не считаются",
    en: "No spare intact artifact of this rarity — equipped and worn ones don't count",
  },
  "market.art_rarity_wrong": {
    ru: "У этого артефакта другая редкость",
    en: "That artifact is of a different rarity",
  },
  // Именная позиция скупки: витрина просит КОНКРЕТНЫЙ шаблон, и редкость тут
  // ни при чём — прежний текст про редкость сбивал с толку.
  "market.art_named_none": {
    ru: "Нет свободного целого такого артефакта — надетые и изношенные не считаются",
    en: "No spare intact artifact of this kind — equipped and worn ones don't count",
  },
  "market.art_pick": { ru: "Какой артефакт отдать", en: "Which artifact to give" },
  "market.art_pick_none": {
    ru: "Свободных артефактов нет",
    en: "No spare artifacts",
  },
  // Короткие подписи для КНОПКИ на плитке: в гриде 3-в-ряд у неё около сотни
  // пикселей, и полные фразы там обрезаются многоточием. Полные остались в
  // шапке попапа и в его пустом состоянии, где места хватает.
  "market.art_pick_short": { ru: "Выбрать арт", en: "Pick artifact" },
  "market.art_pick_none_short": { ru: "Нечего сдать", en: "Nothing spare" },
  // Сбой запроса — это НЕ «нечего сдать»: инвентарь на месте, до него не
  // доехали. Отдельные подписи, чтобы игрок понял и нажал «Повторить».
  "market.art_pick_error_short": { ru: "Ошибка", en: "Error" },
  "market.art_pick_error": {
    ru: "Не удалось получить список артефактов",
    en: "Could not load the artifact list",
  },
  "market.retry": { ru: "Повторить", en: "Retry" },
  // Сколько таких артефактов лежит СВОБОДНЫМИ (надетые не в счёт) — подпись
  // плитки в пикере: одинаковые схлопнуты в одну.
  "market.art_free": { ru: "свободно {n}", en: "{n} free" },
  "market.pick_apply": { ru: "Выбрать", en: "Choose" },
  "market.not_found": { ru: "Товар не найден", en: "Item not found" },
  "market.need_account": {
    ru: "Нужен аккаунт — привяжи Telegram",
    en: "Link Telegram to get an account",
  },
  "market.give_failed": {
    ru: "Не удалось выдать товар — оплата возвращена",
    en: "Could not deliver the item — payment refunded",
  },
  "market.price_of": { ru: "{n} {res}", en: "{n} {res}" },
  "market.gives": { ru: "Даёт: {name}", en: "Gives: {name}" },
  // ── запас / вторая цена / покупка N штук ──
  "market.sold_out": { ru: "Распродано", en: "Sold out" },
  "market.left": { ru: "Осталось {n}", en: "{n} left" },
  "market.limit_reached": { ru: "Лимит на сегодня", en: "Daily limit reached" },
  "market.you_get": { ru: "получишь {what}", en: "you get {what}" },
  "market.mode_buy": { ru: "Купить", en: "Buy" },
  "market.mode_sell": { ru: "Продать", en: "Sell" },
  "market.cart_sell": { ru: "Продать · {n}", en: "Sell · {n}" },
  "market.cart_sold": { ru: "Продано: {n}", en: "Sold: {n}" },
  // Скупка: у позиции свой лимит приёма, а не запас товара.
  "market.buyout_full": { ru: "Больше не скупаем", en: "Not buying any more" },
  "market.buyout_left": { ru: "Примем ещё {n}", en: "{n} more accepted" },
  "market.wrong_side": {
    ru: "Эта сделка идёт в другую сторону",
    en: "This deal works the other way round",
  },
  "market.bad_qty": { ru: "Неверное количество", en: "Bad quantity" },
  "market.qty": { ru: "Кол-во", en: "Qty" },
  // Кнопка покупки со счётчиком: при 1 шт — просто «Купить».
  "market.buy_n": { ru: "Купить {n}", en: "Buy {n}" },

  // ── подписи обмена на плитке ──
  // Одна на плитку: картинка — сам товар, а подпись объясняет вторую сторону
  // сделки. В покупке это цена («Отдаёшь»), в скупке — выплата («Получишь»).
  "market.tile_pay": { ru: "Отдаёшь", en: "You give" },
  "market.tile_get": { ru: "Получишь", en: "You get" },
  // Кнопка «набрать всё, что есть на руках». Рядом с ней сразу число единиц,
  // чтобы не идти в рюкзак считать.
  "market.max": { ru: "Макс", en: "Max" },

  // ── названия ресурсов для цены/товара ──
  "market.res.gold": { ru: "золото", en: "gold" },
  "market.res.stone": { ru: "камень", en: "stone" },
  "market.res.wood": { ru: "дерево", en: "wood" },
  "market.res.diamonds": { ru: "алмазы", en: "diamonds" },
  "market.res.likes": { ru: "лайки", en: "likes" },
  "market.res.tickets": { ru: "билеты", en: "tickets" },
  "market.res.energy": { ru: "энергия", en: "energy" },
  "market.res.token": { ru: "токен", en: "token" },
  "market.res.item": { ru: "товар", en: "item" },
  // Предметные цены (платят паком/героем/артефактом/боссом/своим товаром).
  // Без этих записей подпись цены рисовала сам ключ: «1 market.res.art …».
  "market.res.pack": { ru: "пак", en: "pack" },
  "market.res.hero": { ru: "герой", en: "hero" },
  "market.res.art": { ru: "артефакт", en: "artifact" },
  "market.res.boss": { ru: "босс", en: "boss" },
  "market.res.custom": { ru: "товар", en: "item" },

  // ── «любой артефакт редкости X» ──
  // Псевдо-шаблон art_any_*: имени у него нет, а id в подписи цены выглядел
  // утёкшим наружу идентификатором.
  "market.art_any.common": { ru: "любой обычный артефакт", en: "any common artifact" },
  "market.art_any.rare": { ru: "любой редкий артефакт", en: "any rare artifact" },
  "market.art_any.epic": { ru: "любой эпический артефакт", en: "any epic artifact" },
  "market.art_any.legendary": { ru: "любой легендарный артефакт", en: "any legendary artifact" },

  // ── редактор (админ) ──
  "market.ed.title": { ru: "Товары маркета", en: "Market goods" },
  "market.ed.add": { ru: "Добавить товар", en: "Add a good" },
  "market.ed.kind": { ru: "Тип товара", en: "Good type" },
  "market.ed.name": { ru: "Название", en: "Name" },
  "market.ed.image": { ru: "Картинка", en: "Image" },
  "market.ed.give": { ru: "Сколько выдать", en: "How much to give" },
  "market.ed.ref": { ru: "Что именно", en: "Which one" },
  "market.ed.price": { ru: "Цена", en: "Price" },
  "market.ed.price_res": { ru: "Чем платят", en: "Paid with" },
  "market.ed.price2": { ru: "Вторая цена", en: "Second price" },
  "market.ed.price2_on": { ru: "Добавить вторую цену", en: "Add a second price" },
  "market.ed.stock": { ru: "Запас", en: "Stock" },
  "market.ed.stock_unlimited": { ru: "Без лимита", en: "Unlimited" },
  "market.ed.refill": { ru: "Пополнить", en: "Refill" },
  "market.ed.buyers": { ru: "Кто может купить", en: "Who can buy" },
  "market.ed.buyers_all": { ru: "Все", en: "Everyone" },
  "market.ed.buyers_filter": { ru: "Отдельные герои", en: "Specific heroes" },
  "market.ed.races": { ru: "Расы", en: "Races" },
  "market.ed.specs": { ru: "Специализации", en: "Specializations" },
  "market.ed.save": { ru: "Сохранить товар", en: "Save good" },
  "market.ed.remove": { ru: "Удалить", en: "Remove" },
  "market.ed.kind.resource": { ru: "Ресурс", en: "Resource" },
  "market.ed.kind.pack": { ru: "Пак", en: "Pack" },
  "market.ed.kind.hero": { ru: "Герой", en: "Hero" },
  "market.ed.kind.art": { ru: "Артефакт", en: "Artifact" },
  "market.ed.kind.boss": { ru: "Босс", en: "Boss" },
  "market.ed.kind.custom": { ru: "Свой товар", en: "Custom" },
  // Магический сундук: отказы сервера ключами, как market.* (humanError). Все
  // ключи chest.* — здесь, в одном месте: первый из них бросает сам маркет.
  "chest.merchant_only": {
    ru: "Магический сундук может купить только Торговец",
    en: "Only a Merchant can buy the Magic Chest",
  },
  "chest.not_chest": { ru: "Это не магический сундук", en: "This is not a Magic Chest" },
  "chest.cell_busy": { ru: "Здесь сундук не поставить", en: "You can't place a chest here" },
  "chest.not_owner": { ru: "Это чужой сундук", en: "This chest belongs to someone else" },
  "chest.own_chest": { ru: "Это твой сундук", en: "This is your chest" },
  "chest.guarded": { ru: "Сундук охраняет босс", en: "The chest is guarded by a boss" },
  "chest.gone": { ru: "Сундука уже нет", en: "The chest is gone" },
  "chest.approach": { ru: "Подойди к сундуку", en: "Walk up to the chest" },
  "chest.not_mob": {
    ru: "В сундук кладётся только собранное",
    en: "Only collected goods go into the chest",
  },
  "chest.net_full": { ru: "В сундуке нет места", en: "The chest is full" },
  "chest.need_guard": {
    ru: "Нужен босс-охранник в рюкзаке",
    en: "You need a guard boss in your backpack",
  },
  "chest.loot_gone": { ru: "Добыча уже забрана", en: "The loot has already been taken" },
  "chest.guard_busy": { ru: "Охранник уже стоит", en: "A guard is already standing here" },
  // «Забрать сундук»: последний сундук с товарами и сундук с раненой охраной
  // без подтверждения не отдаём — окно показывает цифры; рюкзак или сеть
  // менялись под рукой трижды подряд.
  "chest.last_confirm": {
    ru: "Проверь, что уйдёт, и подтверди",
    en: "Check what happens and confirm",
  },
  "chest.busy": {
    ru: "Рюкзак или сундук менялись — повтори",
    en: "The backpack or chest changed — try again",
  },
};
