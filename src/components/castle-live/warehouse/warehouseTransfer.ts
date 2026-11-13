import type {StoredItem,ItemPlace,MoveReceipt,MoveUnknown} from './WarehouseScreen';
const SCALE=1e9,MAX=999*SCALE;
export const exact9=(n:number)=>Math.round(n*SCALE)/SCALE;
export function parseQtyInput(text:string):number|null{
 const normalized=text.trim().replace(',','.');
 if(!/^(?:\d+)(?:\.\d{1,9})?$/.test(normalized))return null;
 const value=Number(normalized);
 return Number.isFinite(value)&&value>0&&value<=999?exact9(value):null;
}
export type TransferPart={item:StoredItem;qty:number};
// The game stores up to 20 units of one stack in a cell (backpackCells.ts).
export function additionalCellsRequired(selected:StoredItem[],stored:StoredItem[]):number{
 const counts=new Map<string,number>();
 for(const item of stored){const key=item.stackKey??item.id;counts.set(key,(counts.get(key)??0)+item.count)}
 const additions=new Map<string,number>();
 for(const item of selected){const key=item.stackKey??item.id;additions.set(key,(additions.get(key)??0)+item.count)}
 let required=0;
 for(const [key,amount] of additions){const current=counts.get(key)??0;required+=Math.ceil((current+amount)/20)-Math.ceil(current/20)}
 return required;
}
export function movePlan(items:StoredItem[],amounts:Record<string,number>):TransferPart[]{
 const groups=new Map<string,{item:StoredItem;units:number}>();
 for(const item of items){const qty=amounts[item.id]??item.count;const units=Math.round(qty*SCALE);if(!Number.isSafeInteger(units)||units<=0)continue;const key=item.stackKey??item.id;const old=groups.get(key);groups.set(key,{item,units:(old?.units??0)+units})}
 return [...groups.values()].flatMap(({item,units})=>{const parts:TransferPart[]=[];while(units>0){const next=Math.min(MAX,units);parts.push({item,qty:next/SCALE});units-=next}return parts});
}
export type TransferOutcome={moved:number;total:number;error?:string;unknown?:boolean};
export async function executeTransfer(parts:TransferPart[],place:ItemPlace,send:(item:StoredItem,place:ItemPlace,qty:number)=>Promise<MoveReceipt|MoveUnknown|string>|MoveReceipt|MoveUnknown|string):Promise<TransferOutcome>{
 const total=exact9(parts.reduce((n,p)=>n+p.qty,0));let moved=0;
 for(const part of parts){
  try{const result=await send(part.item,place,part.qty);
   if(typeof result==='string')return {moved:exact9(moved),total,error:result};
   if(!result||typeof result!=='object')return {moved:exact9(moved),total,error:'No transfer receipt',unknown:true};
   if('unknown' in result)return {moved:exact9(moved),total,error:result.error,unknown:true};
   if(!Number.isFinite(result.moved)||result.moved<0||result.moved>part.qty)return {moved,total,error:'Invalid transfer receipt',unknown:true};
   const actual=result.moved;moved=exact9(moved+actual);
   if(actual<part.qty)return {moved,total,error:result.error??'partial'};
   if(result.error)return {moved,total,error:result.error};
  }catch(e){return {moved:exact9(moved),total,error:e instanceof Error?e.message:'failed',unknown:true}}
 }
 return {moved:exact9(moved),total};
}
