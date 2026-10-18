import {useEffect,useRef,useState} from 'react';
import {modularCastleAssets} from './modularCastleAssets';
import type {SceneBuilding} from './modularCastleLayout';
import {noteCastleArt} from '@/components/game/settleSignals';
export function useModularCastleImages(buildings:SceneBuilding[]){
 const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
 const [attempt,setAttempt]=useState(0),ready=useRef(new Set<string>());
 const decorKey=buildings.filter(b=>b.decor).map(b=>b.image).sort().join('|');
 useEffect(()=>{
  let live=true;
  const urls=[...new Set([...Object.values(modularCastleAssets),...decorKey.split('|').filter(Boolean)])].filter(src=>!ready.current.has(src));
  if(!urls.length){noteCastleArt();setState('ready');return;}
  setState('loading');const images:HTMLImageElement[]=[];
  Promise.all(urls.map(src=>new Promise<void>((resolve,reject)=>{
   const image=new Image();images.push(image);
   image.onload=()=>{void Promise.resolve().then(()=>typeof image.decode==='function'?image.decode():undefined).then(resolve,reject);};
   image.onerror=()=>reject(new Error('Castle image unavailable'));image.src=src;
  }))).then(()=>{noteCastleArt();if(live){urls.forEach(src=>ready.current.add(src));setState('ready');}},()=>{noteCastleArt();if(live)setState('error');});
  return()=>{live=false;images.forEach(image=>{image.onload=null;image.onerror=null;});};
 },[attempt,decorKey]);
 return {state,attempt,retry:()=>setAttempt(n=>n+1)};
}
