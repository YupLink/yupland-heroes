// «Управление шахтами» на площади замка: только у построивших, своё место без
// пересечений с основаниями видимых построек (Архитектор, Банк, Казино,
// Аукционный дом любого уровня); стили замка не ломаются — временный облик
// стиля есть в каждом пакете.
import {describe,expect,it} from 'vitest';
import {mineOfficeBuildingAssets} from './mineOfficeBuildingAssets';
import {originals} from './modularCastleProfiles';
import {placementProblem} from './modularPlacement';
import {auctionHouseBuilding} from './modularAuctionHouse';
import {casinoBuilding} from './modularCasino';
import {bankBuilding} from './modularBank';
import {architectBuilding} from './modularArchitect';
import {MINE_OFFICE_BUILDING_ID,mineOfficeBuilding} from './modularMineOffice';
import {isOwnedBuilding} from './modularBuildingRegistry';
import {applyBuildingStyle,buildingStylePacks} from './modularBuildingStyles';

describe('«Управление шахтами» в замке',()=>{
 it('базовый вид использует отдельный комплект',()=>{expect(mineOfficeBuilding(true)!.image).toBe(mineOfficeBuildingAssets.base.image);});
 it('не построено — здания нет',()=>{expect(mineOfficeBuilding(false)).toBeNull();});
 it('своё место без пересечений',()=>{
  const shown=originals.filter(b=>b.id!=='shop');
  const office=mineOfficeBuilding(true)!;
  for(let l=0;l<=10;l++){
   const a=auctionHouseBuilding(l);
   const all=[...shown,...(a?[a]:[]),casinoBuilding(true)!,bankBuilding(true)!,architectBuilding(1)!,office];
   expect(placementProblem(office,all)).toBeNull();
  }
 });
 it('положение сохраняется редактором замка',()=>{expect(isOwnedBuilding(MINE_OFFICE_BUILDING_ID)).toBe(true);});
 it('стиль замка применяется и со зданием: свой облик в каждом стиле',()=>{
  const list=[...originals.filter(b=>b.id!=='shop'),casinoBuilding(true)!,bankBuilding(true)!,architectBuilding(1)!,auctionHouseBuilding(1)!,mineOfficeBuilding(true)!];
  for(const [style,pack] of Object.entries(buildingStylePacks)){
   const styled=applyBuildingStyle(list,style);
   expect(styled).not.toBe(list);
   expect(pack!.mine_office.image).not.toBe(pack!.architect.image);
   expect(styled.find(b=>b.id===MINE_OFFICE_BUILDING_ID)?.image).toBe(pack!.mine_office.image);
  }
 });
});
