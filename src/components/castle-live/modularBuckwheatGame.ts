// «Корона гречневого королевства» (мини-игра Кайлани) на площади замка: только у админов
// и права «buckwheat» (07.11); игрокам в замке не ставим (08.11) — у них постройка на карте.
// Approved Kaylani throne artwork; game access and saved placement are unchanged.
import {kaylaniThroneBuildingAssets} from './kaylaniThroneBuildingAssets';
import {building} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';

export const BUCKWHEAT_GAME_BUILDING_ID='buckwheat_game';
export const BUCKWHEAT_GAME_LOOK=kaylaniThroneBuildingAssets.base;
// Keep the full sprite and its caption clear of the warehouse and the eastern buildings.
export const BUCKWHEAT_GAME_X=1300,BUCKWHEAT_GAME_Y=1270;
export const BUCKWHEAT_GAME_LEGACY_X=340,BUCKWHEAT_GAME_LEGACY_Y=950;

/** Здание для сцены замка; null — игра этому игроку не открыта. */
export function buckwheatGameBuilding(visible:boolean):SceneBuilding|null{
 if(!visible)return null;
 const look=BUCKWHEAT_GAME_LOOK;
 const b=building(BUCKWHEAT_GAME_BUILDING_ID,'Корона гречневого королевства',look.image,BUCKWHEAT_GAME_X,BUCKWHEAT_GAME_Y,210,.45,['Гречневое','королевство']);
 return {...b,shadow:look.shadow,shadowFlipped:look.shadowFlipped,anchor:look.anchor,silhouette:look.silhouette};
}

/** Move only layouts saved at the old automatic position; preserve player edits. */
export function relocateLegacyBuckwheatGame(list:SceneBuilding[]):SceneBuilding[]{
 return list.map(b=>b.id===BUCKWHEAT_GAME_BUILDING_ID&&Math.abs(b.x-BUCKWHEAT_GAME_LEGACY_X)<1&&Math.abs(b.y-BUCKWHEAT_GAME_LEGACY_Y)<1
  ?{...b,x:BUCKWHEAT_GAME_X,y:BUCKWHEAT_GAME_Y}:b);
}
