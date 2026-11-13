import {useMemo} from 'react';
import {useQuery,type QueryClient} from '@tanstack/react-query';
import {getNewspaperKioskOwned} from '@/server/api/newspaper-kiosk/kiosk-own';
import {withOwnedLayout} from './modularOwnedLayout';
import {NEWSPAPER_KIOSK_BUILDING_ID,newspaperKioskBuilding} from './modularNewspaperKiosk';
import type {SceneBuilding} from './modularCastleLayout';

export const NEWSPAPER_KIOSK_OWNED_KEY=['newspaper-kiosk','owned'] as const;
export function refreshNewspaperKiosk(qc:QueryClient):void{
 void qc.invalidateQueries({queryKey:NEWSPAPER_KIOSK_OWNED_KEY});
}
export function useWithNewspaperKiosk(list:SceneBuilding[]):SceneBuilding[]{
 const q=useQuery({queryKey:NEWSPAPER_KIOSK_OWNED_KEY,queryFn:()=>getNewspaperKioskOwned(),staleTime:60_000,retry:1});
 const owned=q.data?.owned===true;
 return useMemo(()=>withOwnedLayout(list,NEWSPAPER_KIOSK_BUILDING_ID,newspaperKioskBuilding(owned)),[list,owned]);
}
