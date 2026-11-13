// «Хижина шаманов» на площади замка (владелец, 28.10.2026): стоит у построивших.
// Облик — shamanHutBuildingAssets (пока временный). Место — справа, под
// «Метеостанцией» и правее Казино, не дальше её края: основания не задеты
// (modularShamanHut.test, modularPlacement).
import {shamanHutBuildingAssets} from './shamanHutBuildingAssets';
import {building} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';

export const SHAMAN_HUT_BUILDING_ID='shaman_hut';
const look=shamanHutBuildingAssets.base;
export const SHAMAN_HUT_LOOK=look.image;
export const SHAMAN_HUT_X=950,SHAMAN_HUT_Y=1110;

/** Здание для сцены замка; null — не построено. */
export function shamanHutBuilding(built:boolean):SceneBuilding|null{
 if(!built)return null;
 const b=building(SHAMAN_HUT_BUILDING_ID,'Хижина шаманов',look.image,SHAMAN_HUT_X,SHAMAN_HUT_Y,190,.42,['Хижина','шаманов']);
 return {...b,shadow:look.shadow,shadowFlipped:look.shadowFlipped,anchor:look.anchor??b.anchor,silhouette:look.silhouette??b.silhouette};
}
