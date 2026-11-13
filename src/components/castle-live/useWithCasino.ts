import {withOwnedLayout} from './modularOwnedLayout';
// Казино на сцене замка: у админа и у построивших. Позиция редактируется и сохраняется в раскладке.
// Построено — заранее грузим автомат (код и счёт), чтобы тап открывал сразу.
import {useEffect,useMemo} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getCastleCasino} from '@/server/api/slot/castle-casino';
import {prefetchSlot} from '@/lib/slot/prefetchSlot';
import {casinoBuilding} from './modularCasino';
import type {SceneBuilding} from './modularCastleLayout';

export const CASTLE_CASINO_KEY=['castle-casino'] as const;

export function useWithCasino(list:SceneBuilding[],_editing:boolean):SceneBuilding[]{
 const qc=useQueryClient();
 const q=useQuery({queryKey:CASTLE_CASINO_KEY,queryFn:()=>getCastleCasino(),staleTime:60_000,retry:1});
 const built=q.data?.built===true;
 // Админу казино дано, а не куплено (владелец, 06.11.2026: «куда оно пропало?»): без своей
 // раскладки оно ждало ручной расстановки и на площади не стояло — ставим на его место.
 const admin=q.data?.admin===true;
 useEffect(()=>{if(built)prefetchSlot(qc);},[built,qc]);
 return useMemo(()=>withOwnedLayout(list,'casino',casinoBuilding(built),admin),[list,built,admin]);
}
