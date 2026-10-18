import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Навигация
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── header / nav ──────────
  "nav.home": { ru: "Главная", en: "Home" },
  "nav.my_nfts": { ru: "Мои NFT", en: "My NFTs" },
  "nav.referrals": { ru: "Рефералы", en: "Referrals" },
  "nav.more": { ru: "Ещё", en: "More" },
  "nav.search": { ru: "Поиск", en: "Search" },
  "nav.admin": { ru: "Админ", en: "Admin" },
  "nav.yuplink_wallet": { ru: "YupLink Wallet", en: "YupLink Wallet" },
  "nav.chips": { ru: "Фишки", en: "Chips" },
  "nav.hallway": { ru: "Прихожая", en: "Hallway" },
  "nav.mint": { ru: "Минт", en: "Mint" },
  "nav.auction": { ru: "Аукцион", en: "Auction" },
  "nav.combo_duplo": { ru: "Комбо дупла", en: "Duplo Combo" },
  "header.disconnect": { ru: "Отключить", en: "Disconnect" },
  "header.copy_address": { ru: "Скопировать адрес", en: "Copy address" },
  "header.copied": { ru: "Скопировано", en: "Copied" },
  "header.address_label": { ru: "NEAR-кошелёк", en: "NEAR wallet" },
  "header.telegram_label": { ru: "Telegram", en: "Telegram" },
  "header.telegram_linked": { ru: "привязан", en: "linked" },
  "header.telegram_not_linked": { ru: "Не привязан", en: "Not linked" },
  "header.add_wallet": { ru: "Добавить кошелёк", en: "Add wallet" },
  "header.notifications": { ru: "Уведомления", en: "Notifications" },
  "header.notif_on": { ru: "вкл", en: "on" },
  "header.notif_off": { ru: "выкл", en: "off" },
  "header.language": { ru: "Язык", en: "Language" },
  // Выключатель информационных тостов игры (gameInfoToast).
  "header.game_notifs": { ru: "Уведомления в игре", en: "In-game notifications" },

  // ── восстановлено после декомпозиции (потерялись при разбиении) ──
  "header.connect_wallet": {
    ru: "Подключить кошелёк",
    en: "Connect wallet",
  },
  "header.wallets_label": {
    ru: "Кошельки ({n})",
    en: "Wallets ({n})",
  },
};
