// Казино на сцене замка: у админа и у построивших. В правке раскладки его нет.
// Построено — заранее грузим автомат (код и счёт), чтобы тап открывал сразу.
import {useEffect,useMemo} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getCastleCasino} from '@/server/api/slot/castle-casino';
import {prefetchSlot} from '@/lib/slot/prefetchSlot';
import {casinoBuilding} from './modularCasino';
import type {SceneBuilding} from './modularCastleLayout';

export const CASTLE_CASINO_KEY=['castle-casino'] as const;

export function useWithCasino(list:SceneBuilding[],editing:boolean):SceneBuilding[]{
 const qc=useQueryClient();
 const q=useQuery({queryKey:CASTLE_CASINO_KEY,queryFn:()=>getCastleCasino(),staleTime:60_000,retry:1});
 const built=q.data?.built===true;
 useEffect(()=>{if(built)prefetchSlot(qc);},[built,qc]);
 return useMemo(()=>{const c=editing?null:casinoBuilding(built);return c?[...list,c]:list;},[list,editing,built]);
}
