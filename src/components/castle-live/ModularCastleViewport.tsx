import type {CastlePurchaseDestination} from './TownHallPurchaseSuccess';
import {useWithNewspaperKiosk} from './useWithNewspaperKiosk';import {useWithBuckwheatGame} from './useWithBuckwheatGame';
import {CASTLE_PLACEMENT,BUILDING_SCALE_MAX,BUILDING_BASE_MAX} from '@/lib/castlePlacementLimits';
import {useQuery} from "@tanstack/react-query";
import {getSession} from "@/server/api/user-auth";
import {castleAppearanceAccess,visibleAppearance,preserveAppearance} from './castleAppearanceAccess';
import {useTownHall} from './useTownHall';
import {applyBuildingStyle,restoreBuildingArtwork} from './modularBuildingStyles';
import {preserveOwnedLayout,editableOwnedLayout,isMovableOwnedBuilding} from './modularOwnedLayout';
import {isStyledDecor} from './decorStyleOptions';
import {useCastleViewportSize} from './useCastleViewportSize';
import {useCastleZoom} from './useCastleZoom';
import {type RoadSegment} from './roadSegments';
import {modularRoadGestures,type RoadStroke} from './modularRoadGestures';
import {placementProblem} from './modularPlacement';
import {createDecor} from './modularDecorCatalog';
import {modularObjectGestures} from './modularObjectGestures';
import {resizeBuilding} from './modularCastleProfiles';
import {GameLoadState} from '@/components/game/GameLoadState';
import {useModularCastleImages} from './useModularCastleImages';
import {ModularCastleEditor} from './ModularCastleEditor';
import {serializeModularLayout,decodeModularLayout,type SceneBuilding} from './modularCastleLayout';
import {useCastleLayoutSync} from './useCastleLayoutSync';
import {modularBuildingId} from './modularCastleActions';import {useWithAuctionHouse} from './useWithAuctionHouse';import {useWithCasino} from './useWithCasino';import {useWithBank} from './useWithBank';import {useWithArchitect} from './useWithArchitect';import {useWithMineOffice} from './useWithMineOffice';import {useWithWeatherStation} from './useWithWeatherStation';import {useWithShamanHut} from './useWithShamanHut';
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
  editing=false,onDone=()=>{},purchaseDestination=null,
}: {
  editing?:boolean;onDone?:()=>void;purchaseDestination?:CastlePurchaseDestination|null;
  cells: CellMap;
  assets: Asset[];
  bindings: Bindings;
  onBuilding: (id: string) => void;
  lang: Lang;
}) {
  const session=useQuery({queryKey:["session"],queryFn:()=>getSession()});
  const purchases=useTownHall();
  const access=useMemo(()=>castleAppearanceAccess(purchases.isSuccess?purchases.data.decor.owned:[],session.data?.isAdmin===true||session.data?.isCastleEditor===true),[purchases.isSuccess,purchases.data,session.data?.isAdmin,session.data?.isCastleEditor]);
  const accessRef=useRef(access);accessRef.current=access;
  const canDecor=access.decor.size>0||access.territoryStyles.length>0;
  const canPaths=access.roadStyles.length>0;
  const canStyledDecor=access.buildingStyles.length>1||access.territoryStyles.length>0||access.roadStyles.length>0;
  const canDecorRef=useRef(canDecor);canDecorRef.current=canDecor;
  const [buildings,setBuildings]=useState(()=>decodeModularLayout([]));
  const otherOwnedBuildings=useWithShamanHut(useWithWeatherStation(useWithMineOffice(useWithArchitect(useWithBank(useWithCasino(useWithAuctionHouse(useMemo(()=>visibleAppearance(buildings.filter(b=>b.id!=="shop"),access),[buildings,access]),editing),editing),editing),editing),editing)));
  const ownedBuildings=useWithBuckwheatGame(useWithNewspaperKiosk(otherOwnedBuildings),session.data?.isAdmin===true||session.data?.canBuckwheat===true);
  const visibleBuildings=useMemo(()=>applyBuildingStyle(ownedBuildings,ownedBuildings.find(b=>b.id==='gates')?.buildingStyle||'base'),[ownedBuildings,buildings,canStyledDecor]);
  useEffect(()=>{if(!canDecor){setPendingDecor(null);setSelected(id=>id.startsWith('decor:')?'hall':id);}},[canDecor]);


  useEffect(()=>{setPendingDecor(id=>id&&access.decor.has(id)?id:null);if(!access.roadStyles.length){setPathActive(false);setPathMode('pan');}},[access]);
  const [pathMode,setPathMode]=useState<'draw'|'erase'|'pan'>('pan');
  const [pathActive,setPathActive]=useState(false);const pathActiveRef=useRef(pathActive);pathActiveRef.current=pathActive;
  const pathModeRef=useRef(pathMode);pathModeRef.current=pathMode;
  const [roadDraft,setRoadDraft]=useState<{segment:RoadSegment;valid:boolean}|null>(null);
  const [roadErasePreview,setRoadErasePreview]=useState<RoadSegment[]|null>(null);
  const pathStroke=useRef<RoadStroke|null>(null);
  const [selected,setSelected]=useState('hall');
  const appliedPurchase=useRef<CastlePurchaseDestination|null>(null);
  useEffect(()=>{if(!editing){appliedPurchase.current=null;return;}if(!purchaseDestination||appliedPurchase.current===purchaseDestination)return;if(purchaseDestination.kind==='building'){if(!visibleBuildings.some(b=>b.id===purchaseDestination.id))return;setSelected(purchaseDestination.id);setPendingDecor(null);setPathMode('pan');setPathActive(false);}appliedPurchase.current=purchaseDestination;},[editing,purchaseDestination,visibleBuildings]);
  const [placementPointer,setPlacementPointer]=useState<{x:number;y:number}|null>(null);
  const pendingBuilding=editing?visibleBuildings.find(b=>b.id===selected&&b.placed===false):undefined;
  const pendingBuildingRef=useRef(false);pendingBuildingRef.current=!!pendingBuilding;
  const placementGhost=pendingBuilding&&placementPointer?{...pendingBuilding,...placementPointer,placed:true}:null;
  const sceneBuildings=useMemo(()=>visibleBuildings.filter(b=>b.placed!==false),[visibleBuildings]);
  const selectionScope=useRef<Set<string>|null>(null);
  const decorErasingRef=useRef(false);
  const setSelectionScope=useCallback((ids:string[],erase=false)=>{decorErasingRef.current=erase;selectionScope.current=new Set(ids);setSelected(previous=>ids.includes(previous)?previous:ids[0]||'');},[]);
  const canSelectObject=(id:string)=>selectionScope.current?selectionScope.current.has(id):!!latestBuildings.current.find(b=>b.id===id&&!b.decor);
  const objectController=useRef<ReturnType<typeof modularObjectGestures>|null>(null);
  const [pendingDecor,setPendingDecor]=useState<string|null>(null);
  const pendingCopy=useRef<SceneBuilding|null>(null);
  const pendingDecorRef=useRef(pendingDecor);pendingDecorRef.current=pendingDecor;
  useEffect(()=>{if(!editing){setPathActive(false);setPathMode('pan');setPendingDecor(null);objectController.current?.reset();}},[editing]);
  const problemText=(problem:string)=>lang==='ru'?(problem==='bounds'?'Вне доступной территории':'Здесь уже занято основание постройки'):(problem==='bounds'?'Outside available territory':'A foundation already occupies this space');
  const [saveError,setSaveError]=useState('');
  const visibleIds=useRef(new Set<string>());visibleIds.current=new Set(ownedBuildings.map(b=>b.id));
  const latestBuildings=useRef(buildings);latestBuildings.current=editableOwnedLayout(buildings,ownedBuildings);
  const editingRef=useRef(editing);editingRef.current=editing;
  const saved=useRef(JSON.stringify(buildings));
  // Hydrate newly available API-owned buildings into both edit and saved baselines.
  // Merely loading ownership must not create an unsaved edit.
  useEffect(()=>{
    const added=ownedBuildings.filter(b=>isMovableOwnedBuilding(b.id)&&!buildings.some(p=>p.id===b.id));
    if(!added.length)return;
    const previous=JSON.parse(saved.current) as SceneBuilding[];
    saved.current=JSON.stringify([...previous,...added.filter(b=>!previous.some(p=>p.id===b.id))]);
    setBuildings(current=>[...current,...added.filter(b=>!current.some(p=>p.id===b.id))]);
  },[ownedBuildings,buildings]);

  const history=useRef<SceneBuilding[][]>([]);
  const editStart=useRef<SceneBuilding[]|null>(null);
  const [undoCount,setUndoCount]=useState(0);
  const sync=useCastleLayoutSync(session.data?.telegramId,lang==='ru',(next,local)=>{setBuildings(next);if(!local)saved.current=JSON.stringify(next);history.current=[];setUndoCount(0);setSaveError('');});
  const pushHistory=(before:SceneBuilding[])=>{history.current=[...history.current.slice(-49),before];setUndoCount(history.current.length);};
  const change=(next:SceneBuilding[])=>{next=restoreBuildingArtwork(next,latestBuildings.current);next=preserveOwnedLayout(next,latestBuildings.current);next=preserveAppearance(next,latestBuildings.current,accessRef.current);next=[...next.filter(b=>b.id!=="shop"),...latestBuildings.current.filter(b=>b.id==="shop")];if(!canDecorRef.current)next=[...next.filter(b=>!b.decor),...latestBuildings.current.filter(b=>b.decor)];for(const b of next){const previous=latestBuildings.current.find(p=>p.id===b.id);if(!previous||b.x!==previous.x||b.y!==previous.y||b.size!==previous.size||b.placed!==previous.placed||b.mirrored!==previous.mirrored){const problem=placementProblem(b,next.filter(p=>(!p.decor||!!p.catalogId&&accessRef.current.decor.has(p.catalogId))&&(visibleIds.current.has(p.id)||!isMovableOwnedBuilding(p.id))));if(problem){setSaveError(problemText(problem));return false;}}}if(JSON.stringify(next)===JSON.stringify(latestBuildings.current))return;pushHistory(latestBuildings.current);setBuildings(next);setSaveError('');return true;};
  const dirty=JSON.stringify(serializeModularLayout(buildings).sort((a,b)=>a.id.localeCompare(b.id)))!==JSON.stringify(serializeModularLayout(JSON.parse(saved.current)).sort((a,b)=>a.id.localeCompare(b.id)));
  const save=async()=>{if(objectController.current?.active()||pathStroke.current){setSaveError(lang==='ru'?'Заверши жест перед сохранением':'Finish the gesture before saving');return false;}const snapshot=structuredClone(latestBuildings.current);if(!await sync.save(snapshot))return false;saved.current=JSON.stringify(snapshot);setSaveError('');setBuildings([...latestBuildings.current]);return true;};
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
      modularCastleCamera(size.width, size.height, insets, zoom, buildings.find(b=>b.id==='gates')!.x,editing),
    [size, insets, zoom,buildings,editing],
  );
  useLayoutEffect(() => {
    const el = host.current;
    // До настоящего замера размер 360×640: на планшете прокрутка по нему встаёт в 0, и камера запоминала не ту точку (замок уезжал вправо).
    if (!el || el.clientWidth !== size.width || el.clientHeight !== size.height) return;
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
      const frame = modularCastleCamera(size.width, size.height, insets, value,400,editing);
      return frame.width / Number(frame.viewBox.split(" ")[2]);
    };
    return { min: scaleAt(0), max: scaleAt(1) };
  }, [size,insets,editing]);
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
    let objectPointer:PointerEvent|null=null;
    const objects=modularObjectGestures({
      get:id=>latestBuildings.current.find(b=>b.id===id&&b.placed!==false&&(!b.decor||!!b.catalogId&&accessRef.current.decor.has(b.catalogId))&&canSelectObject(id)),scale:()=>targetScale.current,
      begin:()=>{editStart.current=latestBuildings.current;setSaveError('');},
      update:(id,value)=>{setBuildings(latestBuildings.current.map(b=>{
        if(b.id!==id)return b;
        const base=originals.find(o=>o.id===id)?.size??b.baseSize??b.size;
        const copy={...b,caption:{...b.caption}};
        resizeBuilding(copy,Math.max(base*.5,Math.min(base*BUILDING_SCALE_MAX,value.size)));
        copy.x=Math.max(id==='gates'?CASTLE_PLACEMENT.left+200:CASTLE_PLACEMENT.left-200,Math.min(id==='gates'?CASTLE_PLACEMENT.right-200:CASTLE_PLACEMENT.right+200,value.x));
        copy.y=id==='gates'?330:Math.max(250,Math.min(1600,value.y));
        return copy;
      }));},
      finish:cancelled=>{const before=editStart.current;editStart.current=null;if(!before)return;const changed=latestBuildings.current.find(b=>before.some(p=>p.id===b.id&&(p.x!==b.x||p.y!==b.y||p.size!==b.size)));const problem=changed?placementProblem(changed,latestBuildings.current.filter(b=>b.id!=="shop"&&visibleIds.current.has(b.id)&&(!b.decor||!!b.catalogId&&accessRef.current.decor.has(b.catalogId)))):null;if(cancelled||problem){latestBuildings.current=before;setBuildings(before);if(problem)setSaveError(problemText(problem));}else if(JSON.stringify(before)!==JSON.stringify(latestBuildings.current))pushHistory(before);suppressClickUntil.current=Date.now()+500;},
    });
    objectController.current=objects;
    const pointAt=(event:PointerEvent)=>{const bounds=el.getBoundingClientRect(),svg=el.querySelector('svg')!,view=svg.viewBox.baseVal;return {x:view.x+(el.scrollLeft+event.clientX-bounds.left)/targetScale.current,y:view.y+(el.scrollTop+event.clientY-bounds.top)/targetScale.current};};
    const roadsController=modularRoadGestures({el,pointAt,pathStroke,latestBuildings,pathModeRef,setRoadDraft,setRoadErasePreview,changeRef,setSaveError,suppressClickUntil,lang});
    const down = (event: PointerEvent) => {
      if(event.pointerType!=='touch'&&event.button!==0)return;
      if(editingRef.current&&accessRef.current.roadStyles.length>0&&pathModeRef.current!=='pan'&&!mapPointers.size){
        if(pathStroke.current){const stroke=pathStroke.current;pathStroke.current=null;setRoadDraft(null);setRoadErasePreview(null);mapPointers.add(stroke.pointer.pointerId);gestures.down(stroke.pointer);mapPointers.add(event.pointerId);gestures.down(event);event.preventDefault();return;}
        roadsController.start(event);return;
      }

      // A second finger always takes over map zoom; discard the unfinished object drag.
      if(objects.active()&&objectPointer&&event.pointerId!==objectPointer.pointerId){
        const first=objectPointer;objects.reset();objectPointer=null;
        mapPointers.add(first.pointerId);gestures.down(first);
        mapPointers.add(event.pointerId);gestures.down(event);event.preventDefault();return;
      }
      const id=(event.target as Element).closest('[data-modular-building]')?.getAttribute('data-modular-building')??undefined;
      if(editingRef.current&&!pendingBuildingRef.current&&!decorErasingRef.current&&!pathActiveRef.current&&pathModeRef.current==='pan'&&!pendingDecorRef.current&&!mapPointers.size&&objects.down(event,id)){
        objectPointer=event;if(id)setSelected(id);if(event.pointerType!=='touch')el.setPointerCapture(event.pointerId);event.preventDefault();return;
      }
      mapPointers.add(event.pointerId);cameraTouched.current=true;
      const active=gestures.down(event);if(active.length>1&&event.pointerType!=='touch')for(const id of active)el.setPointerCapture(id);
    };
    const move = (event: PointerEvent) => {
      if(pathStroke.current?.pointer.pointerId===event.pointerId){roadsController.paint(event);event.preventDefault();return;}
      if(objectPointer?.pointerId===event.pointerId)objectPointer=event;
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
      if(objectPointer?.pointerId===event.pointerId)objectPointer=null;
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
      if(editingRef.current&&id&&!pendingBuildingRef.current&&!pendingDecorRef.current){
        const b=latestBuildings.current.find(b=>b.id===id);if(!b)return;
        const base=originals.find(o=>o.id===id)?.size??b.baseSize??b.size;
        const copy={...b,caption:{...b.caption}};resizeBuilding(copy,Math.max(base*.5,Math.min(base*BUILDING_SCALE_MAX,b.size*Math.exp(-Math.max(-40,Math.min(40,event.deltaY))*.002))));
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
      {editing&&<ModularCastleEditor focusOnOpen={!!purchaseDestination} openAppearance={purchaseDestination?.kind==='appearance'} onSelectionScopeChange={setSelectionScope} onZoomOut={()=>zoomTo(targetScale.current/1.2)} onZoomIn={()=>zoomTo(targetScale.current*1.2)} appearanceAccess={access} canPaths={canPaths} canStyledDecor={canStyledDecor} pendingDecor={pendingDecor} onCancelPlacement={()=>{pendingCopy.current=null;setPendingDecor(null);setSaveError('');}} onCopy={source=>{if(!source.decor||!source.catalogId||!access.decor.has(source.catalogId))return;pendingCopy.current=structuredClone(source);setPendingDecor(source.catalogId);setSaveError('');}} onAdd={id=>{if(!access.decor.has(id))return;pendingCopy.current=null;setPendingDecor(id);setSaveError('');}} canDecor={canDecor} buildings={visibleBuildings} selected={selected} ru={lang==='ru'} onSelect={setSelected} onChange={change} onDone={()=>{objectController.current?.reset();onDone();}} onSave={save} onPathActive={setPathActive} pathMode={pathMode} onPathMode={mode=>{setPendingDecor(null);setPathMode(mode);}} onUndo={undo} onDiscard={discard} dirty={dirty} canUndo={undoCount>0} busy={sync.state!=='ready'} status={sync.state==='saving'?(lang==='ru'?'Сохраняется…':'Saving…'):sync.revision===0?(lang==='ru'?'Не сохранено в аккаунте':'Not saved to account'):undefined} onReload={sync.conflict?()=>{if(window.confirm(lang==='ru'?'Показать актуальный замок? Твои изменения останутся в черновике этого устройства.':'Show the latest castle? Your edits will remain in this device draft.'))sync.showConflictScene();}:undefined} error={saveError||sync.error}/>}
      {editing&&sync.state==='ready'&&sync.candidate&&(sync.candidate.source==='draft'||sync.revision===0)&&<div role="status" className="castle-editor-device-notice flex flex-wrap items-center gap-2 border-b border-amber-600/50 bg-[#171a1b] px-3 py-2 text-xs text-[#fff1cf]"><span>{sync.candidate.source==='draft'?(lang==='ru'?'Здесь сохранён мой черновик. Сначала сравни его с актуальным замком; повторная запись заменит серверный вариант.':'My draft is saved here. Compare it with the latest castle before replacing the server version.'):(lang==='ru'?'На этом устройстве есть прежняя расстановка. Покажи её и сохрани в аккаунт, чтобы видеть на другом устройстве.':'This device has an older layout. Show and save it to your account to use it on another device.')}</span><button className="rounded border border-amber-500 px-2 py-1" onClick={()=>{if(sync.candidate?.source==='draft'&&!window.confirm(lang==='ru'?'Показать мой черновик? Если затем сохранить его, он заменит текущую серверную расстановку.':'Show my draft? Saving it afterward will replace the current server layout.'))return;sync.showDeviceLayout();}}>{sync.candidate.source==='draft'?(lang==='ru'?'Показать мой черновик':'Show my draft'):(lang==='ru'?'Показать расстановку':'Show layout')}</button></div>}
      <div className="relative min-h-0 flex-1"><div
        ref={host}
        className="absolute inset-0 touch-none overflow-auto overscroll-contain bg-[#141418]"
        style={{ touchAction: "none", userSelect: "none", scrollbarWidth: "none" }}
        onPointerMove={event=>{if(!pendingBuilding)return;const el=host.current;if(!el)return;const rect=el.getBoundingClientRect(),[left,top]=camera.viewBox.split(' ').map(Number);setPlacementPointer({x:left+(el.scrollLeft+event.clientX-rect.left)/camera.scale,y:top+(el.scrollTop+event.clientY-rect.top)/camera.scale});}}
        onPointerLeave={()=>setPlacementPointer(null)}
        onClickCapture={(event) => {
          if(editingRef.current&&decorErasingRef.current){
            event.preventDefault();event.stopPropagation();
            if(Date.now()<=suppressClickUntil.current)return;
            const id=(event.target as Element).closest('[data-modular-building]')?.getAttribute('data-modular-building');
            if(id&&canSelectObject(id)&&latestBuildings.current.some(b=>b.id===id&&b.decor&&!!b.catalogId&&accessRef.current.decor.has(b.catalogId)))changeRef.current(latestBuildings.current.filter(b=>b.id!==id));
            return;
          }
          if(editingRef.current&&pathActiveRef.current){event.preventDefault();event.stopPropagation();return;}
          if(Date.now()>suppressClickUntil.current){
            const unplaced=latestBuildings.current.find(b=>b.id===selected&&b.placed===false&&visibleIds.current.has(b.id));
            if(editingRef.current&&unplaced&&!pendingDecorRef.current){
              const el=host.current;if(!el)return;const rect=el.getBoundingClientRect(),[left,top]=camera.viewBox.split(' ').map(Number);
              const item={...unplaced,placed:true,x:left+(el.scrollLeft+event.clientX-rect.left)/camera.scale,y:top+(el.scrollTop+event.clientY-rect.top)/camera.scale};
              setPlacementPointer({x:item.x,y:item.y});changeRef.current(latestBuildings.current.map(b=>b.id===item.id?item:b));event.preventDefault();event.stopPropagation();return;
            }
            if(editingRef.current&&pendingDecorRef.current){
              const el=host.current;if(!el)return;const bounds=el.getBoundingClientRect(),[left,top]=camera.viewBox.split(' ').map(Number);
              const id='decor:'+crypto.randomUUID(),x=left+(el.scrollLeft+event.clientX-bounds.left)/camera.scale,y=top+(el.scrollTop+event.clientY-bounds.top)/camera.scale;
              const item=pendingCopy.current?{...structuredClone(pendingCopy.current),id,x,y}:createDecor(pendingDecorRef.current,id,x,y);
              if(item&&changeRef.current([...latestBuildings.current,item])){setSelected(item.id);pendingCopy.current=null;setPendingDecor(null);}
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
        onKeyDown={e=>{if(e.key==='Escape'&&pendingBuilding){setSelected('hall');setPlacementPointer(null);return;}if(!editing||decorErasingRef.current||pathActive||!e.key.startsWith('Arrow'))return;const id=(e.target as Element).closest('[data-modular-building]')?.getAttribute('data-modular-building');if(!id||!canSelectObject(id))return;e.preventDefault();change(latestBuildings.current.map(b=>b.id===id?{...b,x:Math.max(b.id==='gates'?CASTLE_PLACEMENT.left+200:CASTLE_PLACEMENT.left-200,Math.min(b.id==='gates'?CASTLE_PLACEMENT.right-200:CASTLE_PLACEMENT.right+200,b.x+(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0))),y:b.id==='gates'?330:Math.max(250,Math.min(1600,b.y+(e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0)))}:b));}}
        data-map-viewport
        aria-label={lang === "ru" ? "Карта замка — перемещение и масштабирование жестами" : "Castle map — pan and pinch to zoom"}
      >
        <div ref={stage} style={{visibility:assetState==='ready'&&(sync.state==='ready'||sync.state==='saving')?undefined:'hidden'}} inert={assetState!=='ready'||sync.state!=='ready'?true:undefined}>
          <ModularCastleCanvas roadSegmentsOverride={roadErasePreview} roadEditing={editing&&pathActive} roadDraft={roadDraft} buildings={[...sceneBuildings,...(placementGhost?[placementGhost]:[])]} selected={selected} editing={editing} camera={camera} ru={lang==='ru'} onBuilding={id=>{if(editing&&pathActive)return;if(editing){const objectId=id.slice(15);if(canSelectObject(objectId)){if(decorErasingRef.current){if(latestBuildings.current.some(b=>b.id===objectId&&b.decor&&!!b.catalogId&&accessRef.current.decor.has(b.catalogId)))changeRef.current(latestBuildings.current.filter(b=>b.id!==objectId));}else setSelected(objectId);}}else onBuilding(id);}} />
        </div>
      </div>{(assetState!=='ready'||sync.state==='loading'||sync.state==='error')&&<div className="absolute inset-0 z-10"><GameLoadState key={assetAttempt} ru={lang==='ru'} state={assetState==='error'||sync.state==='error'?'error':'loading'} destination="castle" fullscreen={false} onRetry={()=>{retryAssets();void sync.reload();}}/></div>}</div>
    </div>
  );
}






