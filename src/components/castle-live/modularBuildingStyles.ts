import {mineOfficeBuildingAssets} from './mineOfficeBuildingAssets';
import {weatherStationBuildingAssets} from './weatherStationBuildingAssets';
import {newspaperKioskBuildingAssets} from './newspaperKioskBuildingAssets';
import {shamanHutBuildingAssets} from './shamanHutBuildingAssets';
import {elvenBuildingAssets} from './elvenBuildingAssets';
import {winterBuildingAssets} from './winterBuildingAssets';
import {infernalBuildingAssets} from './infernalBuildingAssets';
import {buckwheatBuildingAssets} from './buckwheatBuildingAssets';
import {celestialBuildingAssets} from './celestialBuildingAssets';
import {kaylaniThroneBuildingAssets} from './kaylaniThroneBuildingAssets';
import {originals} from './modularCastleProfiles';
import {ownedBuildingTemplates} from './modularBuildingRegistry';
import type {SceneBuilding} from './modularCastleLayout';
export const buildingStyleIds=['base','elven','winter','infernal','buckwheat','celestial'] as const;
export type BuildingStyle=typeof buildingStyleIds[number];
export type BuildingSkin=Pick<SceneBuilding,'image'>&Partial<Pick<SceneBuilding,'shadow'|'shadowFlipped'|'anchor'|'silhouette'>>;
export type BuildingStylePack=Record<string,BuildingSkin>;
// Register approved complete packs here. Includes gates and every API-owned building.
// Until a complete pack exists, retain base art for the WHOLE castle, never a mixed pack.
export const buildingStylePacks:Partial<Record<BuildingStyle,BuildingStylePack>>={elven:{...elvenBuildingAssets,mine_office:mineOfficeBuildingAssets.elven,weather_station:weatherStationBuildingAssets.elven,shaman_hut:shamanHutBuildingAssets.elven,newspaper_kiosk:newspaperKioskBuildingAssets.elven,buckwheat_game:kaylaniThroneBuildingAssets.elven},winter:{...winterBuildingAssets,mine_office:mineOfficeBuildingAssets.winter,weather_station:weatherStationBuildingAssets.winter,shaman_hut:shamanHutBuildingAssets.winter,newspaper_kiosk:newspaperKioskBuildingAssets.winter,buckwheat_game:kaylaniThroneBuildingAssets.winter},infernal:{...infernalBuildingAssets,mine_office:mineOfficeBuildingAssets.infernal,weather_station:weatherStationBuildingAssets.infernal,shaman_hut:shamanHutBuildingAssets.infernal,newspaper_kiosk:newspaperKioskBuildingAssets.infernal,buckwheat_game:kaylaniThroneBuildingAssets.infernal},buckwheat:{...buckwheatBuildingAssets,mine_office:mineOfficeBuildingAssets.buckwheat,weather_station:weatherStationBuildingAssets.buckwheat,shaman_hut:shamanHutBuildingAssets.buckwheat,newspaper_kiosk:newspaperKioskBuildingAssets.buckwheat,buckwheat_game:kaylaniThroneBuildingAssets.buckwheat},celestial:{...celestialBuildingAssets,mine_office:mineOfficeBuildingAssets.celestial,weather_station:weatherStationBuildingAssets.celestial,shaman_hut:shamanHutBuildingAssets.celestial,newspaper_kiosk:newspaperKioskBuildingAssets.celestial,buckwheat_game:kaylaniThroneBuildingAssets.celestial}};
export function applyBuildingStyle(list:SceneBuilding[],style:string|undefined,packs=buildingStylePacks):SceneBuilding[]{
 if(!style||style==='base'||!buildingStyleIds.includes(style as BuildingStyle))return list;
 const pack=packs[style as BuildingStyle];
 const ids=new Set([...originals.filter(b=>b.id!=='shop').map(b=>b.id),...Object.keys(ownedBuildingTemplates),...list.filter(b=>!b.decor).map(b=>b.id)]);
 if(!pack||[...ids].some(id=>!Object.prototype.hasOwnProperty.call(pack,id)))return list;
 return list.map(b=>{
  if(b.decor||!pack[b.id])return b;
  const {image,shadow,shadowFlipped,anchor,silhouette}=pack[b.id];
  return {...b,image,shadow,shadowFlipped,anchor:anchor??b.anchor,silhouette:silhouette??b.silhouette};
 });
}


// Editor rows carry rendered art. Keep canonical artwork when storing edits,
// so switching back to base restores the API-selected building (including upgrades).
export function restoreBuildingArtwork(next:SceneBuilding[],previous:SceneBuilding[]):SceneBuilding[]{
 return next.map(b=>{
  const source=previous.find(p=>p.id===b.id);
  if(b.decor||!source)return b;
  const {image,shadow,shadowFlipped,anchor,silhouette}=source;
  return {...b,image,shadow,shadowFlipped,anchor,silhouette};
 });
}
export const buildingStyleOptions=[
 {id:'base',ru:'Базовый',en:'Base'},
 {id:'elven',ru:'Эльфийский',en:'Elven'},
 {id:'winter',ru:'Зимний',en:'Winter'},
 {id:'infernal',ru:'Адский',en:'Infernal'},
 {id:'buckwheat',ru:'Гречневый',en:'Buckwheat'},
 {id:'celestial',ru:'Небесный',en:'Celestial'},
] as const;
