import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Лендинг
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── landing ──────────
  "landing.kicker": { ru: "Новая эра NFT", en: "New era of NFTs" },
  "landing.hero_line1": { ru: "Голосуй за NFT —", en: "Vote for NFTs —" },
  "landing.hero_line2": { ru: "забирай", en: "collect" },
  "landing.hero_line3": { ru: "призы", en: "prizes" },
  "landing.hero_sub": { ru: "Погашай NFT и получай награды в токенах экосистемы", en: "Redeem NFTs and earn rewards in ecosystem tokens" },
  "landing.cta_open_nfts": { ru: "Открыть мешочек", en: "Open bag" },
  "landing.cta_connect": { ru: "Подключить кошелёк", en: "Connect wallet" },
  // Вход только через Telegram (18.10.2026): гостю — эта кнопка вместо кошелька.
  "auth.tg_login": { ru: "Войти через Telegram", en: "Log in with Telegram" },
  "auth.tg_login_desc": {
    ru: "В игру входят через Telegram. Кошелёк добавляется уже в игре — с подписью.",
    en: "You log in with Telegram. A wallet is added later in the game, with a signature.",
  },
  "landing.chips_cta": { ru: "Фишки", en: "Chips" },
  "landing.chips_tagline": { ru: "Собирай и сражайся", en: "Collect and battle" },
  "landing.how_it_works": { ru: "Как это работает", en: "How it works" },
  "landing.step1_title": { ru: "Подключи кошелёк", en: "Connect wallet" },
  "landing.step1_desc": { ru: "Привяжи Telegram к NEAR-кошельку", en: "Link Telegram to your NEAR wallet" },
  "landing.step2_title": { ru: "Получи мешочек", en: "Get a bag" },
  "landing.step2_desc": { ru: "NFT попадёт в твой инвентарь", en: "NFT will appear in your inventory" },
  "landing.step3_title": { ru: "Открой мешочек", en: "Open the bag" },
  "landing.step3_desc": { ru: "Получи награду в токенах", en: "Receive reward in tokens" },
  "landing.faq": { ru: "FAQ", en: "FAQ" },
  "landing.how_link": { ru: "Как это работает →", en: "How it works →" },
  "landing.rep_title": { ru: "Репутация в Sendler", en: "Sendler reputation" },
  "landing.rep_rank": { ru: "ранг", en: "rank" },
  "landing.rep_of": { ru: "из {total}", en: "of {total}" },
  "landing.rep_pts": { ru: "репы", en: "rep" },
  "landing.rep_neg_pts": { ru: "репы (анти)", en: "anti-rep" },
  "landing.faq1_q": { ru: "Что такое погашение NFT?", en: "What is NFT redemption?" },
  "landing.faq1_a": { ru: "Это разовое действие: открываешь свой NFT и получаешь награду в одном из NEAR-токенов экосистемы Golden Darai (HOPE, Darai, MANA, BEES и др.) — конкретный токен и сумму задаёт админ дропа.", en: "It's a one-time action: you open your NFT and receive a reward in one of the NEAR tokens of the Golden Darai ecosystem (HOPE, Darai, MANA, BEES, etc.) — the exact token and amount are set by the drop admin." },
  "landing.faq2_q": { ru: "Можно ли погасить NFT дважды?", en: "Can an NFT be redeemed twice?" },
  "landing.faq2_a": { ru: "Нет. Каждый NFT (по паре contract_id + token_id) можно погасить ровно один раз — навсегда, на любом кошельке. Если NFT передан другому, новый владелец повторно его открыть не сможет.", en: "No. Each NFT (by contract_id + token_id pair) can be redeemed exactly once — forever, on any wallet. If the NFT is transferred to someone else, the new owner can't open it again." },
  "landing.faq3_q": { ru: "Какая будет награда?", en: "What will the reward be?" },
  "landing.faq3_a": { ru: "Зависит от дропа. Админ задаёт либо фиксированную сумму, либо диапазон — тогда награда выпадает случайно в этом диапазоне. Каждый бросок независим.", en: "It depends on the drop. The admin sets either a fixed amount or a range — in which case the reward is drawn randomly within that range. Each roll is independent." },
  "landing.faq4_q": { ru: "Зачем нужна привязка Telegram?", en: "Why do I need to link Telegram?" },
  "landing.faq4_a": { ru: "Кошелёк привязывается к твоему Telegram навсегда (перекинуть его на другой TG нельзя). К одному Telegram можно привязать несколько кошельков — билеты и награды считаются по всей группе. Привязка защищает рефералку от sybil-ферм. Без неё погашение недоступно.", en: "Your wallet is linked to your Telegram forever (it can't be moved to another TG). Multiple wallets can be linked to one Telegram — tickets and rewards are counted across the whole group. Linking protects referrals from sybil farms. Without it, redemption is unavailable." },
  "landing.faq5_q": { ru: "Что такое билеты на клейм?", en: "What are claim tickets?" },
  "landing.faq5_a": { ru: "Каждому юзеру по умолчанию даётся 1 бесплатный клейм. За каждого друга, который пришёл по твоей реф-ссылке и сам сделал хотя бы один клейм, ты получаешь +1 билет. Плюс тиерные награды за факт приглашения: 1, 3, 5, 10, 20, 30, ... 100 рефералов = +1 билет на каждом пороге (до 13). Free-claim дропы не расходуют билеты.", en: "Every user gets 1 free claim by default. For each friend who joins via your referral link and makes at least one claim, you get +1 ticket. Plus tiered rewards just for inviting: 1, 3, 5, 10, 20, 30, ... 100 referrals = +1 ticket at each threshold (up to 13). Free-claim drops don't consume tickets." },
  "landing.faq6_q": { ru: "Что если я передам NFT другому?", en: "What if I transfer my NFT to someone else?" },
  "landing.faq6_a": { ru: "Если этот NFT ещё не погашен — новый владелец сможет открыть его (мы проверяем владение в момент клейма через NEAR API). Если уже погашен — никто не получит награду повторно.", en: "If the NFT hasn't been redeemed yet, the new owner can open it (we verify ownership at claim time via the NEAR API). If it's already redeemed, no one receives the reward again." },
};
