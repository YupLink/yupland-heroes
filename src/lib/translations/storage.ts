import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: вывод излишка хранилища NFT-контрактов (/storage)
export const dict: Record<string, Entry> = {
  "storage.title": { ru: "Хранилище NFT", en: "NFT storage" },
  "storage.connect": { ru: "Подключить кошелёк", en: "Connect wallet" },
  "storage.disconnect": { ru: "Отключить", en: "Disconnect" },
  "storage.retry": { ru: "Обновить", en: "Refresh" },
  "storage.empty": {
    ru: "У этого кошелька нет контрактов, из которых можно вернуть NEAR",
    en: "This wallet has no contracts to reclaim NEAR from",
  },
  "storage.role_owner": { ru: "Владелец", en: "Owner" },
  "storage.role_minter": { ru: "Минтер · владелец {owner}", en: "Minter · owner {owner}" },
  "storage.balance": { ru: "Баланс", en: "Balance" },
  "storage.used": { ru: "Занято хранилищем", en: "Locked for storage" },
  "storage.claim_btn": { ru: "Забрать", en: "Claim" },
  "storage.signing": { ru: "Подтверди в кошельке", en: "Confirm in your wallet" },
  "storage.cancelled": { ru: "Подпись отменена", en: "Signing cancelled" },
  "storage.done": { ru: "Забрано {n} NEAR", en: "Claimed {n} NEAR" },
  "storage.pin": { ru: "PIN кошелька", en: "Wallet PIN" },
  "storage.app_pwd": { ru: "Пароль кошелька", en: "Wallet password" },
  "storage.err_load": {
    ru: "Блокчейн не ответил — обнови",
    en: "Blockchain did not respond — refresh",
  },
  "storage.err_wallets": {
    ru: "Список кошельков не загрузился — обнови",
    en: "Wallet list failed to load — refresh",
  },
  "storage.err_not_connected": { ru: "Кошелёк не подключён", en: "Wallet is not connected" },
  "storage.err_wallet_changed": {
    ru: "В кошельке выбран другой аккаунт — обнови",
    en: "Another account is selected in the wallet — refresh",
  },
  "storage.err_failed": { ru: "Транзакция не прошла", en: "Transaction failed" },
  "storage.err_nothing": { ru: "Забирать нечего", en: "Nothing to claim" },
};
