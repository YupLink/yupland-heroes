import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { thumb } from '@/lib/image';
import { HexTileCache, TILE_DRAW_H, TILE_DRAW_W } from '../hexTileCache';
import { hexPath2D } from '../hexGeometry';
import type { TerrainGeometry, Landscape } from './terrainGeometry';
import type { MapView } from './mapViewport';
const RESOLUTION=2048;
/** One bounded bitmap of exact revealed cells. Gestures transform the bitmap, not thousands of DOM nodes. */
export function StrategicTerrainLayer({geometry,landscape,view,ru}:{geometry:TerrainGeometry;landscape?:Landscape;view:MapView;ru:boolean}) {
 const canvas=useRef<HTMLCanvasElement>(null),atlas=useRef<{surface:HTMLCanvasElement;geometry:TerrainGeometry}|null>(null);
 const [revision,setRevision]=useState(0),[state,setState]=useState<'loading'|'ready'|'error'>('loading'),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let cancelled=false,frame=0;const pending:HTMLImageElement[]=[];const cleanups:Array<()=>void>=[];
  // Keep the last complete frame while the replacement is built offscreen.
  setState('loading');
  const build=async()=>{
   const urls=new Map<string,string>();
   for(const cell of geometry.cells){const id=landscape?.cells[cell.key]?.terrainId;const url=id?landscape?.terrains[id]?.imageUrl:null;if(id&&url)urls.set(id,thumb(url,128));}
   const images=new Map<string,HTMLImageElement>();let failed=false;
   await Promise.all([...urls].map(([id,url])=>new Promise<void>(resolve=>{
    const img=new Image();pending.push(img);let done=false;
    const finish=(ok:boolean)=>{if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;if(ok)images.set(id,img);else failed=true;resolve();};
    const timer=setTimeout(()=>finish(false),15000);cleanups.push(()=>{clearTimeout(timer);finish(false);});
    img.onload=()=>finish(true);img.onerror=()=>finish(false);img.src=url;
   })));
   if(cancelled)return;
   const surface=document.createElement('canvas');surface.width=surface.height=RESOLUTION;
   const g=surface.getContext('2d');if(!g){setState('error');return;}
   const tiles=new HexTileCache(),hex=hexPath2D();const density=RESOLUTION/320;let index=0;
   const batch=()=>{
    if(cancelled)return;
    const end=Math.min(index+2500,geometry.cells.length);
    for(;index<end;index++){
     const cell=geometry.cells[index],p=geometry.fit(cell),s=geometry.scale*density;
     g.setTransform(s,0,0,s,p.x*density,p.y*density);
     const id=landscape?.cells[cell.key]?.terrainId;const tile=id?tiles.get(id,images.get(id)):null;
     if(tile)g.drawImage(tile,-TILE_DRAW_W/2,-TILE_DRAW_H/2,TILE_DRAW_W,TILE_DRAW_H);
     else {g.fillStyle='#34483d';g.fill(hex);}
     g.strokeStyle='rgba(18,30,24,.25)';g.lineWidth=1;g.stroke(hex);
    }
    if(index<geometry.cells.length)frame=requestAnimationFrame(batch);
    else {atlas.current={surface,geometry};setRevision(v=>v+1);setState(failed?'error':'ready');tiles.clear();}
   };
   frame=requestAnimationFrame(batch);
  };
  void build();
  return ()=>{cancelled=true;cancelAnimationFrame(frame);cleanups.forEach(f=>f());pending.forEach(img=>{img.onload=img.onerror=null;});};
 },[geometry,landscape,retry]);
 // Discard retained pixels only if previously visible terrain was revoked.
 useLayoutEffect(()=>{
  const previous=atlas.current;if(!previous||previous.geometry===geometry)return;
  const visible=new Set(geometry.cells.map(cell=>cell.key));
  if(previous.geometry.cells.some(cell=>!visible.has(cell.key)))atlas.current=null;
 },[geometry]);
 useLayoutEffect(()=>{
  const el=canvas.current;if(!el)return;
  const paint=()=>{
   const ratio=Math.min(window.devicePixelRatio||1,2);
   const w=Math.max(1,Math.round(el.clientWidth*ratio)),h=Math.max(1,Math.round(el.clientHeight*ratio));
   // Assigning width/height clears the bitmap, even if the size did not change.
   if(el.width!==w)el.width=w;if(el.height!==h)el.height=h;
   const g=el.getContext('2d');if(!g)return;
   g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);
   const ready=atlas.current;if(!ready)return;
   const d=Math.min(w,h)/320;
   g.setTransform(d*view.zoom,0,0,d*view.zoom,(w-320*d)/2+(160+view.x-160*view.zoom)*d,(h-320*d)/2+(160+view.y-160*view.zoom)*d);
   // Keep the retained image aligned with markers if map bounds changed.
   const oldAnchor=ready.geometry.cells[0];
   const newAnchor=oldAnchor?geometry.cells.find(cell=>cell.key===oldAnchor.key):undefined;
   if(oldAnchor&&newAnchor){
    const scale=geometry.scale/ready.geometry.scale;
    const from=ready.geometry.fit(oldAnchor),to=geometry.fit(newAnchor);
    g.translate(to.x-from.x*scale,to.y-from.y*scale);g.scale(scale,scale);
   }
   g.drawImage(ready.surface,0,0,320,320);
  };
  paint();const observer=new ResizeObserver(paint);observer.observe(el);return ()=>observer.disconnect();
 },[view,revision,geometry]);
 return <><canvas ref={canvas} className="strategic-map__terrain" aria-hidden="true"/>{(state==='error'||(state==='loading'&&!atlas.current))&&<div className="strategic-map__terrain-status" role="status">{state==='loading'?(ru?'Загружаем ландшафт…':'Loading terrain…'):<>{ru?'Часть ландшафта не загрузилась.':'Some terrain could not load.'}<button type="button" onClick={()=>setRetry(v=>v+1)}>{ru?'Повторить':'Retry'}</button></>}</div>}</>;
}
