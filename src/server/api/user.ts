// user.ts — агрегатор.
// Все функции живут в субмодулях. Этот файл только реэкспортирует их для
// обратной совместимости. НЕ РЕДАКТИРОВАТЬ напрямую — вносить изменения
// в соответствующий субмодуль.
// Структура субмодулей: см. АРХИТЕКТУРА.md и МОДУЛИ.md

// Аутентификация и сессия
export {
  getSession,
  getFairplayBonus,
  ackFairplayBonus,
  connectWallet,
  createLoginChallenge,
  connectWalletSigned,
  prepareAddWallet,
  disconnectWallet,
  setMyLang,
  setNotificationsEnabled,
} from "./user-auth";

// Балансы кошельков (FT + NEAR по всем sister-кошелькам)
export { mySisterWalletsBalances } from "./user-balances";

// Клейм наград — батч
export { claimAllFreeRewards } from "./user-claim-batch";

// История клеймов
export { myClaimHistory } from "./user-claim-history";

// NFT-клейм и pending
export { claimNftDrop, myPendingNfts } from "./user-claim-nft";

// Батч-погашение дропов
export { redeemDropMany } from "./user-claim-redeem-many";

// Погашение (redeem) NFT
export { redeemNft } from "./user-claim-redeem";

// Вывод NFT на кошелёк
export { withdrawMyNfts } from "./user-claim-withdraw-nft";

// Ядро: resolveAccountId, getSisterWallets
export { resolveAccountId, getSisterWallets } from "./user-claims-core";

// Кэш и расчёт билетов
export { invalidateTicketsCache, computeTickets } from "./user-claims-tickets";

// Прихожая (hallway) — вход через Telegram Mini App
export { startHallwaySession } from "./user-drops-hallway";

// Скрытие/показ кампаний
export { hideCampaign, unhideCampaign, listHiddenCampaigns } from "./user-drops-hide";

// Список активных дропов
export { listAllActiveDrops } from "./user-drops-list";

// Список NFT пользователя
export { listMyNfts } from "./user-drops-nft-list";

// Принудительное обновление инвентаря
export { refreshMyInventory } from "./user-drops-nft-refresh";

// Like-events: клейм
export { claimLikeEvent, claimAllLikeEvents } from "./user-like-events-claim";

// Like-events: список
export { listMyLikeEvents } from "./user-like-events-list";

// Публичный поиск NFT по token_id
export { lookupNftClaim } from "./user-lookup";

// Выплаты: вывод токенов
export { withdrawTokens } from "./user-payouts-withdraw";

// Выплаты: pending-баланс
export { getPendingPayouts } from "./user-payouts";

// Рефералы
export { getReferralStats } from "./user-referrals";

// Общие хелперы: invalidateSisterCache, getAccountId
export { invalidateSisterCache, getAccountId, accountOf, accountIdOf } from "./user-shared";

// Магазин: история билетов
export { getMyTicketHistory } from "./user-shop-balances";

// Магазин: офферы
export { getShopGlobalStats, listMyShopOffers } from "./user-shop-offers";

// Магазин: покупка билетов
export { purchaseTicketsViaToken, purchaseTicketsViaEnergy } from "./user-shop-purchase";

// Магазин: восстановление покупок
export {
  adminClaimOrphanFtPurchase,
  recoverMyTicketPurchase,
} from "./user-shop-recovery";

// Подписка Yupland
export {
  subscriptionDiscountPct,
  fetchSubscriptionDiscount,
} from "./user-shop-subscription";

// Yupland-портал: статус, профиль, подписка, ачивки
export {
  getYuplandStatus,
  getYuplandProfile,
  getMySubscription,
  getMyYuplandAchievements,
  unlinkYupland,
} from "./user-shop-yupland";

// Sister-кошельки
export {
  getMyReputation,
  listMySisterWallets,
  unlinkSisterWallet,
  switchActiveWallet,
} from "./user-sister-wallets";

// Задания
export { listMyTasks, verifyTaskCompletion } from "./user-tasks";

// Telegram: привязка, вход
export {
  createTgChallenge,
  linkTelegram,
  loginViaTelegramInitData,
} from "./user-telegram";

// Ticket-events: клейм
export { claimTicketEvent, claimAllTicketEvents } from "./user-ticket-events-claim";

// Ticket-events: список
export { listMyTicketEvents } from "./user-ticket-events-list";

// Билеты: баланс
export { getMyTickets } from "./user-tickets-cache";
