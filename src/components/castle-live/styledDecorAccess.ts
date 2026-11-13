import type {SceneBuilding} from './modularCastleLayout';
import {isStyledDecor} from './decorStyleOptions';
export function visibleStyledLayout(buildings:SceneBuilding[],allowed:boolean){return allowed?buildings:buildings.filter(b=>!isStyledDecor(b.catalogId)).map(b=>b.id==='gates'?{...b,roadStyle:undefined,territoryStyle:undefined,buildingStyle:undefined}:b);}
// Preserve hidden saved items and themes when a non-admin edits their existing layout.
export function preserveStyledLayout(next:SceneBuilding[],previous:SceneBuilding[],allowed:boolean){
 if(allowed)return next;
 const gate=previous.find(b=>b.id==='gates');
 return [...next.filter(b=>!isStyledDecor(b.catalogId)).map(b=>b.id==='gates'?{...b,roadStyle:gate?.roadStyle,territoryStyle:gate?.territoryStyle,buildingStyle:gate?.buildingStyle}:b),...previous.filter(b=>isStyledDecor(b.catalogId))];
}

