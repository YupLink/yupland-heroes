import {elvenDecorAssets} from './elvenDecorAssets';
import {winterDecorAssets} from './winterDecorAssets';
import {infernalDecorAssets} from './infernalDecorAssets';
import {buckwheatDecorAssets} from './buckwheatDecorAssets';
import {celestialDecorAssets} from './celestialDecorAssets';
// Pure catalog construction: the caller retains responsibility for existing access checks.
export function createStyledDecorCatalog<T extends {id:string}>(baseCatalog:readonly T[]){
 const styles=[
  {id:'elven',assets:elvenDecorAssets},
  {id:'winter',assets:winterDecorAssets},
  {id:'infernal',assets:infernalDecorAssets},
  {id:'buckwheat',assets:buckwheatDecorAssets},
  {id:'celestial',assets:celestialDecorAssets}
 ];
 return styles.flatMap(style=>Object.entries(style.assets).map(([baseId,art])=>{
  const base=baseCatalog.find(item=>item.id===baseId);
  if(!base)throw new Error('Missing base decor: '+baseId);
  return {...base,...art,base:art.base as [number,number][],id:style.id+'-'+baseId,style:style.id};
 }));
}
