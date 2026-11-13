// Approved mine_office art, separate from architect. Existing placement and ownership preserved.
import {mineOfficeBuildingAssets} from './mineOfficeBuildingAssets';
import {building} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';

export const MINE_OFFICE_BUILDING_ID='mine_office';
const look=mineOfficeBuildingAssets.base;
export const MINE_OFFICE_LOOK=look.image;
export const MINE_OFFICE_X=830,MINE_OFFICE_Y=510;

/** Здание для сцены замка; null — не построено. */
export function mineOfficeBuilding(built:boolean):SceneBuilding|null{
 if(!built)return null;
 const b=building(MINE_OFFICE_BUILDING_ID,'Управление шахтами',look.image,MINE_OFFICE_X,MINE_OFFICE_Y,210,.45,['Управление','шахтами']);
 return {...b,shadow:look.shadow,shadowFlipped:look.shadowFlipped,anchor:look.anchor,silhouette:look.silhouette};
}
