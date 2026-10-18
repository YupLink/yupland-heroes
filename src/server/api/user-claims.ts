// ─── Barrel: re-exports all split modules ──────────────────────────────

// Types, constants, caches
export type { SendlerLite, OwnedIndex, InventoryByContract, TicketsResult } from "./user-claims-types";
export { NFT_PRIZE_OWNER, SISTER_TTL_MS, TICKETS_TTL_MS, INVENTORY_TTL_MS, _sisterCache, _ticketsCache, nftsForOwnerCache, inventoryCache, freeNftCache } from "./user-claims-types";

// Core: tryReserveNftPrize, resolveAccountId, getSisterWallets
export { tryReserveNftPrize, resolveAccountId, getSisterWallets } from "./user-claims-core";

// Tickets: computeTickets, invalidateTicketsCache
export { computeTickets, invalidateTicketsCache } from "./user-claims-tickets";

// Inventory: requireLinkedTelegram, fetchNftsForOwnerOnChain, loadUserInventory, buildOwnedIndex, getOwnedByTitle
export { requireLinkedTelegram, fetchNftsForOwnerOnChain, loadUserInventory, buildOwnedIndex, getOwnedByTitle } from "./user-claims-inventory";

// Energy: storeAccountTickets, creditDropEnergy
export { storeAccountTickets, creditDropEnergy } from "./user-claims-energy";

// NFT claims: claimNftDrop, myPendingNfts
export { claimNftDrop, myPendingNfts } from "./user-claim-nft";

// NFT withdraw: withdrawMyNfts
export { withdrawMyNfts } from "./user-claim-withdraw-nft";

// NFT redeem: redeemNft
export { redeemNft } from "./user-claim-redeem";

// Claim history: myClaimHistory
export { myClaimHistory } from "./user-claim-history";

// Batch: claimAllFreeRewards
export { claimAllFreeRewards } from "./user-claim-batch";

// Redeem many: redeemDropMany
export { redeemDropMany } from "./user-claim-redeem-many";

// Redeem simple: processSimpleDrop
export { processSimpleDrop } from "./user-claim-redeem-simple";

// Redeem combo: processComboDrop
export { processComboDrop } from "./user-claim-redeem-combo";

// Redeem chip: processChipDrop
export { processChipDrop } from "./user-claim-redeem-chip";

// Referrals: getReferralStats
export { getReferralStats } from "./user-referrals";

// Tasks: listMyTasks, verifyTaskCompletion
export { listMyTasks, verifyTaskCompletion } from "./user-tasks";

// Payouts: lockRowsForPayment, unlockRows, resolveStuckProcessing, processPayment, withdrawTokens, getPendingPayouts
export { lockRowsForPayment, unlockRows } from "./user-payouts-lock";
export type { RowMeta, TokenGroup, SplitRow } from "./user-payouts-lock";
export { resolveStuckProcessing } from "./user-payouts-resolver";
export { processPayment } from "./user-payouts-execute";
export { withdrawTokens } from "./user-payouts-withdraw";
export { getPendingPayouts } from "./user-payouts";
