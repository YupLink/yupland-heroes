// «Метеостанция» на площади замка: только у построивших, своё место без
// пересечений с основаниями видимых построек (Архитектор, Банк, Казино,
// «Управление шахтами», Аукционный дом любого уровня); стили замка не ломаются —
// облик станции есть в каждом пакете.
import {describe,expect,it} from 'vitest';
import {weatherStationBuildingAssets} from './weatherStationBuildingAssets';
import {originals} from './modularCastleProfiles';
import {placementProblem} from './modularPlacement';
import {auctionHouseBuilding} from './modularAuctionHouse';
import {casinoBuilding} from './modularCasino';
import {bankBuilding} from './modularBank';
import {architectBuilding} from './modularArchitect';
import {mineOfficeBuilding} from './modularMineOffice';
import {WEATHER_STATION_BUILDING_ID,weatherStationBuilding} from './modularWeatherStation';
import {isOwnedBuilding} from './modularBuildingRegistry';
import {applyBuildingStyle,buildingStylePacks} from './modularBuildingStyles';

describe('«Метеостанция» в замке',()=>{
 it('не построена — здания нет',()=>{expect(weatherStationBuilding(false)).toBeNull();});
 it('базовый вид — из комплекта станции',()=>{expect(weatherStationBuilding(true)!.image).toBe(weatherStationBuildingAssets.base.image);});
 it('своё место без пересечений',()=>{
  const shown=originals.filter(b=>b.id!=='shop');
  const station=weatherStationBuilding(true)!;
  for(let l=0;l<=10;l++){
   const a=auctionHouseBuilding(l);
   const all=[...shown,...(a?[a]:[]),casinoBuilding(true)!,bankBuilding(true)!,architectBuilding(1)!,mineOfficeBuilding(true)!,station];
   expect(placementProblem(station,all)).toBeNull();
  }
 });
 it('положение сохраняется редактором замка',()=>{expect(isOwnedBuilding(WEATHER_STATION_BUILDING_ID)).toBe(true);});
 it('стиль замка применяется и со станцией: облик стиля из комплекта станции',()=>{
  const list=[...originals.filter(b=>b.id!=='shop'),casinoBuilding(true)!,bankBuilding(true)!,architectBuilding(1)!,auctionHouseBuilding(1)!,mineOfficeBuilding(true)!,weatherStationBuilding(true)!];
  for(const [style,pack] of Object.entries(buildingStylePacks)){
   const styled=applyBuildingStyle(list,style);
   expect(styled).not.toBe(list);
   expect(styled.find(b=>b.id===WEATHER_STATION_BUILDING_ID)?.image).toBe(pack!.weather_station.image);
   expect(pack!.weather_station).toBe(weatherStationBuildingAssets[style as keyof typeof weatherStationBuildingAssets]);
  }
 });
});
