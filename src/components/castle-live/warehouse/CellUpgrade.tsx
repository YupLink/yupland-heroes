import {useMutation,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {marketResourceIconSrc} from '@/lib/resourceIcons';
import type {WarehouseData,WarehouseServices} from './warehouseServices';
import {WarehouseUpgradeCost} from './WarehouseUpgradeCost';
const labels:Record<string,[string,string]>={wood:['Древесина','Wood'],stone:['Камень','Stone'],gold:['Золото','Gold'],diamonds:['Алмазы','Diamonds']};
export function CellUpgrade({ru,data:d,services}:{ru:boolean;data:WarehouseData;services:WarehouseServices}) {
 const qc=useQueryClient();
 const up=useMutation({mutationKey:['castle-warehouse-upgrade'],mutationFn:(from:number)=>services.upgrade(from),onSuccess:async r=>{toast.success(ru?`Ячеек: ${r.cells}`:`Cells: ${r.cells}`);await Promise.all([['castle-warehouse'],['my-resources']].map(queryKey=>qc.invalidateQueries({queryKey})));},onError:e=>toast.error(services.error(e))});
 const cost=d.nextCost;
 return <WarehouseUpgradeCost ru={ru} ready={cost!==null&&d.ownCells<d.maxCells} pending={up.isPending}
  resources={Object.entries(cost??{}).filter(([,n])=>n>0).map(([id,n])=>({id,name:labels[id]?.[ru?0:1]??id,image:marketResourceIconSrc(id)??undefined,cost:n,available:d.resources[id]??0}))}
  error={up.isError?services.error(up.error):undefined} onUpgrade={()=>up.mutate(d.ownCells)}/>;
}
