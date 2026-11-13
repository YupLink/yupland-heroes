import { axialToPixel, R } from '../hexGeometry';
import type { FogView, KeySet } from '../fogMask';
import type { Point } from './mapViewport';
export type Landscape = { mapId?: string; mapName?: string; artVersion?: string; cells: Record<string,{terrainId?:string}>; terrains:Record<string,{imageUrl:string|null}> };
export type TerrainCell = Point & { key:string };
/** Exact explored hex centres. No square buckets, sampling or unrevealed terrain. */
export function seenCells(seen:KeySet,centerQ:number,c0q:number):TerrainCell[] {
 const cells:TerrainCell[]=[];
 // Fog snapshot of the live map: walk its bits and ready hex centres instead of parsing every "q,r".
 const mask=(seen as Partial<FogView>).mask,store=mask?.store,g=store?.geom;
 if(mask&&store&&g&&g.centerQ===centerQ&&g.c0q===c0q){for(let i=0;i<store.n;i++)if(mask.hasIndex(i))cells.push({key:store.key(i),x:g.x[i],y:g.y[i]});return cells;}
 for(const key of seen){const [q,r]=key.split(',').map(Number);if(Number.isFinite(q)&&Number.isFinite(r))cells.push({key,...axialToPixel(q,r,centerQ,c0q)});}
 return cells;
}
/** Fit cells and extra points (markers, hero) into the 320-unit view. */
export function fitCells(cells:TerrainCell[],extra:Point[]) {
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 const grow=(p:Point)=>{minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);};
 cells.forEach(grow);extra.forEach(grow);
 if(!Number.isFinite(minX)){minX=maxX=minY=maxY=0;}
 const scale=280/Math.max(maxX-minX+R*2,maxY-minY+R*2),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const fit=(p:Point)=>({x:(p.x-cx)*scale+160,y:(p.y-cy)*scale+160});
 return {cells,fit,scale,cx,cy};
}
export type TerrainGeometry = ReturnType<typeof fitCells>;

