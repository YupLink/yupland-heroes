// Аукционный дом на площади замка: на любом уровне не залезает на основания
// других построек и не выходит за территорию (как проверяет правка раскладки).
import {describe,expect,it} from 'vitest';
import {originals} from './modularCastleProfiles';
import {placementProblem} from './modularPlacement';
import {auctionHouseBuilding,auctionHouseLook} from './modularAuctionHouse';

describe('аукционный дом в замке',()=>{
 it('не построен — здания нет',()=>{expect(auctionHouseBuilding(0)).toBeNull();});
 it('на всех 10 уровнях — своё место без пересечений, облик у каждого уровня свой',()=>{
  const looks=new Set<string>();
  for(let l=1;l<=10;l++){
   const a=auctionHouseBuilding(l)!;
   expect(placementProblem(a,[...originals,a])).toBeNull();
   looks.add(auctionHouseLook(l));
  }
  expect(looks.size).toBe(10);
 });
});
