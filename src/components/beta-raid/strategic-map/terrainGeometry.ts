import { axialToPixel, R } from '../hexGeometry';
import type { KeySet } from '../fogMask';
import type { Point } from './mapViewport';
export type Landscape = { cells: Record<string,{terrainId?:string}>; terrains:Record<string,{imageUrl:string|null}> };
export type TerrainCell = Point & { key:string };
/** Exact explored hex centres. No square buckets, sampling or unrevealed terrain. */
export function terrainGeometry(seen:KeySet,marks:Array<{q:number;r:number}>,hero:Point|null,centerQ:number,c0q:number) {
 const cells:TerrainCell[]=[];
 for(const key of seen){const [q,r]=key.split(',').map(Number);if(Number.isFinite(q)&&Number.isFinite(r))cells.push({key,...axialToPixel(q,r,centerQ,c0q)});}
 const extra=marks.map(p=>axialToPixel(p.q,p.r,centerQ,c0q));if(hero)extra.push(hero);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(const p of [...cells,...extra]){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
 if(!Number.isFinite(minX)){minX=maxX=minY=maxY=0;}
 const scale=280/Math.max(maxX-minX+R*2,maxY-minY+R*2),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const fit=(p:Point)=>({x:(p.x-cx)*scale+160,y:(p.y-cy)*scale+160});
 return {cells,fit,scale,cx,cy};
}
export type TerrainGeometry = ReturnType<typeof terrainGeometry>;

