import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { thumb } from '@/lib/image';
import { freeCanvas } from '../freeCanvas';
import { atlasSide, loadTerrainImage, startAtlas, type ImageLoad } from './atlasBuild';
import { landscapeStamp, terrainLookup, useStable } from './stableInputs';
import type { TerrainGeometry, Landscape } from './terrainGeometry';
import type { MapView } from './mapViewport';
import { midgardWaterSparseUrl, registerMidgardWater } from '../world-art/midgardWater';
/** Картинка ландшафта и рамка, в которой она испечена (только разведанные клетки). */
type Atlas = { surface: HTMLCanvasElement; geometry: TerrainGeometry; partial: boolean };
/**
 * One bounded bitmap of exact revealed cells. Gestures transform the bitmap, not thousands of DOM nodes.
 * Испечена в рамке одних клеток (atlasGeometry), поэтому метки и герой её не пересобирают;
 * живые события карты — тоже (useStable). Закрыли окно — память отдана сразу.
 */
export function StrategicTerrainLayer({geometry,atlasGeometry,landscape,view,ru}:{geometry:TerrainGeometry;atlasGeometry:TerrainGeometry;landscape?:Landscape;view:MapView;ru:boolean}) {
 const canvas=useRef<HTMLCanvasElement>(null),atlas=useRef<Atlas|null>(null),loads=useRef(new Map<string,ImageLoad>());
 const [revision,setRevision]=useState(0),[state,setState]=useState<'loading'|'ready'|'error'>('loading'),[retry,setRetry]=useState(0);
 const terrain=useStable(landscape,landscapeStamp);
 useEffect(()=>{
  const el=canvas.current,pending=loads.current;
  return ()=>{freeCanvas(atlas.current?.surface);atlas.current=null;freeCanvas(el);pending.forEach(l=>l.abort());pending.clear();};
 },[]);
 useEffect(()=>{
  let cancelled=false,stop:(()=>void)|null=null,own:HTMLCanvasElement|null=null;
  // Nothing explored: no picture at all (an empty one still costs megabytes of graphics memory).
  if(!atlasGeometry.cells.length){freeCanvas(atlas.current?.surface);atlas.current=null;setRevision(v=>v+1);setState('ready');return;}
  // Keep the last complete frame while the replacement is built offscreen.
  setState('loading');
  const terrainOf=terrainLookup(terrain),ids=atlasGeometry.cells.map(cell=>terrainOf(cell.key));
  const urls=new Map<string,string>();
  ids.forEach(id=>{const url=id?terrain?.terrains[id]?.imageUrl:null;if(id&&url){
   urls.set(id,thumb(url,128));
   const sparse=midgardWaterSparseUrl(url);if(sparse)urls.set(id+':sparse',thumb(sparse,128));
  }});
  const images=new Map<string,HTMLImageElement>();let failed=false;
  void Promise.all([...urls].map(async([id,url])=>{
   let load=loads.current.get(url);if(!load){load=loadTerrainImage(url);loads.current.set(url,load);}
   const img=await load.promise;
   if(img)images.set(id,img);else{failed=true;loads.current.delete(url);}
  })).then(()=>{
   if(cancelled)return;
   registerMidgardWater(images);
   const surface=document.createElement('canvas');surface.width=surface.height=atlasSide(Math.min(window.screen?.width||window.innerWidth,window.screen?.height||window.innerHeight),window.devicePixelRatio||1);
   // First picture: show it while it is being drawn. Later ones replace the old picture only when complete.
   const first=!atlas.current;
   if(first)atlas.current={surface,geometry:atlasGeometry,partial:true};else own=surface;
   let shown=0;
   stop=startAtlas({surface,geometry:atlasGeometry,terrain:ids,images,budgetMs:8,
    onSlice:first?()=>{const now=performance.now();if(now-shown>120){shown=now;setRevision(v=>v+1);}}:undefined,
    onDone:()=>{
     stop=null;if(cancelled||surface.width===0)return;
     if(atlas.current&&atlas.current.surface!==surface)freeCanvas(atlas.current.surface);
     atlas.current={surface,geometry:atlasGeometry,partial:false};own=null;
     setRevision(v=>v+1);setState(failed?'error':'ready');
    }});
   if(!stop){if(first)atlas.current=null;freeCanvas(surface);own=null;setState('error');}
  });
  return ()=>{cancelled=true;stop?.();freeCanvas(own);};
 },[atlasGeometry,terrain,retry]);
 // Discard retained pixels only if previously visible terrain was revoked.
 useLayoutEffect(()=>{
  const previous=atlas.current;if(!previous||previous.geometry===atlasGeometry)return;
  const visible=new Set(atlasGeometry.cells.map(cell=>cell.key));
  if(previous.geometry.cells.some(cell=>!visible.has(cell.key))){freeCanvas(previous.surface);atlas.current=null;}
 },[atlasGeometry]);
 useLayoutEffect(()=>{
  const el=canvas.current;if(!el)return;
  const paint=()=>{
   const ratio=Math.min(window.devicePixelRatio||1,2);
   const w=Math.max(1,Math.round(el.clientWidth*ratio)),h=Math.max(1,Math.round(el.clientHeight*ratio));
   // Assigning width/height clears the bitmap, even if the size did not change.
   if(el.width!==w)el.width=w;if(el.height!==h)el.height=h;
   const g=el.getContext('2d');if(!g)return;
   g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,w,h);
   const ready=atlas.current;if(!ready||ready.surface.width===0)return;
   const d=Math.min(w,h)/320;
   g.setTransform(d*view.zoom,0,0,d*view.zoom,(w-320*d)/2+(160+view.x-160*view.zoom)*d,(h-320*d)/2+(160+view.y-160*view.zoom)*d);
   // Picture frame → current frame (markers and hero widen the view, not the picture).
   const a=ready.geometry,k=geometry.scale/a.scale;
   g.translate(160-160*k+(a.cx-geometry.cx)*geometry.scale,160-160*k+(a.cy-geometry.cy)*geometry.scale);g.scale(k,k);
   g.drawImage(ready.surface,0,0,320,320);
  };
  paint();const observer=new ResizeObserver(paint);observer.observe(el);return ()=>observer.disconnect();
 },[view,revision,geometry]);
 const building=state==='loading'&&(!atlas.current||atlas.current.partial);
 return <><canvas ref={canvas} className="strategic-map__terrain" aria-hidden="true"/>{(state==='error'||building)&&<div className="strategic-map__terrain-status" role="status">{state==='loading'?(ru?'Загружаем ландшафт…':'Loading terrain…'):<>{ru?'Часть ландшафта не загрузилась.':'Some terrain could not load.'}<button type="button" onClick={()=>setRetry(v=>v+1)}>{ru?'Повторить':'Retry'}</button></>}</div>}</>;
}
