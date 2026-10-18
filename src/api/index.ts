// src/api/index.ts — централизованный barrel всех серверных функций.
// Использование: import { getSession, claimDrop, ... } from "@/api"
// НЕ РЕДАКТИРОВАТЬ вручную список функций — обновлять через скрипт
// scripts/_update_barrel.mjs или добавлять новые строки в конец.
//
// Правило: при создании новой createServerFn — добавить реэкспорт сюда.
// Документация: АРХИТЕКТУРА.md §3.4

// ── Админка: кампании ──
export { auditTicketsAndRewards } from "@/server/api/admin-audit";
export { createDropEventsBulk } from "@/server/api/admin-campaigns-bulk";
export { createComboDropEvent } from "@/server/api/admin-campaigns-combo";
export { createDropEvent } from "@/server/api/admin-campaigns-create";
export { listDropEvents, listAdminCampaignNames } from "@/server/api/admin-campaigns-list";
export {
  updateDropEvent,
  deleteDropEvent,
  setDropStatus,
  setDropRecurring,
} from "@/server/api/admin-campaigns-manage";
export {
  listCollectionTitles,
  getScanState,
  resetCollectionScan,
  scanCollection,
} from "@/server/api/admin-campaigns-scan-run";

// ── Админка: чипсы / дропы ──
export { adminListChipCollectionsForDrops, adminCreateChipDrop } from "@/server/api/admin-chips";

// ── Админка: дашборд и хелперы ──
export { getDashboard } from "@/server/api/admin-dashboard";
export { adminBroadcastMessage } from "@/server/api/admin-helpers";

// ── Админка: лайк-события ──
export {
  adminGetUniversalLikeMining,
  adminSetUniversalLikeMining,
  listLikeEvents,
  createLikeEvent,
  deleteLikeEvent,
  getLikeEventClaimers,
} from "@/server/api/admin-like-events";

// ── Админка: маркетплейс ──
export {
  getMarketplaceAlerts,
  setMarketplaceAlertsEnabled,
  runMarketplaceCheck,
  getMarketplaceFilters,
  setMarketplaceFilters,
  getMarketplaceStatsAdmin,
} from "@/server/api/admin-marketplace";

// ── Админка: ввод NFT (жалобы «отправил — не пришло») ──
export {
  adminNftInputSearch,
  adminNftInputOrphans,
  adminNftInputRecover,
} from "@/server/api/admin-nft-inputs";

// ── Админка: выплаты ──
export {
  listRewardTokens,
  setTokenMinWithdraw,
  requestAdminPayout,
} from "@/server/api/admin-payouts";

// ── Админка: погашения ──
export {
  listRedemptions,
  markRedemptionsPaid,
  unstickProcessingRedemption,
  cancelRedemption,
  exportRedemptionsCsv,
} from "@/server/api/admin-redemptions";

// ── Админка: магазин билетов ──
export {
  listTicketShopOffers,
  createTicketShopOffer,
  updateTicketShopOffer,
  deleteTicketShopOffer,
} from "@/server/api/admin-shop";

// ── Админка: статистика ──
export { getDropClaimers, getTicketEventClaimers } from "@/server/api/admin-stats";

// ── Админка: задания ──
export { listTasks, createTask, updateTask, deleteTask } from "@/server/api/admin-tasks";

// ── Админка: тикет-события ──
export { listTicketEvents, createTicketEvent, deleteTicketEvent } from "@/server/api/admin-tickets";

// ── Админка: пользователи / роли ──
export {
  adminLoginPassword,
  getServiceWallet,
  getOperatingBalances,
  adminListUserRoles,
  adminSetUserRole,
} from "@/server/api/admin-users";

// ── Аукцион ──
export {
  adminAuctionTokens,
  adminBuildAuctionListActions,
  adminAuctionRewardTokens,
  adminAuctionCatalog,
  adminBuildAuctionPlan,
  adminExtractMintedTokenIds,
  adminAuctionPenaltyBalance,
  adminBuildAuctionCreatePlan,
  adminAuctionMarketStorage,
} from "@/server/api/auction";

// ── Бета-рейд ──
export {
  adminSetBetaRaidMap,
  getBetaRaidMap,
  getBetaRaidState,
  moveBetaRaid,
  getBetaRaidTournament,
  betaRaidAttack,
  getBetaRaidEncounter,
  getBetaRaidPlayers,
  adminRestoreRaidObjects,
  adminRaidRestorePreview,
  getBuildingOffer,
  buildNextTier,
  getBetaRaidShips,
  getShipAshore,
  createShip,
  boardShip,
  leaveShip,
  revealFromTower,
  getTavernOffer,
  swapHeroInTavern,
  adminGetHeroSwapPrice,
  adminSetHeroSwapPrice,
  getAdminCell,
  adminPatchCell,
  adminPatchCells,
  adminSetObjectAlive,
  adminSetBuildingTier,
  adminPlaceShip,
  adminRemoveShip,
} from "@/server/api/beta-raid";

// ── Валютный леджер (единый баланс по токенам) ──
export { getMyCurrencyBalances } from "@/server/api/currency-ledger";

// ── Герой: основной выбор и его отряд ──
export { getMyHeroSquad, setMyHeroSquad } from "@/server/api/heroes-squad";

// ── Герой: снаряжение одной кнопкой ──
export { equipBestGear } from "@/server/api/heroes-gear-best";

// ── Тестеры: выдача энергии (раздел владельца) ──
export { adminTestersEnergy, adminGrantTesterEnergy } from "@/server/api/testers-energy";

// ── Босс ──
export {
  getActiveBoss,
  listBossLeaderboard,
  claimBossRewards,
  getMyBossRewardHistory,
  getBossTournamentHistory,
  fightBoss,
  getBossFightSession,
  startBossFight,
  bossFightRound,
  endBossFight,
  adminUpsertBoss,
  adminListBosses,
  adminListRewardTokens,
  adminResetBossHp,
  adminReleaseNextBoss,
  adminForceActivateBoss,
  adminReleaseMiniBoss,
  adminEndMiniBoss,
} from "@/server/api/boss";

// ── Чипсы: админ CRUD ──
export {
  adminCreateChipCollection,
  adminListChipCollections,
  adminUpdateChipCollection,
  adminDeleteChipCollection,
  adminCreateChipTemplate,
  adminUpdateChipTemplate,
  adminDeleteChipTemplate,
  adminCreateChipPack,
  adminListChipPacks,
  adminUpdateChipPack,
  adminDeleteChipPack,
} from "@/server/api/chips-admin";

// ── Чипсы: DARAI-баланс ──
export {
  getMyDaraiBalance,
  getDaraiDepositInfo,
  myDaraiDeposits,
  verifyDaraiDeposit,
} from "@/server/api/chips-craft-darai";

// ── Чипсы: авто-апгрейд ──
export { previewAutoUpgradeChip, autoUpgradeChip } from "@/server/api/chips-craft-upgrade";

// ── Чипсы: крафт ──
export { craftChip } from "@/server/api/chips-craft";

// ── Чипсы: фармы коллекций ──
export { getMyCollectionFarms, claimCollectionFarm } from "@/server/api/chips-farm";

// ── Чипсы: депозит NFT ──
export { depositManyAsChip } from "@/server/api/chips-mint-deposit-batch";
export { getNftInputInfo, listMyDepositableNfts } from "@/server/api/chips-mint-deposit-list";
export {
  depositNftAsPack,
  depositManyAsPack,
  adminGetPackInputConfig,
  adminSetPackInputMapEntry,
} from "@/server/api/chips-mint-deposit-pack";
export { depositNftAsChip } from "@/server/api/chips-mint-deposit";

// ── Чипсы: паки ──
export {
  buyChipPack,
  purchaseChipPackViaDarai,
  reconcileMyDaraiPacks,
} from "@/server/api/chips-pack-buy";
export {
  listChipPacksPublic,
  openChipPack,
  openChipPacks,
  myChipPackGrants,
  myChipInventory,
} from "@/server/api/chips-pack";

// ── Чипсы: энергия ──
export {
  getMyEnergy,
  spendEnergy,
  getEnergyLikeOffer,
  buyEnergyForLikes,
  adminGrantEnergy,
} from "@/server/api/chips-stake-energy";

// ── Чипсы: фарм (детали коллекций) ──
export {
  listChipCollectionsPublic,
  getTirageBonusEnabled,
  getChipCollectionDetail,
  getMyChipsForTemplate,
} from "@/server/api/chips-stake-farm";

// ── Чипсы: майнинг-слоты ──
export {
  listMiningSlots,
  unlockMiningSlot,
  setMiningSlotChip,
  clearMiningSlot,
  claimMiningRewards,
} from "@/server/api/chips-stake-mining";

// ── Чипсы: маркет / PvP ──
export {
  getMarketAccess,
  adminCreateMarketListing,
  adminCancelMarketListing,
  listMarketListings,
  listMyMarketListings,
  buyMarketListing,
  adminGetMarketStats,
  getMyChipHistory,
} from "@/server/api/chipsMarket";
export {
  getChipPvpPowerTable,
  createPvpBattle,
  cancelPvpBattle,
  listOpenPvpBattles,
  listMyPvpBattles,
  joinPvpBattle,
} from "@/server/api/chipsPvp";

// ── Коллекция: hero-баннер ──
export {
  adminGetCollectionHeroConfig,
  adminSetCollectionHeroConfig,
} from "@/server/api/collectionHero";

// ── Встроенный кошелёк ──
export {
  registerEmbeddedWallet,
  listMyEmbeddedWallets,
  removeEmbeddedWallet,
  saveWalletBackup,
  getWalletBackup,
  myWalletBalances,
  lookupAccountsByPublicKey,
  myWalletNfts,
} from "@/server/api/embedded";

// ── Паки энергии ──
export {
  adminListEnergyPacks,
  adminUpsertEnergyPack,
  adminDeleteEnergyPack,
  adminSetEnergyShopEnabled,
  adminGetEnergyShopEnabled,
  listEnergyPacksPublic,
  buyEnergyPackViaTickets,
  buyEnergyPackViaDarai,
  buyEnergyPackViaToken,
  recoverMyEnergyPurchase,
} from "@/server/api/energyPacks";
export {
  adminGetEnergyLikeOffer,
  adminSetEnergyLikeOffer,
} from "@/server/api/energy-like-offer-admin";

// ── Прихожая (Hallway) ──
export {
  getMyHallwayState,
  tapYupik,
  buyOpenChest,
  marathonClaim,
  openHallwayChest,
  releaseHallway,
  exchangeTrainingForTickets,
  myTrainingChips,
  getHallwayStarOffers,
  createHallwayChipInvoice,
  adminListHallwayLevels,
  adminUpdateHallwayLevel,
} from "@/server/api/hallway";
export { adminGetHallwayConfig, adminUpdateHallwayConfig } from "@/server/api/hallwayConfig";

// ── Айтемы ──
export {
  adminCreateItem,
  adminUpdateItem,
  adminDeleteItem,
  adminListItems,
  adminGrantItem,
  listMyItems,
} from "@/server/api/items";
export { adminGrantItemsBatch } from "@/server/api/items-grant-batch";

// ── Лайки / голосование ──
export {
  listNftCatalogForVoting,
  listMyNftsForVoting,
  getLikeSettingsPublic,
  myLikeBalance,
  listLikeCandidates,
  voteForCandidate,
  listLikeShopOffers,
  buyLikePackage,
  adminListLikeShopOffers,
  adminCreateLikeShopOffer,
  adminUpdateLikeShopOffer,
  adminDeleteLikeShopOffer,
  adminResendLikeReadyNotify,
  adminListLikeCandidates,
  adminMarkLikeCandidateDropped,
  adminGetLikeSettings,
  adminUpdateLikeSettings,
  redeemLikePromocode,
  adminCreateLikePromocode,
  adminListLikePromocodes,
  adminToggleLikePromocode,
  adminDeleteLikePromocode,
} from "@/server/api/likes";

// ── Логин-код ──
export { createLoginCode, redeemLoginCode } from "@/server/api/loginCode";

// ── Режим обслуживания ──
export { getMaintenanceStatus } from "@/server/api/maintenance";

// ── Мистические паки ──
export {
  adminCreateMysticPack,
  adminUpdateMysticPack,
  adminListMysticPacks,
  adminGrantMysticBox,
  listMyMysticPacks,
  openMysticBox,
  simulateMysticOpens,
} from "@/server/api/mystic";

// ── NFT минт (одиночный) ──
export { adminBuildNftMintActions } from "@/server/api/nftMint";

// ── Паки (legacy) ──
export {
  adminCreatePack,
  adminListPacks,
  adminTogglePack,
  adminDeletePack,
  listActivePacks,
  myPackInventory,
  openPack,
} from "@/server/api/packs";

// ── Выплаты DARAI ──
export {
  adminGetDaraiDistributionPreview,
  adminDistributeDarai,
  adminGetPayoutErrors,
  adminClearPayoutErrorFn,
} from "@/server/api/payouts";

// ── Рейд: администрирование ──
export {
  adminListRaidLocations,
  adminUpsertRaidLocation,
  adminUpsertRaidBoss,
  adminUpsertRaidNode,
  adminReorderRaidNodes,
  adminDeleteRaidNode,
  adminDeleteRaidFork,
  adminListLinkableLocations,
  adminAddForkLink,
  adminRemoveForkLink,
  adminSetForkImage,
  adminListBossTemplates,
  adminSaveBossTemplate,
} from "@/server/api/raid-admin";

// ── Рейд: шаблоны боссов (удаление со сверкой копий на карте) ──
export { adminBossTemplateUsage, adminDeleteBossTemplate } from "@/server/api/raid-boss-templates";

// ── Рейд: боевая система ──
export {
  startRaidFight,
  raidFightRound,
  endRaidFight,
  raidAutoFight,
} from "@/server/api/raid-combat";

// ── Рейд: hex-карта (только новые, не дублирующие beta-raid) ──
export {
  adminListHexMaps,
  adminLoadHexMap,
  adminSaveHexMap,
  adminDeleteHexMap,
} from "@/server/api/raid-hexmap";

// ── Рейд: лидерборд ──
export { getRaidLeaderboard, getRaidTournament } from "@/server/api/raid-leaderboard";

// ── Рейд: карта ──
export { getRaidFullMap } from "@/server/api/raid-map";

// ── Рейд: награды ──
export { claimRaidRewards, claimRaidRewardGroup } from "@/server/api/raid-rewards";
export { growHeroLevel } from "@/server/api/beta-raid/tree-levelup";
export { captureMine } from "@/server/api/beta-raid/mine-capture";
export { claimMine, claimAllMines } from "@/server/api/beta-raid/mine-claim";
export { getMyMinePendings } from "@/server/api/beta-raid/mine-pendings";
export { getSpellPillarMarks } from "@/server/api/beta-raid/spell-pillar-marks";
// Забвение: что висит на мне и постройка, которая его выдаёт за плату.
export { getMyOblivion } from "@/server/api/beta-raid/oblivion";
export { takeOblivion } from "@/server/api/beta-raid/oblivion-temple";
// Грядка: снять своего героя издалека — за DARAI (рядом снятие бесплатное).
export { recallHeroFromField } from "@/server/api/beta-raid/field-recall";

// ── Рейд: окно «Добыча» и подарки ──
export { getHarvestSummary } from "@/server/api/beta-raid/harvest-summary";
export { getMyGifts, claimGift, claimAllGifts } from "@/server/api/gifts";
export { adminGiftEnergyToActive, adminActivePlayersCount } from "@/server/api/gifts-admin";
export {
  getMarketItems,
  upsertMarketItem,
  deleteMarketItem,
} from "@/server/api/beta-raid/market-admin";
export { getMarketShop, setMarketShop } from "@/server/api/beta-raid/market-shop";
export { buyMarketItem } from "@/server/api/beta-raid/market-buy";

// ── Рейд: режим бога — генерация зоны (сервер только считает, в базу пишет кисть) ──
export { adminZoneGenerate } from "@/server/api/beta-raid/zonegen/generate-api";
export { adminZoneBuildings, adminZoneThemes } from "@/server/api/beta-raid/zonegen/catalog-api";
export { adminZoneRecipeAi } from "@/server/api/beta-raid/zonegen/ai-recipe-api";
export {
  adminTownBlueprints,
  adminSaveTownBlueprint,
  adminDeleteTownBlueprint,
} from "@/server/api/beta-raid/zonegen/blueprints-api";

// ── Рейд: навигация ──
export { getRaidLocations, chooseRaidLocation, raidSetCurrent } from "@/server/api/raid-nav";

// ── Рейд: состояние ──
export { getRaidState } from "@/server/api/raid-state";

// ── Рейд: перемещение ──
export {
  raidStepForward,
  raidStepBack,
  raidSwitchBranch,
  openRaidChest,
} from "@/server/api/raid-move";

// ── Рейд: путешествие ──
export { raidTravel } from "@/server/api/raid-travel";

// ── Пользователь: аутентификация и сессия ──
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
} from "@/server/api/user-auth";

// ── Пользователь: балансы токенов ──
export { mySisterWalletsBalances } from "@/server/api/user-balances";

// ── Пользователь: клеймы ──
export { claimAllFreeRewards } from "@/server/api/user-claim-batch";
export { myClaimHistory } from "@/server/api/user-claim-history";
export { claimNftDrop, myPendingNfts } from "@/server/api/user-claim-nft";
export { redeemDropMany } from "@/server/api/user-claim-redeem-many";
export { redeemNft } from "@/server/api/user-claim-redeem";
export { withdrawMyNfts } from "@/server/api/user-claim-withdraw-nft";

// ── Пользователь: дропы ──
export { startHallwaySession } from "@/server/api/user-drops-hallway";
export { hideCampaign, unhideCampaign, listHiddenCampaigns } from "@/server/api/user-drops-hide";
export { listAllActiveDrops } from "@/server/api/user-drops-list";
export { listMyNfts } from "@/server/api/user-drops-nft-list";
export { refreshMyInventory } from "@/server/api/user-drops-nft-refresh";

// ── Пользователь: лайк-события ──
export { claimLikeEvent, claimAllLikeEvents } from "@/server/api/user-like-events-claim";
export { listMyLikeEvents } from "@/server/api/user-like-events-list";

// ── Пользователь: поиск NFT ──
export { lookupNftClaim } from "@/server/api/user-lookup";

// ── Пользователь: выплаты ──
export { withdrawTokens } from "@/server/api/user-payouts-withdraw";
export { getPendingPayouts } from "@/server/api/user-payouts";

// ── Пользователь: рефералы ──
export { getReferralStats } from "@/server/api/user-referrals";

// ── Пользователь: магазин билетов ──
export { getMyTicketHistory } from "@/server/api/user-shop-balances";
export { getShopGlobalStats, listMyShopOffers } from "@/server/api/user-shop-offers";
export { purchaseTicketsViaToken, purchaseTicketsViaEnergy } from "@/server/api/user-shop-purchase";
export {
  adminClaimOrphanFtPurchase,
  recoverMyTicketPurchase,
} from "@/server/api/user-shop-recovery";
export {
  getYuplandStatus,
  getYuplandProfile,
  getMySubscription,
  getMyYuplandAchievements,
  unlinkYupland,
} from "@/server/api/user-shop-yupland";

// ── Пользователь: sister-кошельки ──
export {
  getMyReputation,
  listMySisterWallets,
  unlinkSisterWallet,
  switchActiveWallet,
} from "@/server/api/user-sister-wallets";

// ── Пользователь: задания ──
export { listMyTasks, verifyTaskCompletion } from "@/server/api/user-tasks";

// ── Пользователь: Telegram ──
export {
  createTgChallenge,
  linkTelegram,
  loginViaTelegramInitData,
} from "@/server/api/user-telegram";

// ── Пользователь: тикет-события ──
export { claimTicketEvent, claimAllTicketEvents } from "@/server/api/user-ticket-events-claim";
export { listMyTicketEvents } from "@/server/api/user-ticket-events-list";

// ── Пользователь: билеты ──
export { getMyTickets } from "@/server/api/user-tickets-cache";

// ── Кошелёк (admin) ──
export {
  adminListWallets,
  adminWalletAudit,
  adminWalletBalances,
  adminWalletNfts,
  adminFindNftsByTitle,
  adminFindNftsByTitles,
} from "@/server/api/wallet";

// ── DApp-подключения ──
export {
  saveWalletDappConnection,
  listMyDappConnections,
  markDappConnectionRevoked,
  touchDappConnection,
} from "@/server/api/walletConnect";

// ── Ресурсный счёт: казна и журнал (только владельцу) ──
export {
  adminTreasury,
  adminAccLedger,
  adminAccAdjust,
} from "@/server/api/currency/admin-treasury";

// ── Ресурсный счёт: пополнение и вывод ──
export {
  getAccountDepositInfo,
  getMyAccountBalances,
  verifyAccountDeposit,
} from "@/server/api/currency/deposit";
export { requestAccountWithdraw } from "@/server/api/currency/withdraw";
export { buyTicketsFromAccount } from "@/server/api/user-shop-account-pay";
export { buyEnergyPackFromAccount } from "@/server/api/energy-packs-account-pay";
export { buyChipPackFromAccount } from "@/server/api/chips-pack-account-pay";

// ── Пул карты: DARAI коллекции отдельно от DARAI под раздачу холдерам ──
export { getDaraiPools } from "@/server/api/darai-pools";
export type { DaraiPools } from "@/server/api/darai-pools";

// ── Автораздача по карте: снять отработавшие объекты и поставить новых ──
export { adminScatterPreview, adminScatterRun } from "@/server/api/beta-raid/scatter";

// ── Экономика «как на ладони»: дельты, ресурс, лента игрока, сделки, лазейки ──
export {
  adminEconDeltas,
  adminEconResource,
  adminEconFeed,
  adminEconTrades,
  adminEconLoopholes,
} from "@/server/api/beta-raid/econ";

// ── Наборы: бокс × N за цену в $ (витрина, покупка, админка) ──
export { getKitShop } from "@/server/api/kits/kit-shop";
export { buyKit } from "@/server/api/kits/kit-buy";
export {
  adminKitList,
  adminKitSave,
  adminKitSetActive,
  adminKitDelete,
} from "@/server/api/kits/kit-admin";

// ── Генератор миров: карты-черновики и бесконечные миры по логике живой карты ──
export {
  adminWorldList,
  adminWorldCreate,
  adminWorldGrow,
  adminWorldTerrains,
} from "@/server/api/beta-raid/worldgen/api";
