import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: сжигание NFT (/burn)
export const dict: Record<string, Entry> = {
  "burn.title": { ru: "Сжечь NFT", en: "Burn NFTs" },
  "burn.connect": { ru: "Подключить кошелёк", en: "Connect wallet" },
  "burn.search": { ru: "Поиск · {n} NFT", en: "Search · {n} NFTs" },
  "burn.empty": { ru: "NFT нет", en: "No NFTs" },
  "burn.max": { ru: "Все", en: "All" },
  "burn.clear": { ru: "Сбросить", en: "Clear" },
  "burn.burn_btn": { ru: "Сжечь {n}", en: "Burn {n}" },
  "burn.confirm_title": { ru: "Сжечь {n} NFT?", en: "Burn {n} NFTs?" },
  "burn.confirm_text": { ru: "Это навсегда.", en: "This is permanent." },
  "burn.confirm_btn": { ru: "Сжечь", en: "Burn" },
  "burn.cancel": { ru: "Отмена", en: "Cancel" },
  "burn.pin": { ru: "PIN кошелька", en: "Wallet PIN" },
  "burn.app_pwd": { ru: "Пароль кошелька", en: "Wallet password" },
  "burn.signing": { ru: "Подтверди в кошельке", en: "Confirm in your wallet" },
  "burn.cancelled": { ru: "Подпись отменена", en: "Signing cancelled" },
  "burn.done": { ru: "Сожжено: {n}", en: "Burned: {n}" },
  "burn.partial": { ru: "Сожжено {ok} из {n}", en: "Burned {ok} of {n}" },
  "burn.retry": { ru: "Обновить", en: "Refresh" },
  "burn.err_auth": { ru: "Войди в YupLink", en: "Sign in to YupLink" },
  "burn.err_owner": { ru: "Неверный кошелёк", en: "Invalid wallet" },
  "burn.err_load": {
    ru: "Блокчейн не ответил — обнови",
    en: "Blockchain did not respond — refresh",
  },
  "burn.err_wallet_changed": {
    ru: "В кошельке подключён другой аккаунт",
    en: "Another account is connected in the wallet",
  },
  "burn.err_not_connected": {
    ru: "Кошелёк отключился — подключи его в YupLink",
    en: "Wallet disconnected — connect it in YupLink",
  },
};
