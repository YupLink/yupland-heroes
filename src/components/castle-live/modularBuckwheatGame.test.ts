// «Корона гречневого королевства» на площади замка: своё место без пересечений с
// основаниями видимых построек, сохраняется редактором и проходит права сервера,
// стили замка не ломаются (облик игры есть в каждом пакете).
import {describe,expect,it} from 'vitest';
import {originals} from './modularCastleProfiles';
import {placementProblem} from './modularPlacement';
import {auctionHouseBuilding} from './modularAuctionHouse';
import {casinoBuilding} from './modularCasino';
import {bankBuilding} from './modularBank';
import {architectBuilding} from './modularArchitect';
import {mineOfficeBuilding} from './modularMineOffice';
import {weatherStationBuilding} from './modularWeatherStation';
import {shamanHutBuilding} from './modularShamanHut';
import {newspaperKioskBuilding} from './modularNewspaperKiosk';
import {BUCKWHEAT_GAME_BUILDING_ID,BUCKWHEAT_GAME_LOOK,BUCKWHEAT_GAME_X,BUCKWHEAT_GAME_Y,buckwheatGameBuilding,relocateLegacyBuckwheatGame} from './modularBuckwheatGame';
import {isOwnedBuilding} from './modularBuildingRegistry';
import {kaylaniThroneBuildingAssets} from './kaylaniThroneBuildingAssets';
import {applyBuildingStyle,buildingStylePacks} from './modularBuildingStyles';
import {resizeBuilding} from './modularCastleProfiles';
import {OWNED_LAYOUT_BUILDINGS} from '@/server/api/castle-layout/layout-rights';
import {FREE_BUILD_EXCEPT} from '@/server/api/castle-townhall/free-build';
import {NEW_BUILDING_SIZE} from '@/lib/castlePlacementLimits';

const owned=()=>[casinoBuilding(true)!,bankBuilding(true)!,architectBuilding(1)!,mineOfficeBuilding(true)!,weatherStationBuilding(true)!,shamanHutBuilding(true)!,newspaperKioskBuilding(true)!];

describe('«Корона гречневого королевства» в замке',()=>{
 it('не открыта — здания нет',()=>{expect(buckwheatGameBuilding(false)).toBeNull();});
 it('своё место без пересечений, и в размере новой постройки',()=>{
  const shown=originals.filter(b=>b.id!=='shop');
  const game=buckwheatGameBuilding(true)!;
  const big=buckwheatGameBuilding(true)!;resizeBuilding(big,NEW_BUILDING_SIZE);
  for(let l=0;l<=10;l++){
   const a=auctionHouseBuilding(l);
   const all=[...shown,...(a?[a]:[]),...owned()];
   expect(placementProblem(game,[...all,game])).toBeNull();
   expect(placementProblem(big,[...all,big])).toBeNull();
  }
 });
 it('полный спрайт новой постройки не заслоняет соседние здания',()=>{
  const game=buckwheatGameBuilding(true)!;resizeBuilding(game,NEW_BUILDING_SIZE);
  const others=[...originals.filter(b=>b.id!=='shop'),...owned(),auctionHouseBuilding(10)!];
  for(const other of others){
   const size=Math.max(other.size,NEW_BUILDING_SIZE);
   const clearance=(game.size+size)/2+8;
   expect(Math.abs(game.x-other.x)>=clearance||Math.abs(game.y-other.y)>=clearance).toBe(true);
  }
 });
 it('старое автоматическое место переносится, ручное положение сохраняется',()=>{
  const game=buckwheatGameBuilding(true)!;
  const legacy={...game,x:340,y:950};
  const custom={...game,x:520,y:990};
  expect(relocateLegacyBuckwheatGame([legacy])[0]).toMatchObject({x:BUCKWHEAT_GAME_X,y:BUCKWHEAT_GAME_Y});
  expect(relocateLegacyBuckwheatGame([custom])[0]).toMatchObject({x:520,y:990});
 });
 it('положение сохраняется редактором и проходит права сервера; не покупается',()=>{
  expect(isOwnedBuilding(BUCKWHEAT_GAME_BUILDING_ID)).toBe(true);
  expect(OWNED_LAYOUT_BUILDINGS).toContain(BUCKWHEAT_GAME_BUILDING_ID);
  expect(FREE_BUILD_EXCEPT).toContain(BUCKWHEAT_GAME_BUILDING_ID);
 });
 it('стиль замка применяет соответствующий трон и сохраняет положение',()=>{
  const list=[...originals.filter(b=>b.id!=='shop'),...owned(),auctionHouseBuilding(1)!,buckwheatGameBuilding(true)!];
  expect(buckwheatGameBuilding(true)?.image).toBe(kaylaniThroneBuildingAssets.base.image);
  expect(BUCKWHEAT_GAME_LOOK).toBe(kaylaniThroneBuildingAssets.base);
  for(const style of Object.keys(buildingStylePacks)){
   const styled=applyBuildingStyle(list,style);
   expect(styled).not.toBe(list);
   const throne=styled.find(b=>b.id===BUCKWHEAT_GAME_BUILDING_ID)!;
   const skin=kaylaniThroneBuildingAssets[style as keyof typeof kaylaniThroneBuildingAssets];
   expect(throne).toMatchObject({...skin,x:BUCKWHEAT_GAME_X,y:BUCKWHEAT_GAME_Y});
  }
 });
});
