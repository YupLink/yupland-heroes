import { useEffect, useMemo, useState, type ReactNode, type ComponentProps, type SVGProps } from 'react';
import { Boxes, Pickaxe, Wheat, Castle, X, Plus, Minus, Maximize, Minimize, SlidersHorizontal, Check, Bookmark, CircleDot, Building2, Store, Beer, Ship, TowerControl, Signpost, GraduationCap, Landmark, Crown, Sparkles, BookOpen, EyeOff, TreePine, Trophy, Gem, MapPin, Shuffle } from 'lucide-react';
import { TavernDialog } from '@/components/castle-live/TavernDialog';
import { BetaRaidMinimap } from '../BetaRaidMinimap';
import { axialToPixel, hexRound, R, SQRT3 } from '../hexGeometry';
import { project, unproject, clampView, zoomAt, type MapView, type Point } from './mapViewport';
import { useMapGestures } from './useMapGestures';
import { preferredMap, groupMapPoints, type StrategicPoint, type DetailPoint, type DetailKind, type DetailMap, type MapTab } from './strategicData';
import { worldArtFor, worldTerrainArt } from '../world-art/worldArt';
import { StrategicTerrainLayer } from './StrategicTerrainLayer';
import { fitCells, seenCells, type Landscape } from './terrainGeometry';
import { keySetStamp, useStable } from './stableInputs';
import './strategic-map.css';
export type StrategicMapProps = ComponentProps<typeof BetaRaidMinimap> & { strategicPoints?: StrategicPoint[]; landscape?: Landscape; detail?: DetailMap };
function WorldPortalIcon({size=24,...props}:SVGProps<SVGSVGElement>&{size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9 10C5 10 2 12 2 14s4.5 3 10 3 10-1.5 10-3-3.5-3.5-7-4M12 13V2M9 5l3-3 3 3M12 20v2"/></svg>;
}
const detailIcons = {warehouse:Boxes,mine:Pickaxe,farm:Wheat,castle:Castle,portal:CircleDot,worldPortal:WorldPortalIcon,town:Building2,shop:Store,tavern:Beer,shipyard:Ship,watchtower:TowerControl,sign:Signpost,university:GraduationCap,museum:Landmark,chambers:Crown,boost:Sparkles,spellbook:BookOpen,oblivion:EyeOff,leveltree:TreePine,tournament:Trophy,treasure:Gem,other:MapPin};
const detailNames:Record<DetailKind,[string,string]>={warehouse:["Склады","Warehouses"],mine:["Шахты","Mines"],farm:["Поля","Fields"],castle:["Замки","Castles"],portal:["Внутримировые порталы","Local portals"],worldPortal:["Межмировые порталы","Interworld portals"],town:["Города","Towns"],shop:["Лавки","Shops"],tavern:["Таверны","Taverns"],shipyard:["Верфи","Shipyards"],watchtower:["Вышки","Watchtowers"],sign:["Указатели","Signs"],university:["Университеты","Universities"],museum:["Музеи","Museums"],chambers:["Покои","Chambers"],boost:["Алтари","Altars"],spellbook:["Столбы заклинаний","Spell pillars"],oblivion:["Забвение","Oblivion"],leveltree:["Деревья уровней","Level trees"],tournament:["Турниры","Tournaments"],treasure:["Клады","Treasures"],other:["Другие объекты","Other objects"]};
const EMPTY_DETAIL:DetailPoint[]=[];
const EMPTY_POINTS: StrategicPoint[] = [];
const icons = { warehouse: Boxes, mine: Pickaxe, farm: Wheat, castle: Castle, worldPortal: WorldPortalIcon };
const names = { warehouse: ['Склады','Warehouses'], mine: ['Шахты','Mines'], farm: ['Фермы','Farms'], castle: ['Мой замок','My castle'], worldPortal: ['Межмировой портал','Interworld portal'] };
export function StrategicMapDialog({ map, ru, view, onView, onClose, status, actions }: { map: StrategicMapProps; status?: ReactNode; actions?: ReactNode; ru: boolean; view: MapView; onView: (v: MapView) => void; onClose: () => void }) {
  const [portalKey,setPortalKey]=useState<string|null>(null);
  const [expanded, setExpanded] = useState(false);
  const detail=map.detail;
  const [tab,setTab]=useState<MapTab>(()=>detail?.access?preferredMap(detail.preferenceKey):'personal');
  const [primary,setPrimary]=useState<MapTab>(()=>preferredMap(detail?.preferenceKey));
  const [filters,setFilters]=useState(false),[hidden,setHidden]=useState<Set<DetailKind>>(()=>new Set());
  const [saveError,setSaveError]=useState(false);
  const [selection,setSelection]=useState<DetailPoint[]>([]);
  const detailed=!!detail?.access&&tab==='detail';
  useEffect(()=>{const saved=preferredMap(detail?.preferenceKey);setPrimary(saved);setTab(detail?.access?saved:'personal');setFilters(false);setSelection([]);setPortalKey(null);},[detail?.access,detail?.preferenceKey,detail?.mode]);
  // Live map events renew the fog snapshot every few seconds; same mask and version = same cells.
  const mapSeen=useStable(map.seen,keySetStamp);
  const shownMap=detailed&&detail?.terrain?{...map,...detail.terrain}:{...map,seen:mapSeen};
  const mapArt=worldArtFor(map.landscape?.mapId,!!map.landscape?.artVersion,map.landscape?.mapName);
  const artLandscape=useMemo(()=>shownMap.landscape ? {...shownMap.landscape,terrains:worldTerrainArt(shownMap.landscape.terrains,mapArt)} : undefined,[shownMap.landscape,mapArt]);
  const detailedPoints=useMemo(()=>detail?.access&&detail.state!=='loading'&&detail.state!=='error'?detail.points.filter(p=>p.kind==='treasure'||(detail.terrain?.seen??mapSeen).has(`${p.q},${p.r}`)):EMPTY_DETAIL,[detail?.access,detail?.points,detail?.state,detail?.terrain,mapSeen]);
  const categories=useMemo(()=>(Object.keys(detailIcons) as DetailKind[]).map(kind=>({kind,count:detailedPoints.filter(p=>p.kind===kind).length})).filter(x=>x.count),[detailedPoints]);
  const filtered=detailedPoints.filter(p=>!hidden.has(p.kind));
  const chooseTab=(next:MapTab)=>{setPortalKey(null);setTab(next);setFilters(false);setSelection([]);setSaveError(false);};
  const choosePrimary=()=>{if(!detail)return;try{localStorage.setItem(detail.preferenceKey,tab);setPrimary(tab);setSaveError(false);}catch{setSaveError(true);}};
  // Personal markers are supplied by the caller. Never infer ownership from public occupancy.
  const marks = map.strategicPoints ?? EMPTY_POINTS;
  const portal=(detailed?filtered:marks).find(p=>p.kind==='worldPortal'&&`${p.q},${p.r}`===portalKey);
  const boundsMarks=useMemo(()=>detailed?detailedPoints:marks,[detailed,detailedPoints,marks]);
  const cells=useMemo(()=>seenCells(shownMap.seen,map.centerQ,map.c0q),[shownMap.seen,map.centerQ,map.c0q]);
  const geometry = useMemo(() => fitCells(cells,[...boundsMarks.map(p=>axialToPixel(p.q,p.r,map.centerQ,map.c0q)),...(map.playerQ!=null&&map.playerR!=null?[axialToPixel(map.playerQ,map.playerR,map.centerQ,map.c0q)]:[])]),[cells,map.centerQ,map.c0q,map.playerQ,map.playerR,boundsMarks]);
  const atlasGeometry=useMemo(()=>fitCells(cells,[]),[cells]);
  const screen=(q:number,r:number) => project(geometry.fit(axialToPixel(q,r,map.centerQ,map.c0q)),view);
  const pick=(q:number,r:number) => {map.onPick(q,r);onClose();};
  const openPoint=(p:DetailPoint)=>{if(p.kind==='worldPortal'){setFilters(false);setSelection([]);setPortalKey(`${p.q},${p.r}`);}else pick(p.q,p.r);};
  const openGroup=(group:{x:number;y:number;points:DetailPoint[]})=>{
    if(group.points.length===1)return openPoint(group.points[0]);
    if(view.zoom>=6||group.points.every(p=>p.q===group.points[0].q&&p.r===group.points[0].r)){setPortalKey(null);setFilters(false);setSelection(group.points);return;}
    onView(zoomAt(view,1.8,group,{x:160,y:160}));
  };
  const tap=(p:Point) => {
    if(detailed){
      const near=groups.map(g=>({g,d:Math.hypot(g.x-p.x,g.y-p.y)})).sort((a,b)=>a.d-b.d)[0];
      if(near&&near.d<22*320/Math.min(gestures.ref.current?.getBoundingClientRect().width||320,gestures.ref.current?.getBoundingClientRect().height||320))return openGroup(near.g);
    }
    const near=(detailed?[]:marks).map(m=>({m,d:Math.hypot(screen(m.q,m.r).x-p.x,screen(m.q,m.r).y-p.y)})).sort((a,b)=>a.d-b.d)[0];
    if(near && near.d<22 * 320 / Math.min(gestures.ref.current?.getBoundingClientRect().width || 320,gestures.ref.current?.getBoundingClientRect().height || 320)) return openPoint(near.m);
    const base=unproject(p,view), px=(base.x-160)/geometry.scale+geometry.cx, py=(base.y-160)/geometry.scale+geometry.cy;
    const rf=py/(1.5*R)+map.c0q, qf=px/(SQRT3*R)-(rf-map.c0q)/2+map.centerQ;
    const h=hexRound(qf,rf);
    if(shownMap.seen.has(`${h.q},${h.r}`)) pick(h.q,h.r);
  };
  const gestures=useMapGestures(view,onView,tap);
  const groups=detailed?groupMapPoints(filtered,p=>screen(p.q,p.r),view.zoom>=6?6:22):[];
  return <TavernDialog title={ru?'Карта':'Map'} onClose={onClose} className={`strategic-map${expanded ? " strategic-map--expanded" : ""}`} style={{borderRadius:expanded?0:18,border:"1px solid #9a824b",background:"radial-gradient(ellipse at 50% 0,#1c1e1e 0,#121516 50%,#101213 100%)",padding:0}} overlayClassName={`strategic-map-overlay${expanded ? " strategic-map-overlay--expanded" : ""}`}>
    <div className="strategic-map__header"><h2>{ru?'Карта':'Map'}</h2><button aria-label={ru?'Свернуть карту':'Close map'} onClick={onClose}><X size={20}/></button></div>
    {detail?.access&&<>
      <div className="strategic-map__tabs" role="tablist" aria-label={ru?'Вид карты':'Map view'}>{(['personal','detail'] as const).map(id=><button key={id} id={`map-tab-${id}`} role="tab" aria-selected={tab===id} aria-controls="map-panel" tabIndex={tab===id?0:-1} onClick={()=>chooseTab(id)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'personal':e.key==='End'?'detail':id==='personal'?'detail':'personal';chooseTab(next);document.getElementById(`map-tab-${next}`)?.focus();}}}>{id==='personal'?(ru?'Моя карта':'My map'):(ru?'Подробная':'Detailed')}{primary===id&&<Bookmark size={12} fill="currentColor" aria-label={ru?'Открывается первой':'Default'}/>}</button>)}</div>
      <div className="strategic-map__tools"><button onClick={choosePrimary} disabled={primary===tab}>{primary===tab?<Check size={14}/>:<Bookmark size={14}/>}<span>{primary===tab?(ru?'Открывается первой':'Opens first'):(ru?'Открывать первой':'Open first')}</span></button>{detailed&&<button onClick={()=>{setPortalKey(null);setSelection([]);setFilters(v=>!v);}} aria-expanded={filters} aria-controls="map-filters"><SlidersHorizontal size={15}/>{ru?'Фильтры':'Filters'}{hidden.size>0&&<span className="strategic-map__filter-count">{categories.filter(c=>!hidden.has(c.kind)).length}</span>}</button>}</div>
      {saveError&&<div role="alert" className="strategic-map__status">{ru?'Не удалось сохранить выбор. Попробуй ещё раз.':'Could not save. Try again.'}</div>}
    </>}
    {detailed&&detail?.all&&<label className="strategic-map__scope">{ru?'Территория':'Area'}<select aria-label={ru?'Территория карты':'Map area'} value={detail.mode??'seen'} onChange={e=>{detail.onMode?.(e.target.value as 'seen'|'all');setSelection([]);}}><option value="seen">{ru?'Разведанное':'Explored'}</option><option value="all">{ru?'Вся карта':'Entire map'}</option></select></label>}
    <div className="strategic-map__viewport" id="map-panel" role={detail?.access?'tabpanel':undefined} aria-labelledby={detail?.access?`map-tab-${detailed?'detail':'personal'}`:undefined}>
      {portal&&<section className="strategic-map__portal" aria-label={ru?'Межмировой портал':'Interworld portal'}>
        <div className="strategic-map__portal-heading">
          <WorldPortalIcon size={26} aria-hidden="true"/>
          <strong>{portal.to?.length===1?(ru?'В мир «':'To “')+portal.to[0]+(ru?'»':'”'):(ru?'Миры назначения':'Destination worlds')}</strong>
          <button aria-label={ru?'Закрыть сведения о портале':'Close portal details'} onClick={()=>setPortalKey(null)}><X size={23} strokeWidth={1.8}/></button>
        </div>
        {(portal.to?.length??0)>1&&<ul className="strategic-map__portal-worlds">{portal.to!.map(name=><li key={name}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m6 0 6 6-6 6-6-6Z" fill="currentColor"/></svg><span>{name}</span></li>)}</ul>}
        {!portal.to?.length&&<p className="strategic-map__portal-unknown">{ru?'Мир назначения пока неизвестен':'Destination world is not known yet'}</p>}
        {(portal.alsoHere||(portal.to?.length??0)>1)&&<div className="strategic-map__portal-random"><Shuffle size={24} strokeWidth={1.8} aria-hidden="true"/><p>{ru?'Выход выбирается случайно.':'The exit is random.'}{portal.alsoHere&&<span>{ru?'Можно попасть и в этот же мир.':'You may also arrive in this world.'}</span>}</p></div>}
        <button className="strategic-map__portal-show" onClick={()=>pick(portal.q,portal.r)}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 1v7m0 8v7M1 12h7m8 0h7"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg><span>{ru?'Показать на карте':'Show on map'}</span></button>
      </section>}
      <StrategicTerrainLayer key={`${map.landscape?.mapId ?? "legacy"}:${map.landscape?.artVersion ?? "original"}`} geometry={geometry} atlasGeometry={atlasGeometry} landscape={artLandscape} view={view} ru={ru}/>
      <svg ref={gestures.attachRef} {...gestures.bindings} viewBox="0 0 320 320" tabIndex={0} role="group" aria-label={ru?'Карта. Перетаскивай для обзора, нажми на место для переноса камеры.':'Map. Drag to explore; tap to move the camera.'} onKeyDown={e=>{
        if(e.target!==e.currentTarget)return;
        const delta:Record<string,[number,number]>={ArrowLeft:[24,0],ArrowRight:[-24,0],ArrowUp:[0,24],ArrowDown:[0,-24]};
        if(delta[e.key]) {e.preventDefault();const [x,y]=delta[e.key];onView(clampView({...view,x:view.x+x,y:view.y+y}));}
        if(e.key==='+'||e.key==='='){e.preventDefault();gestures.zoom(1.4);}
        if(e.key==='-'){e.preventDefault();gestures.zoom(1/1.4);}
        if(e.key==='Enter'){e.preventDefault();tap({x:160,y:160});}
      }}>
        {[...map.players.keys()].map(k=>{const[q,r]=k.split(',').map(Number);if(!shownMap.seen.has(k))return null;const p=screen(q,r);return <circle key={k} cx={p.x} cy={p.y} r="1.6" fill="#ff4f79" stroke="#17231f" strokeWidth=".65"/>;})}
        {!detailed&&marks.map(m=>{const p=screen(m.q,m.r),Icon=icons[m.kind];return <g key={`${m.kind}:${m.q},${m.r}`} transform={`translate(${p.x-9} ${p.y-9})`} role="button" tabIndex={0} aria-label={`${names[m.kind][ru?0:1]} ${m.q}, ${m.r}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openPoint(m);}}}><circle cx="9" cy="9" r="11" fill="#121c19" opacity=".9"/><Icon width="18" height="18" color="#f1cc66" strokeWidth="1.5"/></g>;})}
        {detailed&&groups.map((group,i)=>{const m=group.points[0],Icon=detailIcons[m.kind],cluster=group.points.length>1;return <g key={`${m.kind}:${m.q}:${m.r}:${i}`} transform={`translate(${group.x} ${group.y})`} role="button" tabIndex={0} aria-label={cluster?`${ru?'Объекты':'Objects'}: ${group.points.length}. ${ru?'Открыть группу':'Open group'}`:`${detailNames[m.kind][ru?0:1]} ${m.q}, ${m.r}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openGroup(group);}}}><circle r={cluster?9:9.5} fill="#10241eeF" stroke={cluster?'#8c9e82':'#d9ba68'} strokeWidth=".7"/>{cluster?<text textAnchor="middle" dominantBaseline="central" fill="#f4ead0" fontSize="9" fontWeight="700">{group.points.length}</text>:<Icon x={-6.5} y={-6.5} width={13} height={13} color="#efd691" strokeWidth={1.5}/>}</g>;})}
        {map.playerQ!=null&&map.playerR!=null&&(()=>{const p=screen(map.playerQ,map.playerR);return <circle cx={p.x} cy={p.y} r="3" fill="#ffe187" stroke="#13251e" strokeWidth="1.5"/>;})()}
      </svg>
      <div className="strategic-map__zoom"><button aria-label={ru?'Приблизить':'Zoom in'} disabled={view.zoom>=6} onClick={()=>gestures.zoom(1.4)}><Plus size={18}/></button><button aria-label={ru?'Отдалить':'Zoom out'} disabled={view.zoom<=1} onClick={()=>gestures.zoom(1/1.4)}><Minus size={18}/></button><button type="button" aria-label={expanded?(ru?'Уменьшить карту':'Exit full screen'):(ru?'На весь экран':'Full screen')} aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize size={20}/>:<Maximize size={20}/>}</button></div>
      {detailed&&detail?.state==='loading'&&<p className="strategic-map__empty" role="status">{ru?'Загружаем объекты…':'Loading locations…'}</p>}
      {detailed&&detail?.state==='error'&&<div className="strategic-map__empty strategic-map__retry" role="alert">{ru?'Не удалось загрузить объекты':'Could not load locations'}{detail.onRetry&&<button onClick={detail.onRetry}>{ru?'Повторить':'Retry'}</button>}</div>}
      {detailed&&shownMap.seen.size>0&&detail?.state!=='loading'&&detail?.state!=='error'&&!filtered.length&&<p className="strategic-map__empty">{ru?'Нет объектов по выбранным фильтрам':'No locations match your filters'}</p>}
      {detailed&&selection.length>0&&<section className="strategic-map__filters" aria-label={ru?'Объекты рядом':'Nearby locations'}><div className="strategic-map__filter-heading"><strong>{ru?'Объекты рядом':'Nearby locations'}</strong><button aria-label={ru?'Закрыть список':'Close list'} onClick={()=>setSelection([])}><X size={17}/></button></div><div className="strategic-map__filter-list">{selection.map((p,i)=>{const Icon=detailIcons[p.kind];return <button className="strategic-map__location" key={`${p.kind}:${p.q}:${p.r}:${i}`} onClick={()=>openPoint(p)}><Icon size={16}/><span>{detailNames[p.kind][ru?0:1]}</span><small>{p.q}, {p.r}</small></button>;})}</div></section>}
      {detailed&&filters&&<section className="strategic-map__filters" id="map-filters" aria-label={ru?'Фильтры объектов':'Location filters'}><div className="strategic-map__filter-heading"><strong>{ru?'Показывать':'Show'}</strong><button aria-label={ru?'Закрыть фильтры':'Close filters'} onClick={()=>setFilters(false)}><X size={17}/></button></div><div className="strategic-map__filter-shortcuts"><button onClick={()=>setHidden(new Set())}>{ru?'Все':'All'}</button><button onClick={()=>setHidden(new Set(categories.map(c=>c.kind)))}>{ru?'Снять выбор':'Clear'}</button></div><div className="strategic-map__filter-list">{categories.map(({kind,count})=>{const Icon=detailIcons[kind];return <label key={kind}><input type="checkbox" checked={!hidden.has(kind)} onChange={()=>setHidden(old=>{const n=new Set(old);n.has(kind)?n.delete(kind):n.add(kind);return n;})}/><Icon size={16}/><span>{detailNames[kind][ru?0:1]}</span><small>{count}</small></label>;})}</div></section>}
      {!shownMap.seen.size&&(!detailed||(detail?.state!=='loading'&&detail?.state!=='error'))&&<p className="strategic-map__empty">{ru?'Исследуй мир, чтобы открыть карту':'Explore the world to reveal the map'}</p>}
    </div>
    {!detailed&&status && <div className="strategic-map__status">{status}</div>}
    {actions}
    {detailed?<div className="strategic-map__detail-summary"><span className="strategic-map__portal-key"><CircleDot size={14}/>{ru?'Внутримировой портал':'Local portal'}</span><span className="strategic-map__portal-key"><WorldPortalIcon size={14}/>{ru?'Межмировой портал':'Interworld portal'}</span>{ru?`Объектов: ${filtered.length}`:`Locations: ${filtered.length}`}<span>{ru?"Число на метке — группа объектов":"Numbered markers group locations"}</span></div>:<div className="strategic-map__legend">{(Object.keys(icons) as Array<keyof typeof icons>).map(kind=>{const Icon=icons[kind];return <span key={kind}><Icon size={14}/>{names[kind][ru?0:1]}</span>;})}</div>}
  </TavernDialog>;
}


