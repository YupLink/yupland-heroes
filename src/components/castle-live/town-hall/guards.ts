import type {TownHallCommand,TownHallModel,Cost} from './contracts';
import {capacityState,buildGate} from './townHallCapacity';
export function validPrice(value:unknown):Cost[]|null {
 if(!Array.isArray(value)||!value.length)return null;
 const seen=new Set<string>();
 for(const item of value){if(!item||!['gold','wood','stone','diamonds'].includes(item.currency)||!Number.isSafeInteger(item.amount)||item.amount<=0||seen.has(item.currency))return null;seen.add(item.currency);}
 return value;
}
export function canExecute(model:TownHallModel|null,command:TownHallCommand):boolean {
 if(!model||command.revision!==model.revision)return false;
 if(command.kind==='apply-style')return model.buildingStyles.includes(command.id)&&model.activeBuildingStyle!==command.id;
 if(model.blockedPrices?.includes(command.priceId))return false;
 const price=validPrice(model.prices[command.priceId]);if(!price||price.some(p=>(model.resources[p.currency]??0)<p.amount))return false;
 const capacity=capacityState(model.levels,model.level,model.used);
 if(command.kind==='build'){
  const prices={auction:'building:9',casino:'building:10',temple:'building:11',armory:'building:armory'};
  return prices[command.id]===command.priceId&&buildGate(capacity,true,model.buildings.some(b=>b.id===command.id))==='confirm';
 }
 if(command.kind==='capacity')return !!capacity?.next&&capacity.next.level===command.level&&capacity.next.priceId===command.priceId;
 if(command.kind==='buy-decor')return command.priceId===`decor:${command.id}`&&!model.decor.includes(command.id);
 if(command.kind==='buy-style')return command.priceId===`buildings:${command.id}`&&!model.buildingStyles.includes(command.id);
 if(command.kind!=="upgrade")return false;
 const building=model.buildings.find(b=>b.id===command.id),rule=model.upgrades[command.id];
 return !!building&&!!rule&&rule.priceId===command.priceId&&rule.nextLevel===command.level&&Number.isSafeInteger(Number(building.level))&&command.level>Number(building.level)&&(rule.maxLevel===null||command.level<=rule.maxLevel);
}
