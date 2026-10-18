// Банк на сцене замка: пока только у админов (сервер не-админу отвечает «не видно»).
// В правке раскладки его нет.
import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getCastleBank} from '@/server/api/bank/castle-bank';
import {bankBuilding} from './modularBank';
import type {SceneBuilding} from './modularCastleLayout';

export const CASTLE_BANK_KEY=['castle-bank'] as const;

export function useCastleBank(){
 return useQuery({queryKey:CASTLE_BANK_KEY,queryFn:()=>getCastleBank(),staleTime:60_000,retry:1});
}

export function useWithBank(list:SceneBuilding[],editing:boolean):SceneBuilding[]{
 const visible=useCastleBank().data?.visible===true;
 return useMemo(()=>{const b=editing?null:bankBuilding(visible);return b?[...list,b]:list;},[list,editing,visible]);
}
