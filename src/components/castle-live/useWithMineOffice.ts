import {withOwnedLayout} from './modularOwnedLayout';
// «Управление шахтами»: есть ли здание (иконка у «Добычи», облик на площади).
// После покупки в Ратуше ключ инвалидируется — иконка и здание появляются
// без F5 (refreshMineOffice).
import {useMemo} from 'react';
import {useQuery,type QueryClient} from '@tanstack/react-query';
import {getMineOffice} from '@/server/api/mine-office/mine-office-own';
import {mineOfficeBuilding} from './modularMineOffice';
import {MINE_OFFICE_KEY} from '@/lib/mineOfficeBus';
import type {SceneBuilding} from './modularCastleLayout';

export {MINE_OFFICE_KEY};
export const MINE_OFFICE_OWNED_KEY=[...MINE_OFFICE_KEY,'owned'] as const;

export function refreshMineOffice(qc:QueryClient):void{
 void qc.invalidateQueries({queryKey:MINE_OFFICE_KEY});
}

export function useMineOfficeOwned():boolean{
 const q=useQuery({queryKey:MINE_OFFICE_OWNED_KEY,queryFn:()=>getMineOffice(),staleTime:60_000,retry:1});
 return q.data?.owned===true;
}

export function useWithMineOffice(list:SceneBuilding[],_editing:boolean):SceneBuilding[]{
 const owned=useMineOfficeOwned();
 return useMemo(()=>withOwnedLayout(list,'mine_office',mineOfficeBuilding(owned)),[list,owned]);
}
