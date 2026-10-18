// Аукционный дом игрока на сцене замка: только у построивших, облик по уровню.
// В правке раскладки его нет — раскладка его не сохраняет. Картинка не держит
// загрузку замка (useModularCastleImages): дом появится, как догрузится.
import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getAuctionHouse} from '@/server/api/game-auction';
import {HOUSE_KEY} from '@/components/chips/auctions/auctionRefresh';
import {auctionHouseBuilding} from './modularAuctionHouse';
import type {SceneBuilding} from './modularCastleLayout';

export function useWithAuctionHouse(list:SceneBuilding[],editing:boolean):SceneBuilding[]{
 const house=useQuery({queryKey:HOUSE_KEY,queryFn:()=>getAuctionHouse(),staleTime:60_000,retry:1});
 const level=house.data?.level??0;
 return useMemo(()=>{const auction=editing?null:auctionHouseBuilding(level);return auction?[...list,auction]:list;},[list,editing,level]);
}
