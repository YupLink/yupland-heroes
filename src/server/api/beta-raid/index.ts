// Barrel — все экспорты beta-raid
export { getBetaRaidMap, adminSetBetaRaidMap } from "./map";
export { getBetaRaidState, moveBetaRaid, moveBetaRaidSteps } from "./move";
export { getAvailableMoves } from "./availableMoves";
export { getBetaRaidTournament } from "./tournament";
export { getBetaRaidPlayers } from "./players";
export { adminRestoreRaidObjects, adminRaidRestorePreview } from "./admin-restore";
export { getBuildingOffer, buildNextTier } from "./building-action";
// Корабли: верфь спускает, любой игрок занимает свободный.
export { getBetaRaidShips, getShipAshore, createShip, boardShip, leaveShip } from "./ship-action";
// Живая правка карты админом: смотрим клетку и меняем её по одному слою.
export { getAdminCell } from "./admin-live-read";
export { adminPatchCells } from "./admin-live-batch";
export { adminPatchCell, adminSetObjectAlive, adminSetBuildingTier } from "./admin-live-edit";
// Судно на клетке живёт в своей таблице — и правится своим модулем.
export { adminPlaceShip, adminRemoveShip } from "./admin-live-ship";
// Таверна: смена основного героя за лайки (цена — настройка админа).
export { getTavernOffer, swapHeroInTavern } from "./tavern";
export { adminGetHeroSwapPrice, adminSetHeroSwapPrice } from "./tavern-admin";
// Обзорная вышка: разведка округи за энергию.
export { revealFromTower } from "./tower-reveal";
// Единый энкаунтер: босс/сундук/шахта — один путь, одно окно.
export { betaRaidAttack } from "./encounter-attack";
export { getBetaRaidEncounter } from "./encounter-peek";
export { getEncounterTop } from "./encounter-top";
// Погода карты: вид, температура, смена слота, коэффициенты (остров — null).
export { getRaidWeather } from "./weather/weather-get";
// Лавка зачарования: заклинания на артефакты (lib/enchant, ПРАВИЛА — слова владельца 28.10).
export {
  getEnchantShop,
  listEnchantArtifacts,
  listEnchantCostOptions,
  saveEnchantSpells,
  enchantArtifact,
} from "./enchant/enchant-api";
// Зачарование героев: обряды «N героев → один следующей редкости» (lib/enchant/heroRite).
export { getHeroRiteShop, listRiteHeroes, saveHeroRites, runHeroRite } from "./hero-rite/rite-api";
