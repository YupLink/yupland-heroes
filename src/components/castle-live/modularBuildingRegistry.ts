// Single catalogue for buildings added after the original castle.
// A saved layout is placement only; ownership remains with the existing API hooks.
import {casinoBuilding} from './modularCasino';
import {auctionHouseBuilding} from './modularAuctionHouse';
import {bankBuilding} from './modularBank';
import {architectBuilding} from './modularArchitect';
import {mineOfficeBuilding} from './modularMineOffice';
import {weatherStationBuilding} from './modularWeatherStation';
import {newspaperKioskBuilding} from './modularNewspaperKiosk';
import {shamanHutBuilding} from './modularShamanHut';
import {buckwheatGameBuilding} from './modularBuckwheatGame';
import type {SceneBuilding} from './modularCastleLayout';
export const ownedBuildingTemplates:Record<string,(baseSize?:number)=>SceneBuilding|null>={
 casino:()=>casinoBuilding(true),
 auction:baseSize=>auctionHouseBuilding(Number.isFinite(baseSize)?Math.max(1,Math.min(10,Math.round((baseSize!-230)/10)+1)):1),
 bank:()=>bankBuilding(true),
 architect:()=>architectBuilding(1),
 mine_office:()=>mineOfficeBuilding(true),
 weather_station:()=>weatherStationBuilding(true),
 shaman_hut:()=>shamanHutBuilding(true),
 newspaper_kiosk:()=>newspaperKioskBuilding(true),
 buckwheat_game:()=>buckwheatGameBuilding(true),
};
export const isOwnedBuilding=(id:string)=>Object.prototype.hasOwnProperty.call(ownedBuildingTemplates,id);
export function savedBuildingTemplate(id:string,baseSize?:number):SceneBuilding|null{
 return isOwnedBuilding(id)?ownedBuildingTemplates[id](baseSize):null;
}

