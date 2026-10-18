// Казино на площади замка: не залезает на основания других построек (и на
// аукционный дом любого уровня) и не выходит за территорию.
import {describe,expect,it} from 'vitest';
import {originals} from './modularCastleProfiles';
import {placementProblem} from './modularPlacement';
import {auctionHouseBuilding} from './modularAuctionHouse';
import {casinoBuilding} from './modularCasino';

describe('казино в замке',()=>{
 it('не построено — здания нет',()=>{expect(casinoBuilding(false)).toBeNull();});
 it('своё место без пересечений рядом с аукционным домом любого уровня',()=>{
  const c=casinoBuilding(true)!;
  for(let l=0;l<=10;l++){
   const a=auctionHouseBuilding(l);
   const all=[...originals,...(a?[a]:[]),c];
   expect(placementProblem(c,all)).toBeNull();
   if(a)expect(placementProblem(a,all)).toBeNull();
  }
 });
});
