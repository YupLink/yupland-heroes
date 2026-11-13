// Архитектор на площади замка: только с 1-го уровня, не залезает на основания
// видимых построек (Торговый дом на площади не показывают — его место и занято),
// казино, банка и аукционного дома любого уровня, не выходит за территорию.
import {describe,expect,it} from 'vitest';
import {originals} from './modularCastleProfiles';
import {placementProblem} from './modularPlacement';
import {auctionHouseBuilding} from './modularAuctionHouse';
import {casinoBuilding} from './modularCasino';
import {bankBuilding} from './modularBank';
import {architectBuilding} from './modularArchitect';

describe('Архитектор в замке',()=>{
 it('не построен — здания нет',()=>{expect(architectBuilding(0)).toBeNull();});
 it('с 1-го по 4-й уровень — своё место без пересечений',()=>{
  const shown=originals.filter(b=>b.id!=='shop');
  for(let level=1;level<=4;level++){
   const arch=architectBuilding(level)!;
   for(let l=0;l<=10;l++){
    const a=auctionHouseBuilding(l);
    const all=[...shown,...(a?[a]:[]),casinoBuilding(true)!,bankBuilding(true)!,arch];
    expect(placementProblem(arch,all)).toBeNull();
   }
  }
 });
});
