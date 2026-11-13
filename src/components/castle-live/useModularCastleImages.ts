import {castlePathStyle} from './castlePathStyles';
import {castleTerritoryStyle} from './castleTerritoryStyles';
import {useEffect,useRef,useState} from 'react';
import {modularCastleAssets} from './modularCastleAssets';
import type {SceneBuilding} from './modularCastleLayout';
import {noteCastleArt} from '@/components/game/settleSignals';
import {preloadCastleImage} from './preloadCastleImage';
// Ошибка — только если не пришла ни одна картинка (нет сети): без одной-двух сцена
// открывается (04.11.2026), недошедшие догружаются при следующем проходе.
export function useModularCastleImages(buildings:SceneBuilding[]){
 const [state,setState]=useState<'loading'|'ready'|'error'>('loading');
 const [attempt,setAttempt]=useState(0),ready=useRef(new Set<string>());
 const gate=buildings.find(b=>b.id==='gates'),territory=castleTerritoryStyle(gate?.territoryStyle);
 // Только то, что сцена рисует (04.11.2026): облик постройки и одна её тень (зеркальная —
 // у зеркальных, как в ModularCastleCanvas), а не все базовые картинки и обе тени.
 const decorKey=buildings.flatMap(b=>[modularCastleAssets[b.image]||b.image,(b.mirrored&&b.shadowFlipped)||b.shadow].filter((s):s is string=>!!s)).concat(modularCastleAssets['exterior-landscape.png'],castlePathStyle(gate?.roadStyle).texture,territory.ground,territory.wall).sort().join('|');
 useEffect(()=>{
  let live=true;
  const urls=[...new Set(decorKey.split('|').filter(Boolean))].filter(src=>!ready.current.has(src));
  if(!urls.length){noteCastleArt();setState('ready');return;}
  setState('loading');const images:HTMLImageElement[]=[];
  Promise.all(urls.map(src=>preloadCastleImage(src,image=>images.push(image),()=>live))).then(ok=>{
   noteCastleArt();if(!live)return;
   urls.forEach((src,i)=>{if(ok[i])ready.current.add(src);});
   setState(ok.some(Boolean)?'ready':'error');
  });
  return()=>{live=false;images.forEach(image=>{image.onload=null;image.onerror=null;});};
 },[attempt,decorKey]);
 return {state,attempt,retry:()=>setAttempt(n=>n+1)};
}
