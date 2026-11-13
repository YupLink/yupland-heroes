import {useQueries, useQuery} from '@tanstack/react-query';
import type {MarketItemView} from '@/lib/buildingEffect';
import {getMyBackpack} from '@/server/api/beta-raid/market-backpack-read';
import {listSellableArtifacts} from '@/server/api/beta-raid/artifacts-sellable';
import {listSellableHeroes} from '@/server/api/beta-raid/heroes-sellable';
import {usePlayerFunds} from './usePlayerFunds';
import {artAnyRarity} from './artAnyIcon';
import {heroAnyRarity} from './heroAny';
import {ownedStock} from './sellInventory';

export function useSellInventory(items: MarketItemView[], enabled: boolean) {
  const have = usePlayerFunds();
  const stacks = useQuery({queryKey: ['my-hero-backpack'], queryFn: () => getMyBackpack(), enabled, staleTime: 30_000});
  const arts = useQuery({queryKey: ['sellable-arts', 'all'], queryFn: () => listSellableArtifacts({data: {}}),
    enabled: enabled && items.some(it => it.kind === 'art' && !artAnyRarity(it.refId)), staleTime: 30_000});
  const wornArts = useQuery({queryKey: ['sellable-arts', 'owned-worn'], queryFn: () => listSellableArtifacts({data: {worn: true}}),
    enabled: enabled && items.some(it => it.kind === 'art' && !!artAnyRarity(it.refId)), staleTime: 30_000});
  const rarities = ['common', 'rare', 'epic', 'legendary'] as const;
  const queries = useQueries({queries: rarities.map(rarity => ({queryKey: ['sellable-heroes', rarity],
    queryFn: () => listSellableHeroes({data: {rarity}}), staleTime: 30_000,
    enabled: enabled && items.some(it => it.kind === 'hero' && heroAnyRarity(it.refId) === rarity)}))});
  const heroes = Object.fromEntries(rarities.map((rarity,i) => [rarity, queries[i]]));
  return {get: (it: MarketItemView) => ownedStock(it, {have, stacks, arts, wornArts, heroes}),
    retry: () => {void stacks.refetch(); if(items.some(it=>it.kind==='art'&&!artAnyRarity(it.refId)))void arts.refetch(); if(items.some(it=>it.kind==='art'&&!!artAnyRarity(it.refId)))void wornArts.refetch(); queries.forEach((q,i) => {if(items.some(it=>it.kind==='hero'&&heroAnyRarity(it.refId)===rarities[i]))void q.refetch();});}};
}
