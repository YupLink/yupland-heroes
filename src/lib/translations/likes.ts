import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Лайки
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  "likes.buy_likes_for_tickets": { ru: "Купить лайки за билеты", en: "Buy likes for tickets" },
  "likes.bought_toast": {
    ru: "+{likes} 👍 · −{tickets} билетов",
    en: "+{likes} 👍 · −{tickets} tickets",
  },
  "likes.buy_likes": { ru: "Купить лайки", en: "Buy likes" },
  "likes.you_have": { ru: "У тебя", en: "You have" },
  "likes.loading_packages": { ru: "Загружаем пакеты…", en: "Loading packages…" },
  "likes.no_packages": {
    ru: "Админ ещё не настроил пакеты лайков.",
    en: "Admin hasn't set up like packages yet.",
  },
  "likes.for_all": { ru: "за всё (×{qty})", en: "for all (×{qty})" },
  "likes.for_price": { ru: "за", en: "for" },
  "likes.tickets_count": { ru: "{n} билетов", en: "{n} tickets" },
  // Пакет лайков за золото (бывшие билеты ×500, §8.61).
  "likes.gold_count": { ru: "{n} золота", en: "{n} gold" },
  "likes.bought_toast_gold": {
    ru: "+{likes} 👍 · −{gold} золота",
    en: "+{likes} 👍 · −{gold} gold",
  },
  "likes.buy_likes_for_gold": { ru: "Купить лайки за золото", en: "Buy likes for gold" },
  "likes.bonus_pct": { ru: "+{pct}% бонус", en: "+{pct}% bonus" },
  "likes.buy": { ru: "Купить", en: "Buy" },
  "likes.packs_label": { ru: "паков:", en: "packs:" },
  "likes.like_given": { ru: "Лайк отдан", en: "Like sent" },
  "likes.not_enough_likes": { ru: "Не хватает лайков", en: "Not enough likes" },
  "likes.search_nft_placeholder": {
    ru: "Найди NFT по названию (нажми чтобы открыть список)",
    en: "Search NFT by name (tap to open the list)",
  },
  "likes.tab_all_nfts": { ru: "Все NFT", en: "All NFTs" },
  "likes.tab_my_nfts": { ru: "Мои NFT", en: "My NFTs" },
  "likes.filter_my_placeholder": { ru: "Фильтр по названию", en: "Filter by name" },
  "likes.my_nfts_empty": {
    ru: "У тебя пока нет NFT. Открой «Мои NFT» — инвентарь подгрузится за пару секунд.",
    en: "You don't own any NFTs yet. Open “My NFTs” — your inventory loads in a couple of seconds.",
  },
  "likes.my_nfts_none_filtered": {
    ru: "Ничего не найдено среди твоих NFT",
    en: "No matches among your NFTs",
  },
  "likes.you_own": { ru: "у тебя {n} шт", en: "you own {n}" },
  "likes.loading": { ru: "Загружаем…", en: "Loading…" },
  "likes.not_found_vote_below": {
    ru: "Не найдено. Голосуй за свой ниже",
    en: "Nothing found. Vote for yours below",
  },
  "likes.catalog_empty": {
    ru: "Каталог пуст — попроси админа отсканировать",
    en: "Catalog is empty — ask the admin to scan",
  },
  "likes.in_hands_hint": {
    ru: "Кол-во на руках у людей. Только эти NFT учитываются в пороге лайков.",
    en: "Number held by people. Only these NFTs count toward the like threshold.",
  },
  "likes.in_hands": { ru: "на руках {n}", en: "held {n}" },
  "likes.cycle_hint": {
    ru: "Цикл №{no}. После каждого дропа порог удваивается, чтобы один холдер не протаскивал свои NFT.",
    en: "Cycle #{no}. The threshold doubles after each drop so no single holder can push through their own NFTs.",
  },
  "likes.cycle_badge": { ru: "цикл {no} · ×{mult}", en: "cycle {no} · ×{mult}" },
  "likes.top": { ru: "Топ", en: "Top" },
  "likes.top_count": { ru: "· {loaded} из {total}", en: "· {loaded} of {total}" },
  "likes.in_hands_short_hint": {
    ru: "Кол-во на руках (без сожжённых/в дупле)",
    en: "Number held (excluding burned/in duplex)",
  },
  "likes.in_hands_dot": { ru: "· на руках {n}", en: "· held {n}" },
  "likes.you_likes": { ru: "ты: {n}", en: "you: {n}" },
  "likes.ready": { ru: "готов!", en: "ready!" },
  "likes.load_more": { ru: "Ещё (+{n})", en: "More (+{n})" },
  "likes.balance_footer": {
    ru: "у тебя 👍 {available}/{max} · +1 в день",
    en: "you have 👍 {available}/{max} · +1 per day",
  },
  "likes.promo_redeemed": {
    ru: "+{likes} 👍 по промокоду {code}",
    en: "+{likes} 👍 from promo code {code}",
  },
  "likes.promocode": { ru: "Промокод", en: "Promo code" },
  "likes.enter_code": { ru: "Введи код", en: "Enter code" },
  "likes.activate": { ru: "Активировать", en: "Activate" },
};
