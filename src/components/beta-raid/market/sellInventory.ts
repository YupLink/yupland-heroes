import type {MarketItemView} from '@/lib/buildingEffect';
import {artAnyRarity} from './artAnyIcon';
import {heroAnyRarity} from './heroAny';
import {goodAsPrice} from './cartCost';

export type OwnedStock = {count: number | null; loading?: boolean; retryable?: boolean; limited?: boolean};
type Source<T> = {data?: T; isPending: boolean; isError: boolean};
type Stack = {stackKey: string; count: number};
type Art = {templateId: string; rarity: string | null; count: number; wear: number};
type Hero = {templateId: string; itemId: string; rarity: string};
export type SellSources = {
  stacks: Source<{stacks: Stack[]}>;
  arts: Source<Art[]>;
  wornArts: Source<Art[]>;
  heroes: Record<string, Source<Hero[]>>;
  have: (resource: ReturnType<typeof goodAsPrice>['resource'], token: string | null) => number | null;
};
const unknown = (source: {isPending: boolean; isError: boolean}): OwnedStock => ({count: null, loading: source.isPending && !source.isError, retryable: source.isError});

export function ownedStock(it: MarketItemView, s: SellSources): OwnedStock {
  if (it.kind === 'resource') {
    const good = goodAsPrice(it), n = s.have(good.resource, good.token);
    return {count: n != null && Number.isFinite(n) ? Math.max(0, n) : null};
  }
  if (it.kind === 'art') {
    const rarity = artAnyRarity(it.refId);
    const source = rarity ? s.wornArts : s.arts;
    if (source.isError || !source.data) return unknown(source);
    return {count: source.data.filter(a => rarity ? a.rarity === rarity : a.templateId === it.refId).reduce((n,a) => n + a.count, 0)};
  }
  const rarity = it.kind === 'hero' ? heroAnyRarity(it.refId) : null;
  if (rarity) {
    const source = s.heroes[rarity];
    if (!source || source.isError || !source.data) return unknown(source ?? {isPending: false, isError: true});
    return {count: source.data.length, limited: source.data.length >= 200};
  }
  if (s.stacks.isError || !s.stacks.data || !it.refId) return unknown(s.stacks);
  const matches = s.stacks.data.stacks.filter(v => v.stackKey === `${it.kind}:${it.refId}`);
  // Ownership is the stack actually returned by the existing backpack query.
  // Do not infer aliases or turn an absent/unverified stack into a reported zero.
  if (!matches.length) return {count: null};
  return {count: matches.reduce((n,v) => n + Math.max(0,v.count), 0)};
}

export const canSellOwned = (it: MarketItemView, stock: OwnedStock) =>
  stock.count != null && stock.count >= it.giveAmount && it.giveAmount > 0 && it.buyable && (it.remaining == null || it.remaining >= 1);

/** Owns some of this item, independent of the shop's remaining buyout or bundle size. */
export const hasOwnedStock = (stock: OwnedStock) => stock.count != null && stock.count > 0;
