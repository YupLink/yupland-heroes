import {CASTLE_PLACEMENT} from '@/lib/castlePlacementLimits';
import {useAccountView} from '@/lib/hooks/useAccountView';
import {roadSegmentShape,type RoadSegment} from './roadSegments';
import {CastlePaths} from './CastlePathLayer';
import {castlePathStyle} from './castlePathStyles';
import {castleTerritoryStyle} from './castleTerritoryStyles';
import {useCastleResidents} from './useCastleResidents';
import {decorCatalog} from './modularDecorCatalog';
import {placementProblem} from './modularPlacement';
import {orientedBuilding,type SceneBuilding} from './modularCastleLayout';
import {useId,useLayoutEffect,useRef} from 'react';
import {shadowPath,type Building} from './modularCastleProfiles';
import {modularCastleAssets as art} from './modularCastleAssets';
import {modularBuildingId} from './modularCastleActions';
import type {modularCastleCamera} from './modularCastleCamera';
const en:Record<string,string[]>={newspaper_kiosk:['Newspaper','kiosk'],buckwheat_game:['Buckwheat','kingdom'],shop:['Trading house'],market:['Market'],hall:['Town hall'],tavern:['Tavern'],temple:['Temple'],training:['Training camp'],warehouse:['Warehouse'],glory:['Glory'],notice:['Tasks'],gates:['Exit to world'],auction:['Auction','house'],casino:['Casino'],bank:['Bank'],architect:['Architect'],mine_office:['Mine','management'],weather_station:['Weather','station'],shaman_hut:['Shaman','hut']};
function Caption({b,scale,ru}:{b:Building;scale:number;ru:boolean}){
 const text=useRef<SVGTextElement>(null),rect=useRef<SVGRectElement>(null);
 const lines=ru?b.lines:(en[b.id]||[b.name]);const font=b.caption.font/scale;
 const height=Math.max(b.caption.height,b.caption.font*(1+(lines.length-1)*1.15)+6)/scale;
 const top=b.size*.01+b.caption.y/scale;
 useLayoutEffect(()=>{const fit=()=>{if(!text.current||!rect.current)return;const width=Math.max(...Array.from(text.current.querySelectorAll('tspan')).map(t=>t.getComputedTextLength()))+16/scale;rect.current.setAttribute('width',String(width));rect.current.setAttribute('x',String(-width/2));};fit();let live=true;void document.fonts.ready.then(()=>{if(live)fit();});return()=>{live=false;};},[scale,b,ru]);
 return <g transform={`translate(${b.caption.x/scale} 0)`} pointerEvents="all" aria-hidden="true"><rect ref={rect} x={-50/scale} y={top} width={100/scale} height={height} rx={3/scale} fill="#172124" fillOpacity=".92" stroke="#bba369" strokeOpacity=".8"/><text ref={text} textAnchor="middle" fontFamily="YupLink Button Russo, Preview Russo, Russo One, sans-serif" fontSize={font} fill="#fff1cf" y={top+(height-font*(1+1.15*(lines.length-1)))/2+font*.8}>{lines.map((line,i)=><tspan key={i} x={0} dy={i?font*1.15:0}>{line}</tspan>)}</text></g>;
}
export function ModularCastleCanvas({camera,ru,onBuilding,buildings,editing,selected,roadDraft,roadEditing=false,roadSegmentsOverride}:{roadSegmentsOverride?:RoadSegment[]|null;roadEditing?:boolean;roadDraft?:{segment:RoadSegment;valid:boolean}|null;buildings:SceneBuilding[];editing:boolean;selected:string;camera:ReturnType<typeof modularCastleCamera>;ru:boolean;onBuilding:(id:string)=>void}){
 const {hideResidents}=useAccountView();const {layer}=useCastleResidents(buildings,editing||hideResidents);
 const selectedObject=buildings.find(b=>b.id===selected);
 const invalidId=editing&&!roadEditing&&selectedObject&&placementProblem(selectedObject,buildings)?selected:undefined;
 const uid=useId().replace(/:/g,'');const gate=buildings.find(b=>b.id==='gates')!;const territory=castleTerritoryStyle(gate.territoryStyle);const gap=gate.size*.39;const left=camera.worldLeft,right=left+camera.worldWidth;const walls=Array.from({length:Math.ceil(camera.worldWidth/700)+3},(_,i)=>Math.floor(left/700)*700-700+i*700);
 // Два слоя: снизу неподвижное (земля, пейзаж, стены, дороги, размытые тени), сверху
 // здания и юпики. Они остаются отдельными SVG, чтобы шаг юпика не перерисовывал
 // размытые тени. Не закрепляем обе большие SVG как GPU-слои: мобильный WebKit
 // может терять верхний слой с постройками при прокрутке карты.
 return <div className="relative" style={{width:camera.width,height:camera.height}}><svg width={camera.width} height={camera.height} viewBox={camera.viewBox} className="block select-none" aria-hidden="true">
 <defs><filter id={`${uid}-cast`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter><filter id={`${uid}-contact`} x="-40%" y="-80%" width="180%" height="260%"><feGaussianBlur stdDeviation="1.1"/></filter><pattern id={`${uid}-ground`} width="384" height="384" patternUnits="userSpaceOnUse"><image href={territory.ground} width="384" height="384"/></pattern><linearGradient id={`${uid}-light`} x1="-800" y1="330" x2="1600" y2="1500" gradientUnits="userSpaceOnUse"><stop stopColor="#ffe3a0" stopOpacity=".45"/><stop offset=".55" stopColor="#e0bf91" stopOpacity=".16"/><stop offset="1" stopColor="#20365b" stopOpacity=".28"/></linearGradient><clipPath id={`${uid}-fence`}><path d={`M${left},-1000H${gate.x-gap}V3000H${left}Z M${gate.x+gap},-1000H${right}V3000H${gate.x+gap}Z`}/></clipPath></defs>
 <rect x={left} y={-camera.top/camera.scale} width={camera.worldWidth} height={camera.worldHeight+camera.top/camera.scale} fill={ `url(#${uid}-ground)`}/>
 <image href={art['exterior-landscape.png']} x={left} y={-camera.top/camera.scale} width={camera.worldWidth} height={territory.groundTop+camera.top/camera.scale} preserveAspectRatio="none"/>
 <rect x={left} y={territory.groundTop} width={camera.worldWidth} height={camera.worldHeight} fill="#283251" opacity=".12"/><rect x={left} y={territory.groundTop} width={camera.worldWidth} height={camera.worldHeight} fill={`url(#${uid}-light)`} opacity={territory.warmth}/>
 <g clipPath={`url(#${uid}-fence)`}><rect x={left} y={territory.groundTop+5} width={camera.worldWidth} height="3" fill="#252c43" opacity=".18" filter={`url(#${uid}-contact)`}/>{walls.map(x=><image key={x} href={territory.wall} x={x} y={territory.wallY} width="800" height="267"/>)}</g>
 <CastlePaths cells={gate.pathCells||[]} routeShape={gate.roadSegments!==undefined||roadSegmentsOverride?roadSegmentShape(roadSegmentsOverride??gate.roadSegments??[]):undefined} width={gate.roadSegments!==undefined?32:undefined} theme={castlePathStyle(gate.roadStyle)}/>{roadDraft&&editing&&<path d={roadSegmentShape([roadDraft.segment])} stroke={roadDraft.valid?'#e5ce96':'#df7770'} strokeWidth={38} opacity={.7} fill="none" pointerEvents="none"/>}<g pointerEvents="none" opacity={roadEditing?.15:1}>{buildings.map(raw=>{const b=orientedBuilding(raw);return <g key={b.id} transform={`translate(${b.x} ${b.y})`}>{b.shadow?<image href={(raw.mirrored?b.shadowFlipped:undefined)||b.shadow} x={-b.size*.625} y={-b.size*(b.anchor+.125)} width={b.size*1.25} height={b.size*1.25}/>:<><path d={shadowPath(b)} fill="#222d48" opacity=".4" filter={`url(#${uid}-cast)`}/><path d={b.volumes.map(v=>'M'+v.base.map(p=>p.join(',')).join('L')+'Z').join(' ')} fill="#182337" stroke="#182337" strokeWidth="3" opacity=".6" filter={`url(#${uid}-contact)`}/></>}</g>;})}</g>
 </svg><svg width={camera.width} height={camera.height} viewBox={camera.viewBox} className="absolute left-0 top-0 block select-none" aria-label={ru?'Карта замка':'Castle map'}>
 <defs><filter id={`${uid}-invalid`} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0.35 0 0 0 0.65 0 0.15 0 0 0 0 0 0.15 0 0 0 0 0 1 0"/></filter></defs>
 {editing&&<rect x={CASTLE_PLACEMENT.left} y={CASTLE_PLACEMENT.back} width={CASTLE_PLACEMENT.right-CASTLE_PLACEMENT.left} height={CASTLE_PLACEMENT.front-CASTLE_PLACEMENT.back} fill="none" stroke="#ffcf4d" strokeOpacity={.65} strokeDasharray="12 10" strokeWidth={2/camera.scale} pointerEvents="none"/>}
 <g ref={layer} opacity={roadEditing?.28:1}>
 {[...buildings].sort((a,b)=>Number(a.id===invalidId)-Number(b.id===invalidId)||a.y-b.y).map(b=><g key={b.id} data-modular-building={b.id} data-depth={b.y} aria-pressed={editing?b.id===selected:undefined} transform={`translate(${b.x} ${b.y})`} role={roadEditing||b.decor&&!editing?'img':'button'} tabIndex={roadEditing||b.decor&&!editing?undefined:0} aria-label={ru?b.name:(en[b.id]||[decorCatalog.find(d=>d.id===b.catalogId)?.en||b.name]).join(' ')} className="cursor-pointer outline-none focus-visible:[&>polygon]:stroke-[#ffe3a0]" onClick={()=>{if(!roadEditing&&(editing||!b.decor))onBuilding(modularBuildingId(b.id));}} onKeyDown={e=>{if(!roadEditing&&(editing||!b.decor)&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onBuilding(modularBuildingId(b.id));}}}>{editing&&!roadEditing&&b.id===selected&&<path d={orientedBuilding(b).volumes.map(v=>'M'+v.base.map(p=>p.join(',')).join('L')+'Z').join(' ')} fill="#ffcf4d" fillOpacity=".10" stroke={b.id===invalidId?'#f17a66':'#ffcf4d'} strokeWidth={2/camera.scale} pointerEvents="none"/>}<image filter={b.id===invalidId?`url(#${uid}-invalid)`:undefined} href={art[b.image]||b.image} x={-b.size/2} y={-b.size*b.anchor} width={b.size} height={b.size} pointerEvents="none" transform={b.mirrored?"scale(-1 1)":undefined}/><polygon points={b.silhouette.split(' ').map(p=>{const[x,y]=p.split(',').map(Number);return `${(b.mirrored?-1:1)*(x-.5)*b.size},${(y-b.anchor)*b.size}`;}).join(' ')} fill="transparent" pointerEvents={roadEditing||b.decor&&!editing?'none':'all'} strokeWidth={2/camera.scale}/>{!roadEditing&&!b.decor&&!b.captionHidden&&<Caption b={b} scale={camera.scale} ru={ru}/>}</g>)}
 </g>
 {roadEditing&&<rect data-road-drawing-surface="" x={left} y={-camera.top/camera.scale} width={camera.worldWidth} height={camera.worldHeight+camera.top/camera.scale} fill="transparent" pointerEvents="all" style={{touchAction:'none',cursor:'crosshair'}} aria-hidden="true"/>}
 </svg></div>;
}

