// «Хижина шаманов» на площади замка: только у построивших, своё место без
// пересечений с основаниями видимых построек (Архитектор, Банк, Казино,
// «Управление шахтами», «Метеостанция», Аукционный дом любого уровня); стили
// замка не ломаются — облик хижины есть в каждом пакете.
import {describe,expect,it} from 'vitest';
import {shamanHutBuildingAssets} from './shamanHutBuildingAssets';
import {originals} from './modularCastleProfiles';
import {placementProblem} from './modularPlacement';
import {auctionHouseBuilding} from './modularAuctionHouse';
import {casinoBuilding} from './modularCasino';
import {bankBuilding} from './modularBank';
import {architectBuilding} from './modularArchitect';
import {mineOfficeBuilding} from './modularMineOffice';
import {weatherStationBuilding} from './modularWeatherStation';
import {SHAMAN_HUT_BUILDING_ID,shamanHutBuilding} from './modularShamanHut';
import {isOwnedBuilding} from './modularBuildingRegistry';
import {applyBuildingStyle,buildingStylePacks} from './modularBuildingStyles';
import {OWNED_LAYOUT_BUILDINGS} from '@/server/api/castle-layout/layout-rights';
import {SHAMAN_HUT_KIND} from '@/lib/townHallCatalog';

const owned=()=>[casinoBuilding(true)!,bankBuilding(true)!,architectBuilding(1)!,mineOfficeBuilding(true)!,weatherStationBuilding(true)!];

describe('«Хижина шаманов» в замке',()=>{
 it('не построена — здания нет',()=>{expect(shamanHutBuilding(false)).toBeNull();});
 it('базовый вид — из комплекта хижины (временный, не доска «Задания» станции)',()=>{
  const hut=shamanHutBuilding(true)!;
  expect(hut.image).toBe(shamanHutBuildingAssets.base.image);
  expect(hut.image).not.toBe(weatherStationBuilding(true)!.image);
 });
 it('своё место без пересечений',()=>{
  const shown=originals.filter(b=>b.id!=='shop');
  const hut=shamanHutBuilding(true)!;
  for(let l=0;l<=10;l++){
   const a=auctionHouseBuilding(l);
   const all=[...shown,...(a?[a]:[]),...owned(),hut];
   expect(placementProblem(hut,all)).toBeNull();
  }
 });
 it('id сцены = вид здания Ратуши; положение сохраняется редактором и проходит права сервера',()=>{
  expect(SHAMAN_HUT_BUILDING_ID).toBe(SHAMAN_HUT_KIND);
  expect(isOwnedBuilding(SHAMAN_HUT_BUILDING_ID)).toBe(true);
  expect(OWNED_LAYOUT_BUILDINGS).toContain(SHAMAN_HUT_BUILDING_ID);
 });
 it('стиль замка применяется и с хижиной: облик стиля из комплекта хижины',()=>{
  const list=[...originals.filter(b=>b.id!=='shop'),...owned(),auctionHouseBuilding(1)!,shamanHutBuilding(true)!];
  for(const [style,pack] of Object.entries(buildingStylePacks)){
   const styled=applyBuildingStyle(list,style);
   expect(styled).not.toBe(list);
   expect(styled.find(b=>b.id===SHAMAN_HUT_BUILDING_ID)?.image).toBe(pack!.shaman_hut.image);
   expect(pack!.shaman_hut).toBe(shamanHutBuildingAssets[style as keyof typeof shamanHutBuildingAssets]);
  }
 });
});
