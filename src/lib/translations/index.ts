// src/lib/translations/index.ts
// Агрегатор всех переводов. Использование:
//   import { t, useT } from "@/lib/translations";
// НЕ импортировать субдомены напрямую в компонентах.

import type { Lang } from "../store";
import { dict as adminDict } from "./admin";
import { dict as bossDict } from "./boss";
import { dict as burnDict } from "./burn";
import { dict as storageDict } from "./storage";
import { dict as braidDict } from "./braid";
import { dict as braidBuildDict } from "./braid-build";
import { dict as braidCastleDict } from "./braid-castle";
import { dict as braidMineDict } from "./braid-mine";
import { dict as braidMineV2ErrDict } from "./braid-mine-v2-err";
import { dict as townHallDict } from "./townhall";
import { dict as castleLayoutDict } from "./castle-layout";
import { dict as newspaperDict } from "./newspaper";
import { dict as braidMineV2Dict } from "./braid-mine-v2";
import { dict as braidMineLevelDict } from "./braid-mine-level";
import { dict as braidFieldDict } from "./braid-field";
import { dict as braidShipDict } from "./braid-ship";
import { dict as braidPortalDict } from "./braid-portal";
import { dict as braidPotionDict } from "./braid-potion";
import { dict as braidTagsDict } from "./braid-tags";
import { dict as braidDecorDict } from "./braid-decor";
import { dict as braidToolDict } from "./braid-tool";
import { dict as braidSpellPillarDict } from "./braid-spell-pillar";
import { dict as braidMarketDict } from "./braid-market";
import { dict as braidPawnHeroDict } from "./braid-pawn-hero";
import { dict as marketRecipeDict } from "./market-recipe";
import { dict as braidSpellDict } from "./braid-spell";
import { dict as braidHarvestDict } from "./braid-harvest";
import { dict as braidChestDict } from "./braid-chest";
import { dict as braidBagDict } from "./braid-bag";
import { dict as braidPchestDict } from "./braid-pchest";
import { dict as braidMinePlaceDict } from "./braid-mineplace";
import { dict as braidDmineDict } from "./braid-dmine";
import { dict as mineLostDict } from "./mine-lost";
import { dict as mineOfficeDict } from "./mine-office";
import { dict as weatherStationDict } from "./weather-station";
import { dict as shamanHutDict } from "./shaman-hut";
import { dict as braidTreeDict } from "./braid-tree";
import { dict as dynamiteDict } from "./dynamite";
import { dict as landDict } from "./land";
import { dict as veinDict } from "./vein";
import { dict as bsaleDict } from "./bsale";
import { dict as mountDict } from "./mount";
import { dict as promoDict } from "./promo";
import { dict as braidBoostFxDict } from "./braid-boost-fx";
import { dict as braidOblivionDict } from "./braid-oblivion";
import { dict as braidSightDict } from "./braid-sight";
import { dict as artGenDict } from "./art-gen";
import { dict as enchantShopDict } from "./enchant-shop";
import { dict as enchantErrorsDict } from "./enchant-errors";
import { dict as heroRiteDict } from "./hero-rite";
import { dict as braidStripDict } from "./braid-strip";
import { dict as braidHeroSkillDict } from "./braid-hero-skill";
import { dict as braidFishDict } from "./braid-fish";
import { dict as braidFightDict } from "./braid-fight";
import { dict as botDict } from "./bot";
import { dict as chipsDict } from "./chips";
import { dict as chipsNftDict } from "./chips-nft";
import { dict as chipsUpgradeDict } from "./chips-upgrade";
import { dict as commonDict } from "./common";
import { dict as dropsDict } from "./drops";
import { dict as drops2Dict } from "./drops2";
import { dict as econDict } from "./econ";
import { dict as econChainDict } from "./econ-chain";
import { dict as treasureDict } from "./treasure";
import { dict as pnameDict } from "./pname";
import { dict as energyDict } from "./energy";
import { dict as esubDict } from "./esub";
import { dict as godMoveDict } from "./god-move";
import { dict as googleDict } from "./google";
import { dict as walletLoginDict } from "./wallet-login";
import { dict as entryDict } from "./entry";
import { dict as debtDict } from "./debt";
import { dict as passportDict } from "./passport";
import { dict as hallwayDict } from "./hallway";
import { dict as heroMarketDict } from "./hero-market";
import { dict as islandDict } from "./island";
import { dict as islandGuideDict } from "./island-guide";
import { dict as creatorDict } from "./creator";
import { dict as gameStartDict } from "./game-start";
import { dict as achievementsDict } from "./achievements";
import { dict as artRepairDict } from "./art-repair";
import { dict as artBrokenDict } from "./art-broken";
import { dict as kitsDict } from "./kits";
import { dict as labDict } from "./lab";
import { dict as goldShopDict } from "./goldShop";
import { dict as landingDict } from "./landing";
import { dict as lettersDict } from "./letters";
import { dict as likesDict } from "./likes";
import { dict as lookupDict } from "./lookup";
import { dict as marketDict } from "./market";
import { dict as navDict } from "./nav";
import { dict as pvpDict } from "./pvp";
import { dict as raidDict } from "./raid";
import { dict as referralsDict } from "./referrals";
import { dict as shopDict } from "./shop";
import { dict as slotDict } from "./slot";
import { dict as buckwheatDict } from "./buckwheat";
import { dict as townDict } from "./town";
import { dict as mediaArchiveDict } from "./media-archive";
import { dict as paramsGuideDict } from "./params-guide";
import { dict as tournamentAdminDict } from "./tournament-admin";
import { dict as tournamentDict } from "./tournament";
import { dict as tournamentRulesDict } from "./tournament-rules";
import { dict as walletDict } from "./wallet";
import { dict as walletVaultDict } from "./wallet-vault";
import { dict as worldMapDict } from "./world-map";
import { dict as portalCheckDict } from "./portal-check";
import { dict as worldgenDict } from "./worldgen";
import { dict as zonegenDict } from "./zonegen";
import { dict as zonegenTownDict } from "./zonegen-town";
import { dict as zonegenOrganicDict } from "./zonegen-organic";

export const dict: Record<string, Record<Lang, string>> = {
  ...adminDict,
  ...bossDict,
  ...burnDict,
  ...storageDict,
  ...braidDict,
  ...braidBuildDict,
  ...braidCastleDict,
  ...braidMineDict,
  ...braidMineV2ErrDict,
  ...townHallDict,
  ...castleLayoutDict,
  ...newspaperDict,
  ...braidMineV2Dict,
  ...braidMineLevelDict,
  ...braidFieldDict,
  ...braidShipDict,
  ...braidPortalDict,
  ...braidPotionDict,
  ...braidTagsDict,
  ...braidDecorDict,
  ...braidToolDict,
  ...braidSpellPillarDict,
  ...braidMarketDict,
  ...braidPawnHeroDict,
  ...marketRecipeDict,
  ...braidSpellDict,
  ...braidHarvestDict,
  ...braidChestDict,
  ...braidBagDict,
  ...braidPchestDict,
  ...braidMinePlaceDict,
  ...braidDmineDict,
  ...mineLostDict,
  ...mineOfficeDict,
  ...weatherStationDict,
  ...shamanHutDict,
  ...braidTreeDict,
  ...dynamiteDict,
  ...landDict,
  ...veinDict,
  ...bsaleDict,
  ...mountDict,
  ...promoDict,
  ...braidBoostFxDict,
  ...braidOblivionDict,
  ...braidSightDict,
  ...artGenDict,
  ...enchantShopDict,
  ...enchantErrorsDict,
  ...heroRiteDict,
  ...braidStripDict,
  ...braidHeroSkillDict,
  ...braidFishDict,
  ...braidFightDict,
  ...botDict,
  ...chipsDict,
  ...chipsNftDict,
  ...chipsUpgradeDict,
  ...commonDict,
  ...dropsDict,
  ...drops2Dict,
  ...econDict,
  ...econChainDict,
  ...treasureDict,
  ...pnameDict,
  ...energyDict,
  ...esubDict,
  ...godMoveDict,
  ...googleDict,
  ...walletLoginDict,
  ...entryDict,
  ...debtDict,
  ...passportDict,
  ...hallwayDict,
  ...heroMarketDict,
  ...islandDict,
  ...islandGuideDict,
  ...creatorDict,
  ...gameStartDict,
  ...achievementsDict,
  ...artRepairDict,
  ...artBrokenDict,
  ...kitsDict,
  ...labDict,
  ...goldShopDict,
  ...landingDict,
  ...lettersDict,
  ...likesDict,
  ...lookupDict,
  ...marketDict,
  ...navDict,
  ...pvpDict,
  ...raidDict,
  ...referralsDict,
  ...shopDict,
  ...slotDict,
  ...buckwheatDict,
  ...townDict,
  ...mediaArchiveDict,
  ...paramsGuideDict,
  ...tournamentAdminDict,
  ...tournamentDict,
  ...tournamentRulesDict,
  ...walletDict,
  ...walletVaultDict,
  ...worldMapDict,
  ...portalCheckDict,
  ...worldgenDict,
  ...zonegenDict,
  ...zonegenTownDict,
  ...zonegenOrganicDict,
};

/**
 * Функция перевода. Заменяет {placeholder} по params.
 * Fallback: en → key.
 */
export function t(key: string, lang: Lang, params?: Record<string, string | number>): string {
  const entry = dict[key];
  let str = entry?.[lang] ?? entry?.en ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
