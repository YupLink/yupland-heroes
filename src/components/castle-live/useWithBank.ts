import {withOwnedLayout} from './modularOwnedLayout';
// Банк на сцене замка: с 21.10.2026 (владелец) у всех построен сразу.
// Положение сохраняется общим редактором замка.
import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getCastleBank} from '@/server/api/bank/castle-bank';
import {bankBuilding} from './modularBank';
import {CASTLE_BANK_KEY} from './bank/bankKeys';
import type {SceneBuilding} from './modularCastleLayout';

export {CASTLE_BANK_KEY};

export function useCastleBank(){
 return useQuery({queryKey:CASTLE_BANK_KEY,queryFn:()=>getCastleBank(),staleTime:60_000,retry:1});
}

export function useWithBank(list:SceneBuilding[],_editing:boolean):SceneBuilding[]{
 return useMemo(()=>withOwnedLayout(list,'bank',bankBuilding(true)),[list]);
}

