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
import { dict as braidFieldDict } from "./braid-field";
import { dict as braidShipDict } from "./braid-ship";
import { dict as braidPortalDict } from "./braid-portal";
import { dict as braidPotionDict } from "./braid-potion";
import { dict as braidTagsDict } from "./braid-tags";
import { dict as braidDecorDict } from "./braid-decor";
import { dict as braidToolDict } from "./braid-tool";
import { dict as braidSpellPillarDict } from "./braid-spell-pillar";
import { dict as braidMarketDict } from "./braid-market";
import { dict as braidSpellDict } from "./braid-spell";
import { dict as braidHarvestDict } from "./braid-harvest";
import { dict as braidChestDict } from "./braid-chest";
import { dict as braidBagDict } from "./braid-bag";
import { dict as braidPchestDict } from "./braid-pchest";
import { dict as braidBoostFxDict } from "./braid-boost-fx";
import { dict as braidOblivionDict } from "./braid-oblivion";
import { dict as braidHeroSkillDict } from "./braid-hero-skill";
import { dict as braidFishDict } from "./braid-fish";
import { dict as botDict } from "./bot";
import { dict as chipsDict } from "./chips";
import { dict as chipsNftDict } from "./chips-nft";
import { dict as chipsUpgradeDict } from "./chips-upgrade";
import { dict as commonDict } from "./common";
import { dict as dropsDict } from "./drops";
import { dict as drops2Dict } from "./drops2";
import { dict as econDict } from "./econ";
import { dict as energyDict } from "./energy";
import { dict as esubDict } from "./esub";
import { dict as godMoveDict } from "./god-move";
import { dict as hallwayDict } from "./hallway";
import { dict as islandDict } from "./island";
import { dict as islandGuideDict } from "./island-guide";
import { dict as achievementsDict } from "./achievements";
import { dict as kitsDict } from "./kits";
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
import { dict as townDict } from "./town";
import { dict as mediaArchiveDict } from "./media-archive";
import { dict as paramsGuideDict } from "./params-guide";
import { dict as tournamentAdminDict } from "./tournament-admin";
import { dict as tournamentDict } from "./tournament";
import { dict as tournamentRulesDict } from "./tournament-rules";
import { dict as walletDict } from "./wallet";
import { dict as worldMapDict } from "./world-map";
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
  ...braidFieldDict,
  ...braidShipDict,
  ...braidPortalDict,
  ...braidPotionDict,
  ...braidTagsDict,
  ...braidDecorDict,
  ...braidToolDict,
  ...braidSpellPillarDict,
  ...braidMarketDict,
  ...braidSpellDict,
  ...braidHarvestDict,
  ...braidChestDict,
  ...braidBagDict,
  ...braidPchestDict,
  ...braidBoostFxDict,
  ...braidOblivionDict,
  ...braidHeroSkillDict,
  ...braidFishDict,
  ...botDict,
  ...chipsDict,
  ...chipsNftDict,
  ...chipsUpgradeDict,
  ...commonDict,
  ...dropsDict,
  ...drops2Dict,
  ...econDict,
  ...energyDict,
  ...esubDict,
  ...godMoveDict,
  ...hallwayDict,
  ...islandDict,
  ...islandGuideDict,
  ...achievementsDict,
  ...kitsDict,
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
  ...townDict,
  ...mediaArchiveDict,
  ...paramsGuideDict,
  ...tournamentAdminDict,
  ...tournamentDict,
  ...tournamentRulesDict,
  ...walletDict,
  ...worldMapDict,
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
