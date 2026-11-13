import type {SceneBuilding} from './modularCastleLayout';
export const appearanceStyles=['base','elven','winter','infernal','buckwheat','celestial'] as const;
export const appearanceNames=['Базовый','Эльфийский','Зимний','Адский','Гречневый','Небесный'] as const;
const themedItems=['bench','bench-corner','lamp','tree','flowerbed-round','fountain'];
const baseItems=[...themedItems,'lamp-low','stone-vase','barrels','crates','flowerbed-long','flowerbed-shrubs','hedge','flagpole','flower-cart','well','coat-of-arms','statue'];
export function appearanceKind(name:string){const i=appearanceNames.indexOf(name as typeof appearanceNames[number]);return i<0?null:`appearance:${appearanceStyles[i]}`;}
export function castleAppearanceAccess(owned:readonly string[]=[],isAdmin=false){
 if(isAdmin)return {
  decor:new Set([...baseItems,...appearanceStyles.slice(1).flatMap(s=>themedItems.map(i=>`${s}-${i}`))]),
  buildingStyles:[...appearanceStyles],roadStyles:[...appearanceStyles],territoryStyles:[...appearanceStyles],
 };
 const purchases=new Set(owned);
 const bundles=appearanceStyles.filter(s=>purchases.has(`appearance:${s}`));
 const decor=new Set(owned.filter(k=>baseItems.includes(k)||appearanceStyles.slice(1).some(s=>themedItems.some(i=>k===`${s}-${i}`))));
 for(const s of bundles)for(const i of themedItems)decor.add(s==='base'?i:`${s}-${i}`);
 const buildingStyles=['base',...bundles.filter(s=>s!=='base')];
 const roadStyles:string[]=appearanceStyles.filter(s=>bundles.includes(s)||purchases.has(`road:${s}`));
 const territoryStyles:string[]=appearanceStyles.filter(s=>bundles.includes(s)||purchases.has(`territory:${s}`));
 return {decor,buildingStyles,roadStyles,territoryStyles};
}
export type AppearanceAccess=ReturnType<typeof castleAppearanceAccess>;
export function visibleAppearance(buildings:SceneBuilding[],a:AppearanceAccess){return buildings.filter(b=>!b.decor||!!b.catalogId&&a.decor.has(b.catalogId)).map(b=>b.id==='gates'?{...b,buildingStyle:a.buildingStyles.includes(b.buildingStyle||'base')?b.buildingStyle:'base',roadStyle:a.roadStyles.includes(b.roadStyle||'base')?b.roadStyle:'base',territoryStyle:a.territoryStyles.includes(b.territoryStyle||'base')?b.territoryStyle:'base'}:b);}
/** Preserve hidden saved purchases, but never accept edits to them or new unowned objects. */
export function preserveAppearance(next:SceneBuilding[],previous:SceneBuilding[],a:AppearanceAccess){
 const hidden=previous.filter(b=>b.decor&&(!b.catalogId||!a.decor.has(b.catalogId)));
 const gate=previous.find(b=>b.id==='gates');
 const choice=(value:string|undefined,old:string|undefined,allowed:string[])=>{if(old&&old!=='base'&&!allowed.includes(old)&&(value===undefined||value==='base'))return old;return allowed.length&&(value==='base'||allowed.includes(value||'base'))?value:old;};
 return [...next.filter(b=>!b.decor||!!b.catalogId&&a.decor.has(b.catalogId)).map(b=>b.id==='gates'?{...b,
 buildingStyle:choice(b.buildingStyle,gate?.buildingStyle,a.buildingStyles),
 roadStyle:choice(b.roadStyle,gate?.roadStyle,a.roadStyles),
 territoryStyle:choice(b.territoryStyle,gate?.territoryStyle,a.territoryStyles),
 pathCells:a.roadStyles.length?b.pathCells:gate?.pathCells,roadSegments:a.roadStyles.length?b.roadSegments:gate?.roadSegments}:b),...hidden];
}
