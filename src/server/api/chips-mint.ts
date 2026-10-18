// YUPLINK chips — ввод NFT (фишка/пак), майнинг, общие помощники NFT-фишек.
// Barrel file: re-exports from sub-modules. Вывод фишки в NFT удалён 17.10.2026.

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
