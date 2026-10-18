// energyPacks.ts — barrel: раздача энергии за билеты/DARAI/токены.
// Реализация разнесена по модулям (§13.1, ≤250 строк на файл):
//   energy-packs-shared — константы и гейты
//   energy-packs-admin  — админский CRUD
//   energy-packs-public — витрина игрока
//   energy-packs-buy    — сами покупки
//   energy-packs-steps  — лестница цен (каждая покупка за день дороже)
export {
  adminListEnergyPacks,
  adminUpsertEnergyPack,
  adminDeleteEnergyPack,
  adminSetEnergyShopEnabled,
  adminGetEnergyShopEnabled,
  adminResetEnergyDailyLimits,
} from "./energy-packs-admin";
export { listEnergyPacksPublic } from "./energy-packs-public";
export { buyEnergyPackViaTickets, buyEnergyPackViaDarai } from "./energy-packs-buy";
export { recoverMyEnergyPurchase } from "./energy-packs-recover";
export { buyEnergyPackViaToken } from "./energy-packs-buy-token";
