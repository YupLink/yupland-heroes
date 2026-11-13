import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: обязательный пароль кошелька (11.11.2026, walletVault).
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  "wvault.title": { ru: "Поставь пароль кошелька", en: "Set a wallet password" },
  "wvault.text": {
    ru: "Им шифруются ключи кошелька на этом устройстве.",
    en: "It encrypts the wallet keys on this device.",
  },
  "wvault.pwd": { ru: "Пароль (не меньше 8 символов)", en: "Password (8+ characters)" },
  "wvault.pwd2": { ru: "Ещё раз", en: "Repeat" },
  "wvault.submit": { ru: "Поставить пароль", en: "Set password" },
  "wvault.mismatch": { ru: "Пароли не совпадают", en: "Passwords don't match" },
  "wvault.done": { ru: "Пароль поставлен", en: "Password set" },
  "wvault.exists": {
    ru: "На этом устройстве уже есть пароль кошелька — введи его",
    en: "This device already has a wallet password — enter it",
  },
  "wvault.locked": {
    ru: "Кошелёк закрыт — введи пароль кошелька",
    en: "Wallet is locked — enter the wallet password",
  },
  "wvault.reset_kept": {
    ru: "Пароль сброшен — поставь новый",
    en: "Password reset — set a new one",
  },
  "wvault.need_setup": {
    ru: "Сначала поставь пароль кошелька в разделе «Кошелёк»",
    en: "Set a wallet password in the Wallet section first",
  },
};
