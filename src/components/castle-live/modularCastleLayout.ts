import {createDecor} from './modularDecorCatalog';
import {originals,resizeBuilding,type Building} from './modularCastleProfiles';
export type SceneBuilding=Building&{captionHidden?:boolean;mirrored?:boolean;baseSize?:number;decor?:boolean;catalogId?:string;pathCells?:[number,number][];roadSegments?:[number,number,number,number][]};
export function decodeModularLayout(saved:unknown):SceneBuilding[]{
 const result:SceneBuilding[]=originals.map(b=>({...b,caption:{...b.caption},volumes:b.volumes.map(v=>({...v,base:v.base.map(p=>[...p] as [number,number])}))}));
 try{if(!Array.isArray(saved))return result;for(const p of saved){if(p.decor===true&&typeof p.id==='string'&&p.id.startsWith('decor:')&&!result.some(b=>b.id===p.id)){const d=createDecor(p.catalogId,p.id,400,850);if(d)result.push(d);}}for(const b of result){const p=saved.find((p:{id:string})=>p.id===b.id);if(!p)continue;const base=originals.find(o=>o.id===b.id)||b;if(Number.isFinite(p.size)&&p.size>=base.size*.5&&p.size<=base.size*1.6)resizeBuilding(b,p.size);if(Number.isFinite(p.x)&&p.x>=-600&&p.x<=1400)b.x=p.x;if(Number.isFinite(p.y)&&p.y>=330&&p.y<=1500)b.y=b.id==='gates'?330:p.y;if(b.id==='gates'&&Array.isArray(p.pathCells))b.pathCells=p.pathCells.filter((c:unknown)=>Array.isArray(c)&&c.length===2&&c.every(n=>Number.isInteger(n)&&Math.abs(n)<=70)).slice(0,1000);if(b.id==='gates'&&Array.isArray(p.roadSegments))b.roadSegments=p.roadSegments.filter((r:unknown)=>Array.isArray(r)&&r.length===4&&r.every(n=>Number.isFinite(n)&&Math.abs(n)<=1600));b.mirrored=p.mirrored===true;b.captionHidden=p.captionHidden===true;if(p.caption&&Object.values(p.caption).every(Number.isFinite)&&Math.abs(p.caption.x)<=240&&Math.abs(p.caption.y)<=240&&p.caption.font>=9.9&&p.caption.font<=32&&p.caption.height>=16&&p.caption.height<=80)b.caption={...p.caption};}}catch{}
 return result;
}
export function loadModularLayout(key:string){try{return decodeModularLayout(JSON.parse(localStorage.getItem(key)||'[]'));}catch{return decodeModularLayout([]);}}
export function serializeModularLayout(buildings:SceneBuilding[]){return buildings.map(({id,x,y,size,caption,captionHidden,mirrored,decor,catalogId,pathCells,roadSegments})=>({id,x,y,size,caption,captionHidden,mirrored,decor,catalogId,pathCells,roadSegments}));}
export function saveModularLayout(key:string,buildings:SceneBuilding[]){localStorage.setItem(key,JSON.stringify(buildings.map(({id,x,y,size,caption,captionHidden,mirrored,decor,catalogId,pathCells,roadSegments})=>({id,x,y,size,caption,captionHidden,mirrored,decor,catalogId,pathCells,roadSegments}))));}
export function orientedBuilding(b:SceneBuilding):SceneBuilding{
 return b.mirrored?{...b,volumes:b.volumes.map(v=>({...v,base:v.base.map(([x,y])=>[-x,y])}))}:b;
}
