import {useMemo} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useLang} from '@/lib/i18n';
import {humanError} from '@/lib/humanError';
import {newOpId} from '@/lib/opId';
import {invalidateBackpack,invalidateHeroQueries} from '@/lib/query';
import {getCastleWarehouse,storeToCastleWarehouse,takeFromCastleWarehouse,upgradeCastleWarehouse} from '@/server/api/castle-warehouse';
import {myWarehouses} from '@/server/api/beta-raid/warehouse-mine';
import {getMyBackpack} from '@/server/api/beta-raid/market-backpack-read';
import {applyItemBoost} from '@/server/api/beta-raid/boost-item';
import {WarehouseController} from './WarehouseController';
import type {WarehouseServices} from './warehouseServices';
export function CastleWarehouseWindow({onShowCell,onBack}: {onShowCell?:(q:number,r:number)=>void;onBack:()=>void}) {
 const qc=useQueryClient(); const lang=useLang()==='en'?'en':'ru';
 const services=useMemo<WarehouseServices>(()=>({
  load:()=>getCastleWarehouse(),backpack:()=>getMyBackpack(),world:()=>myWarehouses(),
  store:data=>storeToCastleWarehouse({data}),take:data=>takeFromCastleWarehouse({data}),
  upgrade:fromCells=>upgradeCastleWarehouse({data:{fromCells,opId:newOpId()}}),
  use:async stackKey=>{const result=await applyItemBoost({data:{stackKey,qty:1,op:newOpId()}});invalidateBackpack(qc);invalidateHeroQueries(qc,['beta-raid-state']);return result;},
  error:e=>humanError(e instanceof Error?e:new Error(String(e))),
 }),[qc]);
 return <WarehouseController services={services} lang={lang} onBack={onBack} onShowCell={onShowCell}/>;
}
