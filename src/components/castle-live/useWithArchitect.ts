import {withOwnedLayout} from './modularOwnedLayout';
// Архитектор на сцене замка: у построивших. Положение сохраняется редактором.
import {useMemo} from 'react';
import {useQuery,type QueryClient} from '@tanstack/react-query';
import {RESOURCES_KEY,useResources} from '@/lib/hooks/useResources';
import {getCastleArchitect} from '@/server/api/castle-architect/architect-state';
import {architectBuilding} from './modularArchitect';
import type {SceneBuilding} from './modularCastleLayout';

export const ARCHITECT_KEY=['castle-architect'] as const;

/** После постройки, улучшения и заготовки: Архитектор, ресурсы и рюкзак — без F5. */
export function refreshArchitectData(qc:QueryClient):void{
 void qc.invalidateQueries({queryKey:ARCHITECT_KEY});
 void qc.invalidateQueries({queryKey:RESOURCES_KEY,refetchType:'all'});
 void qc.invalidateQueries({queryKey:['my-hero-backpack'],refetchType:'all'});
}

export function useCastleArchitect(){
 return useQuery({queryKey:ARCHITECT_KEY,queryFn:()=>getCastleArchitect(),staleTime:60_000,retry:1});
}

/**
 * Ресурсы для «хватает ли» (карточка, окно, строки заготовок): общий кэш
 * RESOURCES_KEY — его обновляют банк, лавки и шахты. Снимок Архитектора ниже
 * жил своей минутой, и после обмена в банке цена ещё горела красным.
 * Снимок — только пока общий кэш не пришёл.
 */
export function useArchitectResources(snapshot?:Record<string,number>):Record<string,number>{
 return useResources().data??snapshot??{};
}

export function useWithArchitect(list:SceneBuilding[],_editing:boolean):SceneBuilding[]{
 const level=useCastleArchitect().data?.level??0;
 return useMemo(()=>withOwnedLayout(list,'architect',architectBuilding(level)),[list,level]);
}

