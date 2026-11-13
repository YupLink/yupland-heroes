import type { Landscape } from './terrainGeometry';
export type StrategicKind = 'warehouse' | 'mine' | 'farm' | 'castle' | 'worldPortal';
export type StrategicPoint = { q: number; r: number; kind: StrategicKind; to?: string[]; alsoHere?: boolean };
type At = { q: number; r: number };
/** Only personal sources: a public field's occupied slots do not imply ownership. */
export function strategicPoints(warehouses: Array<At & { items: Array<{ count: number }> }>, mines: At[], fields: At[]): StrategicPoint[] {
  const unique = new Map<string, StrategicPoint>();
  const add = (kind: StrategicKind, p: At) => { if (Number.isFinite(p.q) && Number.isFinite(p.r)) unique.set(`${kind}:${p.q},${p.r}`, { ...p, kind }); };
  warehouses.filter(w => w.items.some(i => i.count > 0)).forEach(p => add('warehouse', p));
  mines.forEach(p => add('mine', p)); fields.forEach(p => add('farm', p));
  return [...unique.values()];
}

/** Harvest spans all worlds and includes lost mines awaiting collection.
 * Neither is a personal location on the currently displayed world. */
export function personalStrategicPoints(
  mapId: string | null,
  warehouses: Array<At & { items: Array<{ count: number }> }>,
  mines: Array<At & { mapId?: string; lost?: unknown }>,
  fields: Array<At & { mapId?: string }>,
): StrategicPoint[] {
  if (!mapId) return [];
  return strategicPoints(
    warehouses,
    mines.filter(p => p.mapId === mapId && !p.lost),
    fields.filter(p => p.mapId === mapId),
  );
}

/** Detailed markers supplied only by an authorized world-map response. */
export type DetailKind = 'warehouse'|'mine'|'farm'|'castle'|'portal'|'worldPortal'|'town'|'shop'|'tavern'|'shipyard'|'watchtower'|'sign'|'university'|'museum'|'chambers'|'boost'|'spellbook'|'oblivion'|'leveltree'|'tournament'|'treasure'|'other';
export type DetailPoint = {q:number;r:number;kind:DetailKind;to?:string[];alsoHere?:boolean};
export type DetailMap = {access:boolean;points:DetailPoint[];preferenceKey:string;state?:'loading'|'error'|'ready';onRetry?:()=>void;terrain?:{seen:Set<string>;landscape:Landscape};all?:boolean;mode?:'seen'|'all';onMode?:(mode:'seen'|'all')=>void};
export type MapTab = 'personal'|'detail';
export function preferredMap(key?:string):MapTab {
  if(!key)return 'personal';
  try{return localStorage.getItem(key)==='detail'?'detail':'personal';}catch{return 'personal';}
}
/** Cluster only screen-near markers; filtering is done before grouping. */
export function groupMapPoints(points:DetailPoint[],project:(p:DetailPoint)=>{x:number;y:number},size:number){
 const groups=new Map<string,{x:number;y:number;points:DetailPoint[]}>();
 for(const p of points){const at=project(p),key=`${Math.floor(at.x/size)}:${Math.floor(at.y/size)}`;const group=groups.get(key);if(group){const n=group.points.length;group.x=(group.x*n+at.x)/(n+1);group.y=(group.y*n+at.y)/(n+1);group.points.push(p);}else groups.set(key,{...at,points:[p]});}
 return [...groups.values()];
}

