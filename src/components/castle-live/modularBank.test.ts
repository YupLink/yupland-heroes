// Банк на площади замка: не залезает на основания других построек, казино и
// аукционный дом любого уровня, не выходит за территорию.
import {describe,expect,it} from 'vitest';
import {originals} from './modularCastleProfiles';
import {placementProblem} from './modularPlacement';
import {auctionHouseBuilding} from './modularAuctionHouse';
import {casinoBuilding} from './modularCasino';
import {bankBuilding} from './modularBank';

describe('банк в замке',()=>{
 it('не видно — здания нет',()=>{expect(bankBuilding(false)).toBeNull();});
 it('своё место без пересечений с казино и аукционным домом любого уровня',()=>{
  const b=bankBuilding(true)!;const c=casinoBuilding(true)!;
  for(let l=0;l<=10;l++){
   const a=auctionHouseBuilding(l);
   const all=[...originals,...(a?[a]:[]),c,b];
   expect(placementProblem(b,all)).toBeNull();
   expect(placementProblem(c,all)).toBeNull();
   if(a)expect(placementProblem(a,all)).toBeNull();
  }
 });
});
