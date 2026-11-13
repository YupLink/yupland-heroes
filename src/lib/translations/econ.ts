// Панель «$ Экономика» → новые вкладки «как на ладони»: Дельты, Ресурс,
// Сделки, Лазейки и лента игрока. Старые четыре вкладки (Товары/Игроки/
// Города/Дёшево-Дорого) сознательно русскоязычные — их сюда не тащим.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  // ─────────── Вкладки и период ───────────
  "econ.tab.delta": { ru: "Дельты", en: "Deltas" },
  "econ.tab.resource": { ru: "Ресурс", en: "Resource" },
  "econ.tab.trades": { ru: "Сделки", en: "Trades" },
  "econ.tab.loopholes": { ru: "Лазейки", en: "Loopholes" },
  "econ.tab.news": { ru: "Новости", en: "News" },
  "econ.tab.refs": { ru: "Рефералы", en: "Referrals" },
  "econ.refs.inviter": { ru: "Пригласил", en: "Inviter" },
  "econ.refs.friends": { ru: "Друзей", en: "Friends" },
  "econ.refs.spent10": { ru: "От $10", en: "$10+" },
  "econ.refs.spent": { ru: "Потратили", en: "Spent" },
  "econ.refs.gold": { ru: "Золото по рефке", en: "Referral gold" },
  "econ.refs.clicks": { ru: "Переходов", en: "Clicks" },
  "econ.refs.last": { ru: "Последний друг", en: "Last friend" },
  "econ.refs.friend": { ru: "Друг", en: "Friend" },
  "econ.refs.joined": { ru: "Пришёл", en: "Joined" },
  // Вкладка «Новости»: текст для поста и ссылка на API с ключом.
  "econ.news.copy": { ru: "Скопировать текст", en: "Copy text" },
  "econ.news.copied": { ru: "Текст скопирован", en: "Text copied" },
  "econ.news.api": { ru: "Ссылка на «Вестник»", en: "Herald link" },
  "econ.news.api_copied": { ru: "Ссылка скопирована", en: "Link copied" },
  "econ.news.copy_failed": { ru: "Не удалось скопировать", en: "Could not copy" },
  // «Вестник героев» по кнопке — сводка 7 дней в канал (газета дня выходит сама).
  "econ.news.publish_week": { ru: "Опубликовать в канал", en: "Post to channel" },
  "econ.news.publish_sure": { ru: "Точно? Нажми ещё раз", en: "Sure? Tap again" },
  "econ.news.published": { ru: "Выпуск отправлен", en: "Issue posted" },
  "econ.news.no_chat": {
    ru: "Канал не подключён",
    en: "No channel set",
  },
  "econ.news.send_failed": { ru: "Telegram не принял выпуск", en: "Telegram rejected the issue" },
  "econ.news.already": {
    ru: "Эта сводка уже вышла или уходит прямо сейчас",
    en: "This digest is already out or being posted",
  },
  "econ.news.unknown": {
    ru: "Telegram не ответил — проверь канал, повторять не стоит",
    en: "Telegram didn't answer — check the channel before retrying",
  },
  "econ.period.custom": { ru: "Период…", en: "Period…" },
  "econ.period.from": { ru: "с", en: "from" },
  "econ.period.to": { ru: "по", en: "to" },
  // Сводка (старые вкладки) умеет только 24ч/7дн/30дн — при своём периоде
  // честно говорим, за какое окно она считает, чтобы цифры не спутали.
  "econ.period.overview_hint": {
    ru: "Сводка считает за {period}, свой период — только в новых вкладках",
    en: "Overview uses {period}; the custom range applies to the new tabs only",
  },

  // ─────────── Общее ───────────
  "econ.error": { ru: "Ошибка: {msg}", en: "Error: {msg}" },
  "econ.empty": { ru: "За этот период движений нет", en: "No movements in this period" },
  "econ.more": { ru: "Ещё", en: "More" },
  "econ.close": { ru: "Закрыть", en: "Close" },
  "econ.truncated": {
    ru: "Показаны не все строки — сузь период или выбери валюту",
    en: "Not all rows are shown — narrow the period or pick a currency",
  },
  "econ.all_currencies": { ru: "Все валюты", en: "All currencies" },
  "econ.unknown": { ru: "неизвестно", en: "unknown" },
  "econ.rows_n": { ru: "строк: {n}", en: "{n} rows" },

  // ─────────── Колонки ───────────
  "econ.col.player": { ru: "Игрок", en: "Player" },
  "econ.col.currency": { ru: "Валюта", en: "Currency" },
  "econ.col.net": { ru: "Нетто", en: "Net" },
  "econ.col.trades": { ru: "Сделок", en: "Trades" },
  "econ.col.margin": { ru: "Навар", en: "Margin" },
  "econ.col.day": { ru: "День", en: "Day" },
  "econ.col.time": { ru: "Время", en: "Time" },
  "econ.col.side": { ru: "Сторона", en: "Side" },
  "econ.col.item": { ru: "Товар", en: "Item" },
  "econ.col.qty": { ru: "Кол-во", en: "Qty" },
  "econ.col.price": { ru: "Цена", en: "Price" },
  "econ.col.where": { ru: "Где", en: "Where" },
  "econ.col.counterparty": { ru: "Контрагент", en: "Counterparty" },
  "econ.col.ledger": { ru: "Леджер", en: "Ledger" },
  "econ.col.kind": { ru: "Вид", en: "Kind" },
  "econ.col.note": { ru: "Заметка", en: "Note" },
  "econ.col.n": { ru: "Раз", en: "Times" },

  // ─────────── Дельты ───────────
  "econ.by_kind": { ru: "По видам", en: "By kind" },
  "econ.delta.hint": {
    ru: "Строка — раскрыть по видам, имя — лента игрока",
    en: "Row — expand by kind, name — player feed",
  },

  // ─────────── Ресурс ───────────
  "econ.supply_now": { ru: "Сейчас у игроков", en: "Held by players now" },
  "econ.sources": { ru: "Откуда приходит", en: "Sources" },
  "econ.sinks": { ru: "Куда уходит", en: "Sinks" },
  "econ.by_day": { ru: "По дням", en: "By day" },
  "econ.top_plus": { ru: "Больше всех получили", en: "Top gainers" },
  "econ.top_minus": { ru: "Больше всех потратили", en: "Top spenders" },
  "econ.none": { ru: "Нет", en: "None" },

  // ─────────── Сделки ───────────
  "econ.chains": { ru: "Цепочки купил → продал", en: "Buy → sell chains" },
  "econ.raw_trades": { ru: "Сделки", en: "Trades" },
  "econ.filter.player": { ru: "Игрок…", en: "Player…" },
  "econ.filter.source_all": { ru: "Все источники", en: "All sources" },
  "econ.chain.bought": { ru: "купил {n} за {total} {cur}", en: "bought {n} for {total} {cur}" },
  "econ.chain.sold": { ru: "продал {n} за {total} {cur}", en: "sold {n} for {total} {cur}" },
  "econ.chain.at": { ru: "в", en: "at" },
  "econ.no_chains": { ru: "Цепочек нет", en: "No chains" },
  "econ.no_trades": { ru: "Сделок нет", en: "No trades" },

  // ─────────── Лента игрока ───────────
  "econ.feed.title": { ru: "Лента: {name}", en: "Feed: {name}" },
  "econ.feed.empty": { ru: "Движений нет", en: "No movements" },

  // ─────────── Группы движений (EconKindGroup) ───────────
  "econ.group.reward": { ru: "Награды", en: "Rewards" },
  "econ.group.mine": { ru: "Шахты/поля", en: "Mines/fields" },
  "econ.group.trade_buy": { ru: "Покупки", en: "Purchases" },
  "econ.group.trade_sell": { ru: "Продажи", en: "Sales" },
  "econ.group.sink": { ru: "Плата (ворота/постройки)", en: "Fees (gates/buildings)" },
  "econ.group.deposit": { ru: "Ввод", en: "Deposit" },
  "econ.group.withdraw": { ru: "Вывод", en: "Withdrawal" },
  "econ.group.gift": { ru: "Подарки/админ", en: "Gifts/admin" },
  "econ.group.energy_regen": { ru: "Реген энергии", en: "Energy regen" },
  "econ.group.energy_decay": { ru: "Таяние энергии", en: "Energy decay" },
  "econ.group.energy_spend": { ru: "Траты энергии", en: "Energy spent" },
  "econ.group.other": { ru: "Прочее", en: "Other" },

  // ─────────── Леджеры ───────────
  "econ.ledger.acc": { ru: "Счёт", en: "Account" },
  "econ.ledger.res": { ru: "Ресурсы", en: "Resources" },
  "econ.ledger.ticket": { ru: "Билеты", en: "Tickets" },
  "econ.ledger.energy": { ru: "Энергия", en: "Energy" },
  "econ.ledger.likes": { ru: "Лайки", en: "Likes" },
  "econ.ledger.trade": { ru: "Сделка", en: "Trade" },

  // ─────────── Источники сделок (TradeSource) ───────────
  "econ.source.market": { ru: "Маркет", en: "Market" },
  "econ.source.market_sell": { ru: "Продажа маркету", en: "Sell to market" },
  "econ.source.town": { ru: "Ратуша", en: "Town hall" },
  "econ.source.chip_market": { ru: "Рынок фишек", en: "Chip market" },
  "econ.source.wh_take": { ru: "Взял со склада", en: "Took from shelf" },
  "econ.source.wh_put": { ru: "Положил на склад", en: "Put on shelf" },
  "econ.source.gate": { ru: "Ворота", en: "Gate" },
  "econ.source.portal": { ru: "Портал", en: "Portal" },
  "econ.source.tour": { ru: "Запись на турнир", en: "Tournament entry" },
  "econ.source.field": { ru: "Поле → склад", en: "Field → warehouse" },
  "econ.source.chest": { ru: "Сундук", en: "Chest" },
  "econ.source.chest_plunder": { ru: "Грабёж сундука", en: "Chest plunder" },
  "econ.source.loot_bag": { ru: "Мешочек", en: "Loot bag" },
  "econ.source.plain_chest": { ru: "Сундук", en: "Chest" },
  "econ.source.mystic": { ru: "Бокс", en: "Box" },
  "econ.source.fish": { ru: "Улов", en: "Catch" },
  "econ.source.drink": { ru: "Выпил/съел", en: "Consumed" },

  // ─────────── Сторона сделки (TradeSide) ───────────
  "econ.side.buy": { ru: "купил", en: "bought" },
  "econ.side.sell": { ru: "продал", en: "sold" },
  "econ.side.take": { ru: "взял", en: "took" },
  "econ.side.put": { ru: "положил", en: "put" },
  "econ.side.pay": { ru: "заплатил", en: "paid" },
  "econ.side.use": { ru: "употребил", en: "used" },

  // Контрагент-не-игрок.
  "econ.cp.shop": { ru: "маркет", en: "shop" },
  "econ.cp.town": { ru: "ратуша", en: "town" },
  "econ.cp.sink": { ru: "никому", en: "sink" },

  // ─────────── Лазейки (LoopholeKind) ───────────
  "econ.loop.arbitrage": { ru: "Арбитраж", en: "Arbitrage" },
  "econ.loop.arbitrage_hint": {
    ru: "Купил дёшево в одном месте, продал дорого в другом",
    en: "Bought cheap in one place, sold dear in another",
  },
  "econ.loop.shelf_taker": { ru: "Общая полка", en: "Shared shelf" },
  "econ.loop.shelf_taker_hint": {
    ru: "Берёт с общих полок больше, чем кладёт",
    en: "Takes more from shared shelves than puts back",
  },
  "econ.loop.energy_outlier": { ru: "Энергия из подарков", en: "Gifted energy" },
  "econ.loop.energy_outlier_hint": {
    ru: "Энергии от админа кратно больше, чем регена, покупок и наград игры вместе",
    en: "Admin-gifted energy dwarfs regen, purchases and in-game rewards combined",
  },
  "econ.loop.reward_heavy": { ru: "Только награды", en: "Rewards only" },
  "econ.loop.reward_heavy_hint": {
    ru: "Почти весь приход — награды и подарки, трат нет",
    en: "Nearly all income is rewards and gifts, no spending",
  },
  "econ.loop.empty": { ru: "Подозрительного не нашли", en: "Nothing suspicious found" },
  "econ.loop.score": { ru: "балл", en: "score" },
  "econ.loop.details": { ru: "Подробности", en: "Details" },

  // ─────────── Валюты (только те, у кого есть человеческое имя) ───────────
  "econ.cur.gold": { ru: "Золото", en: "Gold" },
  "econ.cur.wood": { ru: "Дерево", en: "Wood" },
  "econ.cur.stone": { ru: "Камень", en: "Stone" },
  "econ.cur.diamonds": { ru: "Алмазы", en: "Diamonds" },
  "econ.cur.tickets": { ru: "Билеты", en: "Tickets" },
  "econ.cur.likes": { ru: "Лайки", en: "Likes" },
  "econ.cur.Energy": { ru: "Энергия", en: "Energy" },
  "econ.cell.go": { ru: "показать клетку на карте", en: "show the cell on the map" },
  "econ.cell.from_to": { ru: "куплено → продано", en: "bought → sold" },
};
