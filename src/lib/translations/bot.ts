import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: тексты Telegram-бота (api.tg-webhook)
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {

  // ── восстановлено после декомпозиции (потерялись при разбиении) ──
  "bot.link_expired": {
    ru: "Срок ссылки истёк. Создай новую на сайте.",
    en: "The link has expired. Create a new one on the site.",
  },
  "bot.link_failed": {
    ru: "Не удалось привязать. Попробуй ещё раз.",
    en: "Linking failed. Please try again.",
  },
  "bot.link_invalid": {
    ru: "Эта ссылка недействительна. Создай новую на сайте.",
    en: "This link is invalid. Create a new one on the site.",
  },
  "bot.link_used": {
    ru: "Эта ссылка уже использована.",
    en: "This link has already been used.",
  },
  "bot.linked_ok": {
    ru: "✅ Telegram привязан к кошельку <code>{wallet}</code>. Возвращайся на сайт — теперь можно погашать NFT.",
    en: "✅ Telegram linked to wallet <code>{wallet}</code>. Go back to the site — you can now redeem NFTs.",
  },
  "bot.open_app": {
    ru: "Открыть приложение:",
    en: "Open the app:",
  },
  "bot.wallet_already_yours": {
    ru: "Этот кошелёк <code>{wallet}</code> уже привязан к твоему Telegram. Можно вернуться на сайт.",
    en: "This wallet <code>{wallet}</code> is already linked to your Telegram. You can go back to the site.",
  },
  "bot.wallet_detached": {
    ru: "Этот кошелёк был отвязан от Telegram. Повторная привязка невозможна.",
    en: "This wallet was unlinked from Telegram. Re-linking is not possible.",
  },
  "bot.wallet_other_tg": {
    ru: "К этому кошельку уже привязан другой Telegram. Привязка постоянная.",
    en: "This wallet is already linked to another Telegram. The link is permanent.",
  },
  "bot.welcome": {
    ru: "Привет! Это <b>YupLink</b>.\n\nПодключи NEAR-кошелёк и погашай свои NFT за бонус-токены или собирай комбо для билетов.\n\nОткрой приложение кнопкой ниже или иконкой меню рядом с полем ввода 👇",
    en: "Hi! This is <b>YupLink</b>.\n\nConnect a NEAR wallet and redeem your NFTs for bonus tokens, or collect combos for tickets.\n\nOpen the app with the button below or the menu icon next to the input field 👇",
  },
  "bot.welcome_ref": {
    ru: "Привет! Это <b>YupLink</b>.\n\nТы пришёл по приглашению друга. Открой приложение — после подключения кошелька и привязки Telegram твой друг получит +1 билет за тебя (тиерная система).\n\nЖми кнопку ниже 👇",
    en: "Hi! This is <b>YupLink</b>.\n\nYou came via a friend's invite. Open the app — once you connect a wallet and link Telegram, your friend gets +1 ticket for you (tiered system).\n\nTap the button below 👇",
  },

  // ── Начисление предметов игроку (пакетная выдача из админки) ──
  "bot.grant_artifact_title": {
    ru: "🎁 Тебе начислен артефакт",
    en: "🎁 You received an artifact",
  },
  "bot.grant_hero_title": {
    ru: "🎁 Тебе начислен герой",
    en: "🎁 You received a hero",
  },
  "bot.grant_item_title": {
    ru: "🎁 Тебе начислен предмет",
    en: "🎁 You received an item",
  },
  // Про 48 часов — и здесь: это то же письмо о подарке в player_gift, только
  // для предмета или героя из пакетной выдачи, и срок у него тот же.
  "bot.grant_footer": {
    ru: "Подарок ждёт на карте 48 часов, потом сгорает — жми кружок с подарком 👇",
    en: "The gift waits on the map for 48 hours, then expires — tap the gift button 👇",
  },

  // ── Подарок ждёт в игре (кружок под мини-картой) ──
  "bot.gift_title": {
    ru: "🎁 Тебе пришёл подарок",
    en: "🎁 A gift is waiting for you",
  },
  // Письмо короткое намеренно: что именно дали, игрок увидит в самом окне
  // подарка. Перечислять содержимое в боте — лишний шум.
  "bot.gift_footer": {
    ru: "Зайди на карту и забери 👇 Подарок ждёт 48 часов, потом сгорает",
    en: "Open the map and claim it 👇 The gift waits 48 hours, then expires",
  },
};
