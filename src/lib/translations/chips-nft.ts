import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: ввод NFT в игру и мистические боксы.
// Отдельный субдомен — chips.ts уже перерос свой размер.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  "chips.nft_connect_wallet_hint": {
    ru: "Подключи кошелёк, чтобы увидеть свои NFT и внести их в игру.",
    en: "Connect a wallet to see your NFTs and add them to the game.",
  },
  "chips.nft_load_failed": {
    ru: "Не удалось загрузить NFT. Попробуй ещё раз.",
    en: "Could not load NFTs. Please try again.",
  },
  // ────────── отказы (бросаются ключом, humanError переведёт) ──────────
  "chips.config_loading": {
    ru: "Загружаем настройки ввода — секунду и повтори",
    en: "Loading input settings — one moment, then try again",
  },
  "chips.nothing_selected": { ru: "Не выбрано ни одной NFT", en: "No NFT selected" },
  "chips.too_many_nfts": { ru: "Максимум 120 NFT за раз", en: "Up to 120 NFTs at a time" },
  "chips.no_txhash": {
    ru: "Кошелёк не вернул номер транзакции — попробуй ещё раз",
    en: "The wallet returned no transaction hash — try again",
  },

  // ────────── итог ввода ──────────
  "chips.nft_result_ok": { ru: "NFT приняты", en: "NFTs accepted" },
  "chips.nft_result_part": { ru: "Приняты не все NFT", en: "Not all NFTs went through" },
  "chips.nft_result_fail": { ru: "Ввод не прошёл", en: "Nothing was added" },
  "chips.nft_result_not_sent": { ru: "Перевод не начался", en: "The transfer never started" },
  "chips.nft_where_packs": {
    ru: "Забирай во вкладке «Фишки» → «Паки»",
    en: "Pick them up in Chips → Packs",
  },
  "chips.nft_where_chips": {
    ru: "Забирай во вкладке «Фишки» → «Фишки»",
    en: "Pick them up in Chips → Chips",
  },
  "chips.nft_where_both": {
    ru: "Паки — во вкладке «Фишки» → «Паки», фишки — в «Фишки» → «Фишки»",
    en: "Packs are in Chips → Packs, chips in Chips → Chips",
  },
  "chips.nft_go_packs": { ru: "Открыть «Паки»", en: "Open Packs" },
  "chips.nft_go_chips": { ru: "Показать фишки", en: "Show chips" },
  "chips.nft_failed_n": { ru: "Не прошло NFT: {n} — {reason}", en: "Failed NFTs: {n} — {reason}" },
  // Перевод состоялся, но сеть ещё подтверждает его нашему индексу (обычно
  // 6-10 секунд, изредка до 40). Это не отказ: награду доводит фоновый догон,
  // поэтому строка стоит рядом с выданным, а не в списке ошибок.
  "chips.nft_pending_pack": {
    ru: "Пак придёт в течение минуты — делать ничего не нужно",
    en: "Your pack arrives within a minute — nothing to do",
  },
  "chips.nft_pending_chip": {
    ru: "Фишка придёт в течение минуты — делать ничего не нужно",
    en: "Your chip arrives within a minute — nothing to do",
  },
  "chips.nft_pending": {
    ru: "Перевод принят — награда придёт в течение минуты, делать ничего не нужно",
    en: "Transfer accepted — your reward arrives within a minute, nothing to do",
  },
  // Строка в экране итога. Замер на 1041 боевом переводе: медиана индексации
  // 6.5 с, 95.7 % укладывается в 10 с, максимум за три месяца — 38 с. Поэтому
  // обещаем минуту: это правда с запасом, а не круглое число.
  "chips.nft_pending_n": {
    ru: "{n} NFT уже у нас — награда придёт в течение минуты. Делать ничего не нужно, экран обновится сам",
    en: "{n} NFT already with us — the reward arrives within a minute. Nothing to do, the screen updates itself",
  },
  "chips.nft_result_pending": { ru: "Перевод принят", en: "Transfer accepted" },
  // Перевод старше учёта кругами (src/lib/nftCycle.ts::beforeCycles): сами не
  // зачитываем, выдачи того времени проверяются руками.
  "chips.nft_before_cycles": {
    ru: "Старый перевод — зачисление проверим вручную",
    en: "Old transfer — we'll check its credit manually",
  },
  "chips.nft_fail_unknown": { ru: "причина неизвестна", en: "reason unknown" },
  "chips.nft_receipt_hint": {
    ru: "Это итог прошлого ввода NFT",
    en: "This is the result of your last NFT add",
  },

  // ────────── ход операции ──────────
  "chips.nft_batch_progress": { ru: "Партия {i} из {n}", en: "Batch {i} of {n}" },
  "chips.nft_phase_sign": {
    ru: "подтверди перевод в кошельке",
    en: "confirm the transfer in your wallet",
  },
  "chips.nft_phase_issue": { ru: "выдаём награду", en: "issuing your reward" },
  "chips.nft_many_batches": {
    ru: "Больше {per} NFT в одну транзакцию не влезает — уйдут {n} партиями, подпись спросят на каждую",
    en: "More than {per} NFTs don't fit in one transaction — they go in {n} batches, each needs a signature",
  },

  // ────────── уже введённые ──────────
  "chips.nft_already_in_game": { ru: "Уже в игре: {n}", en: "Already in game: {n}" },
  "chips.nft_already_hint": {
    ru: "Награда за них выдана — ищи во вкладке «Фишки». Из списка кошелька пропадут сами.",
    en: "Their reward is already issued — look in the Chips tab. They will drop off this list on their own.",
  },
  "chips.nft_all_entered": {
    ru: "Все подходящие NFT уже введены.",
    en: "All eligible NFTs are already added.",
  },

  // ────────── мелочь списка ──────────
  "chips.cap_max": { ru: "· макс {n}", en: "· max {n}" },
  "chips.pcs_n": { ru: "{n} шт", en: "{n} pcs" },
  "chips.less": { ru: "меньше", en: "less" },
  "chips.more": { ru: "больше", en: "more" },
  "chips.sub_items": { ru: "Инвентарь", en: "Items" },

  // ────────── мистические боксы ──────────
  "chips.mystic_boxes": { ru: "Мистические боксы", en: "Mystic boxes" },
  "chips.mystic_dropped": { ru: "Выпало", en: "You got" },
  "chips.mystic_blank": { ru: "В другой раз!", en: "Better luck next time!" },
  "chips.mystic_take": { ru: "Забрать", en: "Take" },
  "chips.prize_pack": { ru: "Пак фишек", en: "Chip pack" },
  "chips.prize_tickets": { ru: "{n} билетов", en: "{n} tickets" },
  "chips.prize_energy": { ru: "{n} энергии", en: "{n} energy" },
  "chips.prize_artifact": { ru: "Артефакт", en: "Artifact" },
  "chips.prize_hero": { ru: "Герой", en: "Hero" },
  "chips.rarity_common": { ru: "обычный", en: "common" },
  "chips.rarity_rare": { ru: "редкий", en: "rare" },
  "chips.rarity_epic": { ru: "эпический", en: "epic" },
  "chips.rarity_legendary": { ru: "легендарный", en: "legendary" },
  "chips.mystic_where_items": {
    ru: "Лежит во вкладке «Фишки» → «Инвентарь»",
    en: "It is in Chips → Items",
  },
  "chips.mystic_where_packs": {
    ru: "Пак ждёт во вкладке «Фишки» → «Паки»",
    en: "The pack is waiting in Chips → Packs",
  },
  "chips.mystic_where_balance": { ru: "Начислено на баланс", en: "Added to your balance" },
  "chips.mystic_go_items": { ru: "Открыть инвентарь", en: "Open items" },
  "chips.mystic_go_packs": { ru: "К пакам", en: "Go to packs" },
  "chips.prize_likes": { ru: "{n} лайков", en: "{n} likes" },
  "chips.prize_amount": { ru: "{n} × {what}", en: "{n} × {what}" },
  "chips.mystic_where_backpack": {
    ru: "Лежит в рюкзаке выбранного героя",
    en: "It is in your selected hero's backpack",
  },
  "chips.mystic_where_resources": { ru: "Начислено к ресурсам", en: "Added to your resources" },
};
