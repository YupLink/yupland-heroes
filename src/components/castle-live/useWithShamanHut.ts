// «Хижина шаманов»: есть ли здание (иконка у «Добычи», облик на площади).
// После покупки в Ратуше ключ инвалидируется — иконка и здание появляются
// без F5 (refreshShamanHut).
import {useMemo} from 'react';
import {useQuery,type QueryClient} from '@tanstack/react-query';
import {getShamanHutOwned} from '@/server/api/shaman-hut/shaman-own';
import {SHAMAN_HUT_KEY} from '@/lib/shamanHutBus';
import {withOwnedLayout} from './modularOwnedLayout';
import {SHAMAN_HUT_BUILDING_ID,shamanHutBuilding} from './modularShamanHut';
import type {SceneBuilding} from './modularCastleLayout';

export const SHAMAN_HUT_OWNED_KEY=[...SHAMAN_HUT_KEY,'owned'] as const;

export function refreshShamanHut(qc:QueryClient):void{
 void qc.invalidateQueries({queryKey:SHAMAN_HUT_KEY});
}

export function useShamanHutOwned():boolean{
 const q=useQuery({queryKey:SHAMAN_HUT_OWNED_KEY,queryFn:()=>getShamanHutOwned(),staleTime:60_000,retry:1});
 return q.data?.owned===true;
}

export function useWithShamanHut(list:SceneBuilding[]):SceneBuilding[]{
 const owned=useShamanHutOwned();
 return useMemo(()=>withOwnedLayout(list,SHAMAN_HUT_BUILDING_ID,shamanHutBuilding(owned)),[list,owned]);
}
