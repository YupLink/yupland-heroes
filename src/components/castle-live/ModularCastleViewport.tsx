import {useCastleViewportSize} from './useCastleViewportSize';
import {useCastleZoom} from './useCastleZoom';
import {type RoadSegment} from './roadSegments';
import {modularRoadGestures,type RoadStroke} from './modularRoadGestures';
import {useQuery} from '@tanstack/react-query';
import {getSession} from '@/server/api/user-auth';
import {placementProblem} from './modularPlacement';
import {createDecor} from './modularDecorCatalog';
import {modularObjectGestures} from './modularObjectGestures';
import {resizeBuilding} from './modularCastleProfiles';
import {GameLoadState} from '@/components/game/GameLoadState';
import {useModularCastleImages} from './useModularCastleImages';
import {ModularCastleEditor} from './ModularCastleEditor';
import {loadModularLayout,saveModularLayout,type SceneBuilding} from './modularCastleLayout';
import {modularBuildingId} from './modularCastleActions';import {useWithAuctionHouse} from './useWithAuctionHouse';import {useWithCasino} from './useWithCasino';import {useWithBank} from './useWithBank';
// Карта замка занимает весь экран и перемещается во всех направлениях под HUD.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ModularCastleCanvas } from "./ModularCastleCanvas";
import { castleMotion } from "./castleMotion";
import { useCastleZoomPreview } from "./useCastleZoomPreview";
import {originals} from "./modularCastleProfiles";
import type { Asset, CellMap } from "@/components/castle-editor/types";
import { type Bindings, type Lang } from "@/lib/castleMenus";
import { castleMapGestures } from "./castleMapGestures";
import { modularCastleCamera } from "./modularCastleCamera";
export function ModularCastleViewport({
  cells,
  assets,
  bindings,
  onBuilding,
  lang,
  editing=false,onDone=()=>{},
}: {
  editing?:boolean;onDone?:()=>void;
  cells: CellMap;
  assets: Asset[];
  bindings: Bindings;
  onBuilding: (id: string) => void;
  lang: Lang;
}) {
  const session=useQuery({queryKey:['session'],queryFn:()=>getSession()});
  const canDecor=session.data?.isAdmin===true||session.data?.isCastleEditor===true;
  const canDecorRef=useRef(canDecor);canDecorRef.current=canDecor;
  const layoutKey='castle-modular-layout-v1';
  const [buildings,setBuildings]=useState(()=>loadModularLayout(layoutKey));
  const visibleBuildings=useWithBank(useWithCasino(useWithAuctionHouse(useMemo(()=>buildings.filter(b=>b.id!=="shop"&&(!b.decor||canDecor)),[buildings,canDecor]),editing),editing),editing);
  useEffect(()=>{if(!canDecor){setPendingDecor(null);setSelected(id=>id.startsWith('decor:')?'hall':id);}},[canDecor]);

  const [pathMode,setPathMode]=useState<'draw'|'erase'|'pan'>('pan');
  const [pathActive,setPathActive]=useState(false);const pathActiveRef=useRef(pathActive);pathActiveRef.current=pathActive;
  const pathModeRef=useRef(pathMode);pathModeRef.current=pathMode;
  const [roadDraft,setRoadDraft]=useState<{segment:RoadSegment;valid:boolean}|null>(null);
  const [roadErasePreview,setRoadErasePreview]=useState<RoadSegment[]|null>(null);
  const pathStroke=useRef<RoadStroke|null>(null);
  const [selected,setSelected]=useState('hall');
  const objectController=useRef<ReturnType<typeof modularObjectGestures>|null>(null);
  const [pendingDecor,setPendingDecor]=useState<string|null>(null);
  const pendingDecorRef=useRef(pendingDecor);pendingDecorRef.current=pendingDecor;
  useEffect(()=>{if(!editing){setPathActive(false);setPathMode('pan');setPendingDecor(null);objectController.current?.reset();}},[editing]);
  const problemText=(problem:string)=>lang==='ru'?(problem==='bounds'?'Вне доступной территории':'Здесь уже занято основание постройки'):(problem==='bounds'?'Outside available territory':'A foundation already occupies this space');
  const [saveError,setSaveError]=useState('');
  const latestBuildings=useRef(buildings);latestBuildings.current=buildings;
  const editingRef=useRef(editing);editingRef.current=editing;
  const saved=useRef(JSON.stringify(buildings));
  const history=useRef<SceneBuilding[][]>([]);
  const editStart=useRef<SceneBuilding[]|null>(null);
  const [undoCount,setUndoCount]=useState(0);
  const pushHistory=(before:SceneBuilding[])=>{history.current=[...history.current.slice(-49),before];setUndoCount(history.current.length);};
  const change=(next:SceneBuilding[])=>{next=[...next.filter(b=>b.id!=="shop"),...latestBuildings.current.filter(b=>b.id==="shop")];if(!canDecorRef.current)next=[...next.filter(b=>!b.decor),...latestBuildings.current.filter(b=>b.decor)];for(const b of next){const previous=latestBuildings.current.find(p=>p.id===b.id);if(!previous||b.x!==previous.x||b.y!==previous.y||b.size!==previous.size||b.mirrored!==previous.mirrored){const problem=placementProblem(b,next.filter(p=>p.id!=="shop"));if(problem){setSaveError(problemText(problem));return false;}}}if(JSON.stringify(next)===JSON.stringify(latestBuildings.current))return;pushHistory(latestBuildings.current);setBuildings(next);setSaveError('');return true;};
  const dirty=JSON.stringify(buildings)!==saved.current;
  const save=()=>{if(objectController.current?.active()||pathStroke.current){setSaveError(lang==='ru'?'Заверши жест перед сохранением':'Finish the gesture before saving');return false;}try{saveModularLayout(layoutKey,latestBuildings.current);saved.current=JSON.stringify(latestBuildings.current);setSaveError('');setBuildings([...latestBuildings.current]);return true;}catch{setSaveError(lang==='ru'?'Не удалось сохранить изменения. Попробуй ещё раз.':'Could not save changes. Try again.');return false;}};
  const undo=()=>{setPendingDecor(null);const previous=history.current.pop();if(previous){setBuildings(previous);if(!previous.some(b=>b.id===selected))setSelected(previous.find(b=>b.decor)?.id||'hall');}setUndoCount(history.current.length);};
  const discard=()=>{objectController.current?.reset();setBuildings(JSON.parse(saved.current));history.current=[];setUndoCount(0);setSaveError('');};
  const changeRef=useRef(change);changeRef.current=change;
  const {state:assetState,attempt:assetAttempt,retry:retryAssets}=useModularCastleImages(visibleBuildings);
  const host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const targetScale = useRef(1);
  const cameraTouched = useRef(false);
  const suppressClickUntil = useRef(0);
  const zoomCenter = useRef<{ x: number; y: number } | null>(null);
  const [zoom,setZoom]=useCastleZoom();
  const {size,insets}=useCastleViewportSize(host,editing);
  const camera = useMemo(
    () =>
      modularCastleCamera(size.width, size.height, insets, zoom, buildings.find(b=>b.id==='gates')!.x),
    [size, insets, zoom,buildings],
  );
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const [x, y, worldWidth] = camera.viewBox.split(" ").map(Number);
    el.scrollLeft = zoomCenter.current === null
      ? camera.scrollLeft
      : (zoomCenter.current.x - x) * camera.width / worldWidth - size.width / 2;
    el.scrollTop = zoomCenter.current === null
      ? camera.scrollTop
      : (zoomCenter.current.y - y) * camera.width / worldWidth - size.height / 2;
    zoomCenter.current = { x: x + (el.scrollLeft + size.width / 2) * worldWidth / camera.width,
      y: y + (el.scrollTop + size.height / 2) * worldWidth / camera.width };
    zoomPreviewRef.current.afterDraw();
  }, [camera, size.width, size.height, zoom]);
  const limits = useMemo(() => {
    const scaleAt = (value: number) => {
      const frame = modularCastleCamera(size.width, size.height, insets, value,400);
      return frame.width / Number(frame.viewBox.split(" ")[2]);
    };
    return { min: scaleAt(0), max: scaleAt(1) };
  }, [size,insets]);
  const drawnScale = camera.width / Number(camera.viewBox.split(" ")[2]), zoomValue = (scale: number) => Math.log(scale / limits.min) / Math.log(limits.max / limits.min);
  const zoomPreview = useCastleZoomPreview({ host, stage, drawn: () => drawnScale, commit: scale => { const value = zoomValue(scale); if (Math.abs(value - zoom) < 1e-6) return false; setZoom(value); return true; } });
  const zoomPreviewRef = useRef(zoomPreview); zoomPreviewRef.current = zoomPreview; if (!zoomPreview.active()) targetScale.current = drawnScale;
  const zoomTo = useCallback((scale: number) => {
    if (!Number.isFinite(scale) || limits.max <= limits.min) return;
    const next = Math.max(limits.min, Math.min(limits.max, scale)); targetScale.current = next;
    if (editingRef.current) setZoom(Math.log(next / limits.min) / Math.log(limits.max / limits.min)); else zoomPreviewRef.current.preview(next); // жест — растяжка, перерисовка в конце
  }, [limits]);
  const zoomToRef = useRef(zoomTo);
  useLayoutEffect(() => { zoomToRef.current = zoomTo; }, [zoomTo]);
  const gestures = useMemo(() => castleMapGestures({
    getScale: () => targetScale.current,
    zoomTo: scale => zoomToRef.current(scale),
    getScroll: () => ({ x: host.current?.scrollLeft ?? 0, y: host.current?.scrollTop ?? 0 }),
    scrollTo: position => { if (host.current) { host.current.scrollLeft = position.x; host.current.scrollTop = position.y; } },
    finish: moved => { zoomPreviewRef.current.flush(); if (moved) suppressClickUntil.current = Date.now() + 500; },
  }), []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const mapPointers=new Set<number>();
    const objects=modularObjectGestures({
      get:id=>latestBuildings.current.find(b=>b.id===id&&(!b.decor||canDecorRef.current)),scale:()=>targetScale.current,
      begin:()=>{editStart.current=latestBuildings.current;setSaveError('');},
      update:(id,value)=>{setBuildings(latestBuildings.current.map(b=>{
        if(b.id!==id)return b;
        const base=originals.find(o=>o.id===id)?.size??b.baseSize??b.size;
        const copy={...b,caption:{...b.caption}};
        resizeBuilding(copy,Math.max(base*.5,Math.min(base*1.6,value.size)));
        copy.x=Math.max(id==='gates'?-400:-600,Math.min(id==='gates'?1200:1400,value.x));
        copy.y=id==='gates'?330:Math.max(330+copy.size*.5,Math.min(1500,value.y));
        return copy;
      }));},
      finish:cancelled=>{const before=editStart.current;editStart.current=null;if(!before)return;const changed=latestBuildings.current.find(b=>before.some(p=>p.id===b.id&&(p.x!==b.x||p.y!==b.y||p.size!==b.size)));const problem=changed?placementProblem(changed,latestBuildings.current.filter(b=>b.id!=="shop"&&(!b.decor||canDecorRef.current))):null;if(cancelled||problem){latestBuildings.current=before;setBuildings(before);if(problem)setSaveError(problemText(problem));}else if(JSON.stringify(before)!==JSON.stringify(latestBuildings.current))pushHistory(before);suppressClickUntil.current=Date.now()+500;},
    });
    objectController.current=objects;
    const pointAt=(event:PointerEvent)=>{const bounds=el.getBoundingClientRect(),svg=el.querySelector('svg')!,view=svg.viewBox.baseVal;return {x:view.x+(el.scrollLeft+event.clientX-bounds.left)/targetScale.current,y:view.y+(el.scrollTop+event.clientY-bounds.top)/targetScale.current};};
    const roadsController=modularRoadGestures({el,pointAt,pathStroke,latestBuildings,pathModeRef,setRoadDraft,setRoadErasePreview,changeRef,setSaveError,suppressClickUntil,lang});
    const down = (event: PointerEvent) => {
      if(event.pointerType!=='touch'&&event.button!==0)return;
      if(editingRef.current&&canDecorRef.current&&pathModeRef.current!=='pan'&&!mapPointers.size){
        if(pathStroke.current){const stroke=pathStroke.current;pathStroke.current=null;setRoadDraft(null);setRoadErasePreview(null);mapPointers.add(stroke.pointer.pointerId);gestures.down(stroke.pointer);mapPointers.add(event.pointerId);gestures.down(event);event.preventDefault();return;}
        roadsController.start(event);return;
      }

      const id=(event.target as Element).closest('[data-modular-building]')?.getAttribute('data-modular-building')??undefined;
      if(editingRef.current&&!pathActiveRef.current&&pathModeRef.current==='pan'&&!pendingDecorRef.current&&!mapPointers.size&&objects.down(event,id)){
        if(id)setSelected(id);if(event.pointerType!=='touch')el.setPointerCapture(event.pointerId);event.preventDefault();return;
      }
      mapPointers.add(event.pointerId);cameraTouched.current=true;
      const active=gestures.down(event);if(active.length>1&&event.pointerType!=='touch')for(const id of active)el.setPointerCapture(id);
    };
    const move = (event: PointerEvent) => {
      if(pathStroke.current?.pointer.pointerId===event.pointerId){roadsController.paint(event);event.preventDefault();return;}
      if(objects.move(event)){if(event.cancelable)event.preventDefault();return;}
      if(!gestures.move(event))return;
      if(event.pointerType!=='touch'&&!el.hasPointerCapture(event.pointerId))el.setPointerCapture(event.pointerId);
      if(event.cancelable)event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if(pathStroke.current?.pointer.pointerId===event.pointerId){
        roadsController.finish(event);return;
      }
      if(event.type==='lostpointercapture'&&event.target!==el)return;
      objects.up(event.pointerId,event.type==='pointercancel');mapPointers.delete(event.pointerId);gestures.up(event.pointerId);
      if(el.hasPointerCapture(event.pointerId))el.releasePointerCapture(event.pointerId);
    };
    // Capture on the viewport before SVG hit targets; keep both fingers on it.
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, { capture: true, passive: false });
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    el.addEventListener("lostpointercapture", up, true);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
      el.removeEventListener("lostpointercapture", up, true);
      objects.reset();objectController.current=null;gestures.reset();pathStroke.current=null;setRoadDraft(null);setRoadErasePreview(null);
    };
  }, [gestures]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const id=(event.target as Element).closest('[data-modular-building]')?.getAttribute('data-modular-building');
      if(editingRef.current&&id&&!pendingDecorRef.current){
        const b=latestBuildings.current.find(b=>b.id===id);if(!b)return;
        const base=originals.find(o=>o.id===id)?.size??b.baseSize??b.size;
        const copy={...b,caption:{...b.caption}};resizeBuilding(copy,Math.max(base*.5,Math.min(base*1.6,b.size*Math.exp(-Math.max(-40,Math.min(40,event.deltaY))*.002))));
        setSelected(id);changeRef.current(latestBuildings.current.map(p=>p.id===id?copy:p));return;
      }
      cameraTouched.current = true;
      if(event.deltaY) zoomTo(targetScale.current * (event.deltaY > 0 ? .9 : 1.1));
      if(event.deltaX)el.scrollLeft+=event.deltaX;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomTo]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <style>{"[data-map-viewport]::-webkit-scrollbar{display:none}"}</style>
      {editing&&<ModularCastleEditor pendingDecor={pendingDecor} onCancelPlacement={()=>{setPendingDecor(null);setSaveError('');}} onAdd={id=>{if(!canDecor)return;setPendingDecor(id);setSaveError('');}} canDecor={canDecor} buildings={visibleBuildings} selected={selected} ru={lang==='ru'} onSelect={setSelected} onChange={change} onDone={()=>{objectController.current?.reset();onDone();}} onSave={save} onPathActive={setPathActive} pathMode={pathMode} onPathMode={mode=>{setPendingDecor(null);setPathMode(mode);}} onUndo={undo} onDiscard={discard} dirty={dirty} canUndo={undoCount>0} error={saveError}/>}
      <div className="relative min-h-0 flex-1"><div
        ref={host}
        className="absolute inset-0 touch-none overflow-auto overscroll-contain bg-[#141418]"
        style={{ touchAction: "none", userSelect: "none", scrollbarWidth: "none" }}
        onClickCapture={(event) => {
          if(editingRef.current&&pathActiveRef.current){event.preventDefault();event.stopPropagation();return;}
          if(Date.now()>suppressClickUntil.current){
            if(editingRef.current&&pendingDecorRef.current){
              const el=host.current;if(!el)return;const bounds=el.getBoundingClientRect(),[left,top]=camera.viewBox.split(' ').map(Number);
              const item=createDecor(pendingDecorRef.current,'decor:'+crypto.randomUUID(),left+(el.scrollLeft+event.clientX-bounds.left)/camera.scale,top+(el.scrollTop+event.clientY-bounds.top)/camera.scale);
              if(item&&changeRef.current([...latestBuildings.current,item])){setSelected(item.id);setPendingDecor(null);}
              event.preventDefault();event.stopPropagation();
            }
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          suppressClickUntil.current = 0;
        }}
        onScroll={(event) => {
          castleMotion.mark();
          const [x, y, worldWidth] = camera.viewBox.split(" ").map(Number);
          zoomCenter.current = { x: x + (event.currentTarget.scrollLeft + size.width / 2) * worldWidth / camera.width,
            y: y + (event.currentTarget.scrollTop + size.height / 2) * worldWidth / camera.width };
        }}
        onKeyDown={e=>{if(!editing||pathActive||!e.key.startsWith('Arrow'))return;const id=(e.target as Element).closest('[data-modular-building]')?.getAttribute('data-modular-building');if(!id)return;e.preventDefault();change(buildings.map(b=>b.id===id?{...b,x:Math.max(b.id==='gates'?-400:-600,Math.min(b.id==='gates'?1200:1400,b.x+(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0))),y:b.id==='gates'?330:Math.max(330+b.size*.5,Math.min(1500,b.y+(e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0)))}:b));}}
        data-map-viewport
        aria-label={lang === "ru" ? "Карта замка — перемещение и масштабирование жестами" : "Castle map — pan and pinch to zoom"}
      >
        <div ref={stage} style={{visibility:assetState==='ready'?undefined:'hidden'}} inert={assetState!=='ready'?true:undefined}>
          <ModularCastleCanvas roadSegmentsOverride={roadErasePreview} roadEditing={editing&&pathActive} roadDraft={roadDraft} buildings={visibleBuildings} selected={selected} editing={editing} camera={camera} ru={lang==='ru'} onBuilding={id=>{if(editing&&pathActive)return;editing?setSelected(id.slice(15)):onBuilding(id);}} />
        </div>
      </div>{assetState!=='ready'&&<div className="absolute inset-0 z-10"><GameLoadState key={assetAttempt} ru={lang==='ru'} state={assetState==='error'?'error':'loading'} destination="castle" fullscreen={false} onRetry={retryAssets}/></div>}</div>
    </div>
  );
}

