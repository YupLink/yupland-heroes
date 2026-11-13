// Approved warehouse presentation, connected to existing game APIs only.
import {useCallback,useRef,useState} from 'react';
import {useQuery,useQueryClient,useIsMutating} from '@tanstack/react-query';
import {WarehouseScreen,type StoredItem,type WarehouseItemDetails,type MoveReceipt,type MoveUnknown} from './WarehouseScreen';
import {getItemInfo} from '../../../server/api/beta-raid/item-info';
import {artifactSummary} from '../../artifactSummary';
import {boostListText} from '../../../lib/hero/boost';
import {warehouseItems,warehouseImage} from './warehouseItems';
import {CellUpgrade} from './CellUpgrade';
import {HeroItemsSection} from './HeroItemsSection';
import type {WarehouseServices} from './warehouseServices';
import {exact9} from './warehouseTransfer';

const KEY=['castle-warehouse'] as const;
export function WarehouseController({services,lang,onShowCell,onBack}: {services:WarehouseServices;lang:'ru'|'en';onShowCell?:(q:number,r:number)=>void;onBack:()=>void}) {
 const upgradePending=useIsMutating({mutationKey:['castle-warehouse-upgrade']})>0;
 const ru=lang==='ru'; const qc=useQueryClient();
 const busy=useRef(false);const [blocked,setBlocked]=useState(false);
 const [worldOpen,setWorldOpen]=useState(false);
 const state=useQuery({queryKey:KEY,queryFn:services.load,refetchInterval:30000,retry:false,gcTime:60000,staleTime:0,refetchOnMount:'always'});
 const backpack=useQuery({queryKey:['my-hero-backpack'],queryFn:services.backpack,staleTime:0,refetchOnMount:'always'});
 const world=useQuery({queryKey:['my-warehouses'],queryFn:services.world,enabled:worldOpen,staleTime:0,refetchOnMount:'always'});
 const d=state.data;
 const refresh=async()=>{
   await Promise.all([KEY,['my-hero-backpack'],['my-warehouses'],['beta-raid-warehouse-badges']].map(queryKey=>qc.invalidateQueries({queryKey},{throwOnError:true})));
 };
 const run=async(action:()=>Promise<unknown>)=>{
   if(busy.current)return ru?'Действие выполняется…':'Action in progress…';
   busy.current=true;
   try{await action();await refresh();}catch(e){return services.error(e);}
   finally{busy.current=false;}
 };
 const status=state.isPending?<p className="warehouse-release-status" role="status">{ru?'Загружаем склад…':'Loading warehouse…'}</p>:state.isError?<p className="warehouse-release-status" role="alert">{ru?'Не удалось обновить склад.':'Could not refresh the warehouse.'} <button onClick={()=>void state.refetch()}>{ru?'Повторить':'Retry'}</button></p>:null;
 const worldStatus=world.isPending||world.isFetching?<p role="status">{ru?'Проверяем мои склады…':'Checking my warehouses…'}</p>:world.isError?<p role="alert">{ru?'Не удалось загрузить склады.':'Could not load warehouses.'} <button onClick={()=>void world.refetch()}>{ru?'Повторить':'Retry'}</button></p>:null;
 const stacks=d?.backpack?.stacks??[];
 const details=backpack.isSuccess?backpack.data.stacks:[];
 const items=warehouseItems(d?.own??[],lang);
 const loadInfo=useCallback(async(item:StoredItem):Promise<WarehouseItemDetails|null>=>{
  const key=item.stackKey??'';
  const split=key.indexOf(':');
  if(split<0||key.slice(0,split)==='resource')return null;
  const id=key.slice(split+1);
  if(!id)return null;
  const info=await getItemInfo({data:{id}});
  if(!info)return null;
  const properties=artifactSummary(info,lang).split('\n').filter(Boolean);
  if(info.hp!=null)properties.push(`${lang==='ru'?'Здоровье':'Health'}: ${info.hp.toLocaleString(lang==='ru'?'ru-RU':'en-US')}`);
  if(info.damage)properties.push(`${lang==='ru'?'Атака':'Attack'}: ${info.damage}`);
  return {description:info.description,properties,effects:info.boost?.length?[boostListText(info.boost,lang)]:[]};
 },[lang]);
 const locations=(world.isSuccess&&!world.isFetching?world.data.list:[]).map(w=>({id:`${w.q}:${w.r}`,name:'',q:w.q,r:w.r,items:w.items.map(s=>({id:s.stackKey,stackKey:s.stackKey,name:s.name,count:s.count,image:warehouseImage(s)}))}));
 const reconcile=async()=>{setBlocked(true);try{await refresh();setBlocked(false);return true}catch{return false}};
 const validNumber=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&Math.abs(n-exact9(n))<1e-9;
 const move=async(item:StoredItem,place:string,qty:number):Promise<MoveReceipt|MoveUnknown|string>=>{
   if(busy.current)return ru?'Действие выполняется…':'Action in progress…';
   if(blocked)return ru?'Сначала обнови склад.':'Refresh warehouse data first.';
   if(!d||state.isError||!item.stackKey)return ru?'Обнови склад перед действием.':'Refresh the warehouse before acting.';
   if(place==='castle'&&!d.backpack&&!item.stackKey.startsWith('resource:'))return ru?'Для вещи нужен активный герой.':'An active hero is required for this item.';
   busy.current=true;
   try{
     let raw:unknown;
     try{raw=place==='castle'?await services.take({stackKey:item.stackKey,qty}):await services.store({stackKey:item.stackKey,qty})}
     catch(e){await reconcile();return {unknown:true,error:services.error(e)}}
     const receipt=raw as {ok?:unknown;own?:unknown;shared?:unknown;rejected?:unknown;qty?:unknown}|null;
     const valid=!!receipt&&typeof receipt==='object'&&receipt.ok===true&&
       (place==='castle'?validNumber(receipt.qty):validNumber(receipt.own)&&validNumber(receipt.shared)&&validNumber(receipt.rejected));
     const moved=valid?(place==='castle'?receipt.qty as number:exact9((receipt.own as number)+(receipt.shared as number))):NaN;
     if(!valid||moved>qty||moved<0){await reconcile();return {unknown:true,error:ru?'Ответ склада не подтверждён.':'Warehouse response was not confirmed.'}}
     let error:string|undefined;
     if(!await reconcile())error=ru?'Данные не обновились. Обнови склад перед следующим переносом.':'Data did not refresh. Refresh the warehouse before another transfer.';
     return {moved,requested:qty,error};
   }finally{busy.current=false}
 };
 const use=(item:StoredItem)=>run(async()=>{
   if(!item.stackKey||!item.usable)throw new Error(ru?'Предмет недоступен.':'Item unavailable.');
   return services.use(item.stackKey);
 });
 return <div className="warehouse-release"><WarehouseScreen upgradePending={upgradePending} lang={lang} items={items} capacity={d?.ownCells??0} maxCapacity={d?.maxCells??20}
  backpack={warehouseItems(stacks.filter(s=>!s.potion),lang,details)} backpackCapacity={backpack.data?.capacity??d?.backpack?.capacity} backpackOccupied={backpack.data?.occupied}
  potions={warehouseItems(stacks.filter(s=>s.potion),lang,details)} potionCapacity={backpack.data?.potionCapacity??d?.backpack?.potionCapacity}
  onWorldOpenChange={setWorldOpen} locations={locations} status={status} worldStatus={worldStatus} noHero={!!d&&!d.backpack} transferBlocked={blocked} onRefresh={reconcile}
  footer={d&&!state.isError?<CellUpgrade ru={ru} data={d} services={services}/>:undefined} onBack={()=>onBack?.()} onShow={onShowCell?w=>onShowCell(w.q,w.r):undefined}
  onMove={move} onUse={use} onInfo={loadInfo}
  extra={<HeroItemsSection lang={lang} disabled={upgradePending} onShow={onShowCell}/>}/></div>;
}
