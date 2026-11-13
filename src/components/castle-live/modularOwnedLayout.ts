import {BUILDING_SCALE_MAX,NEW_BUILDING_SIZE} from '@/lib/castlePlacementLimits';
// Saved placement never grants ownership: callers supply the API-approved building.
import {resizeBuilding} from './modularCastleProfiles';
import type {SceneBuilding} from './modularCastleLayout';
import {isOwnedBuilding} from './modularBuildingRegistry';
export const isMovableOwnedBuilding=isOwnedBuilding;
/** autoPlace — не куплено, а дано (казино админа): без сохранённого места встаёт на своё, а не ждёт ручной расстановки. */
export function withOwnedLayout(list:SceneBuilding[],id:string,owned:SceneBuilding|null,autoPlace=false):SceneBuilding[]{
 const rest=list.filter(b=>b.id!==id);
 if(!owned)return rest;
 const saved=list.find(b=>b.id===id);
 const result={...owned,baseSize:owned.size,placed:id==='bank'||autoPlace,caption:{...owned.caption}};
 // Existing saved sizes keep their baseline; newly acquired buildings start at a readable size.
 const baseSize=saved?Math.max(owned.size,saved.baseSize||owned.size):id==='bank'?owned.size:Math.max(owned.size,NEW_BUILDING_SIZE);
 resizeBuilding(result,baseSize);result.baseSize=baseSize;
 if(saved){
  const ratio=saved.size/(saved.baseSize||owned.size);
  resizeBuilding(result,baseSize*Math.max(.5,Math.min(BUILDING_SCALE_MAX,ratio)));
  result.placed=saved.placed!==false;result.x=saved.x;result.y=saved.y;result.mirrored=saved.mirrored;
  result.caption={...saved.caption};result.captionHidden=saved.captionHidden;
 }
 return [...rest,result];
}
/** Keep API-approved objects in the gesture/save list, without adding other hooks' objects. */
export function editableOwnedLayout(stored:SceneBuilding[],visible:SceneBuilding[]):SceneBuilding[]{
 const owned=visible.filter(b=>isMovableOwnedBuilding(b.id));
 return [...stored.map(b=>owned.find(o=>o.id===b.id)||b),...owned.filter(o=>!stored.some(b=>b.id===o.id))];
}

/** Editor only emits visible rows. Preserve dormant placements while ownership loads. */
export function preserveOwnedLayout(next:SceneBuilding[],previous:SceneBuilding[]):SceneBuilding[]{
 return [...next,...previous.filter(b=>isOwnedBuilding(b.id)&&!next.some(n=>n.id===b.id))];
}

