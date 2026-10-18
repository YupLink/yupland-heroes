// chips.ts — barrel file: re-exports everything from all chip modules.
// Original 6574-line file split into functional modules.

// ── Admin CRUD (collections, templates, packs) ──
export {
  adminCreateChipCollection,
  adminListChipCollections,
  adminUpdateChipCollection,
  adminDeleteChipCollection,
  adminCreateChipTemplate,
  adminUpdateChipTemplate,
  adminDeleteChipTemplate,
  dropTableItemSchema,
  dropTableSchema,
  adminCreateChipPack,
  adminListChipPacks,
  adminUpdateChipPack,
  adminDeleteChipPack,
} from "./chips-admin";

// ── Pack operations (buy, open, reconcile, inventory) ──
export {
  listChipPacksPublic,
  openChipPack,
  openChipPacks,
  myChipPackGrants,
  myChipInventory,
} from "./chips-pack";

export {
  buyChipPack,
  purchaseChipPackViaDarai,
  reconcileMyDaraiPacks,
} from "./chips-pack-buy";

// ── Craft & DARAI balance ──
export {
  CRAFT_RULES,
  craftChip,
  lvlEq,
  acquireChip,
  countShortfall,
  previewAutoUpgradeChip,
  autoUpgradeChip,
} from "./chips-craft";

export {
  computeDaraiBalance,
  getMyDaraiBalance,
  getDaraiDepositInfo,
  myDaraiDeposits,
  verifyDaraiDeposit,
  DARAI_MIN_DEPOSIT_HUMAN,
} from "./chips-craft-darai";

// ── Energy ──
export {
  getMyEnergy,
  spendEnergy,
  getEnergyLikeOffer,
  buyEnergyForLikes,
  adminGrantEnergy,
} from "./chips-stake-energy";

// ── Mining slots ──
export {
  listMiningSlots,
  unlockMiningSlot,
  setMiningSlotChip,
  clearMiningSlot,
  claimMiningRewards,
} from "./chips-stake-mining";

// ── Collection farms & detail ──
export {
  listChipCollectionsPublic,
  getTirageBonusEnabled,
  getChipCollectionDetail,
  getMyChipsForTemplate,
} from "./chips-stake-farm";

export {
  getMyCollectionFarms,
  claimCollectionFarm,
} from "./chips-farm";

// ── NFT input (deposit, pack input), mining, NFT-chip helpers ──
export {
  requireAdmin,
  requireWallet,
  levelKey,
  DARAI_FT_CONTRACT,
  STORE_NFT_CONTRACT,
  CHIP_MINT_RECIPIENT,
  ALL_CHIP_LEVELS,
  buildChipNftTitle,
  getMintMap,
  getMintSpend,
} from "./chips-mint-helpers";

export type { MintMapEntry } from "./chips-mint-helpers";

export {
  getMiningState,
  saveMiningState,
  settleMiningSlots,
} from "./chips-mint-helpers-mining";

export type { MiningState } from "./chips-mint-helpers-mining";

export { listChipDropEligibleTitles } from "./chips-mint-admin";

export {
  getMintReverseMap,
  getPackInputMap,
  savePackInputMap,
  packInputKey,
  stripLeadCount,
  getPackInputReverseMap,
  claimNftInputTx,
  fetchOnchainNftTitle,
} from "./chips-mint-deposit-helpers";

export { checkNftInputTx, settleUnconfirmed } from "./chips-mint-deposit-verify";

export {
  getNftInputInfo,
  listMyDepositableNfts,
  runNftInputOrphanReconcile,
} from "./chips-mint-deposit-list";

export type { DepositableNftItem } from "./chips-mint-deposit-list";

export {
  depositNftAsChip,
} from "./chips-mint-deposit";

export {
  depositManyAsChip,
} from "./chips-mint-deposit-batch";

export {
  depositNftAsPack,
  depositManyAsPack,
  adminGetPackInputConfig,
  adminSetPackInputMapEntry,
} from "./chips-mint-deposit-pack";
