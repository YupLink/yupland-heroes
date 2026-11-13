import {BUILDING_SCALE_MAX} from '@/lib/castlePlacementLimits';
import {castleTerritoryStyles} from './castleTerritoryStyles';
import {castlePathStyles} from './castlePathStyles';
import {castleAppearanceAccess,type AppearanceAccess} from './castleAppearanceAccess';
import {buildingStyleOptions} from './modularBuildingStyles';
import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,FlipHorizontal2,Maximize2,Type,Undo2,X,Trash2,Copy,Eye,EyeOff,Castle,Flower2,Route,Palette,ChevronDown,Plus} from 'lucide-react';
import './modularCastleEditor.css';
import {originals,resizeBuilding} from './modularCastleProfiles';
import {modularCastleAssets} from './modularCastleAssets';
import {decorCatalog} from './modularDecorCatalog';
import type {SceneBuilding} from './modularCastleLayout';
function AppearancePicker({label,description,value,options,ru,onChange}:{label:string;description:string;value:string;options:{id:string;ru:string;en:string}[];ru:boolean;onChange:(id:string)=>void}){
 return <div className="castle-editor-appearance-row"><span title={description}>{label}</span><details className="castle-editor-style-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))e.currentTarget.open=false;}} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}} onToggle={e=>{if(e.currentTarget.open)e.currentTarget.closest('.castle-editor-popover')?.querySelectorAll('details').forEach(other=>{if(other!==e.currentTarget)other.open=false;});}}>
  <summary aria-label={description}><span>{options.find(s=>s.id===value)?.[ru?'ru':'en']||value}</span><ChevronDown size={16}/></summary>
  <div className="castle-editor-style-options">{options.map(s=><button type="button" key={s.id} aria-pressed={s.id===value} onClick={e=>{onChange(s.id);const picker=e.currentTarget.closest('details');if(picker){picker.open=false;picker.querySelector('summary')?.focus();}}}>{ru?s.ru:s.en}</button>)}</div>
 </details></div>;
}
// Drag only the existing object heading; buttons retain their own actions.
function useEditorDockDrag(){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const dock=ref.current,parent=dock?.parentElement;if(!dock||!parent)return;
  let gesture:{id:number;x:number;y:number;left:number;top:number;moved:boolean;handle:HTMLElement;threshold:number}|null=null;
  let suppressUntil=0;
  const bounds=()=>{const rect=parent.getBoundingClientRect();return {rect,sx:rect.width/parent.clientWidth||1,sy:rect.height/parent.clientHeight||1};};
  const place=(x:number,y:number)=>{
   const header=parent.querySelector<HTMLElement>('.castle-editor-header');
   const minTop=(header?.offsetTop||8)+(header?.offsetHeight||52)+8;
   const maxTop=Math.max(8,parent.clientHeight-dock.offsetHeight-8);
   dock.style.left=`${Math.max(8,Math.min(Math.max(8,parent.clientWidth-dock.offsetWidth-8),x))}px`;
   dock.style.top=`${Math.max(Math.min(minTop,maxTop),Math.min(maxTop,y))}px`;
   dock.style.right='auto';dock.style.bottom='auto';
  };
  const down=(e:PointerEvent)=>{
   suppressUntil=0;
   if(gesture||e.isPrimary===false||(e.pointerType!=='touch'&&e.button!==0))return;
   const target=e.target as Element,handle=target.closest<HTMLElement>('.castle-editor-inspector-head');
   if(!handle||target.closest('button:not(.castle-editor-object-trigger),input,select,.castle-editor-object-options'))return;
   const {rect,sx,sy}=bounds(),current=dock.getBoundingClientRect();
   gesture={id:e.pointerId,x:e.clientX,y:e.clientY,left:(current.left-rect.left)/sx,top:(current.top-rect.top)/sy,moved:false,handle,threshold:e.pointerType==='touch'?14:6};
  };
  const move=(e:PointerEvent)=>{
   const g=gesture;if(!g||g.id!==e.pointerId)return;
   if(!g.moved&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<g.threshold)return;
   if(!g.moved){g.moved=true;g.handle.setPointerCapture(e.pointerId);dock.dataset.dragging='true';}
   const {sx,sy}=bounds();place(g.left+(e.clientX-g.x)/sx,g.top+(e.clientY-g.y)/sy);
   e.preventDefault();
  };
  const end=(e:PointerEvent)=>{
   const g=gesture;if(!g||g.id!==e.pointerId)return;
   gesture=null;delete dock.dataset.dragging;
   if(g.moved){suppressUntil=Date.now()+400;if(g.handle.hasPointerCapture(e.pointerId))g.handle.releasePointerCapture(e.pointerId);}
  };
  const click=(e:MouseEvent)=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopPropagation();}};
  const clamp=()=>{if(dock.style.left)place(parseFloat(dock.style.left),parseFloat(dock.style.top));};
  dock.addEventListener('pointerdown',down);dock.addEventListener('click',click,true);
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
  const observer=new ResizeObserver(clamp);observer.observe(parent);observer.observe(dock);
  return ()=>{if(gesture?.handle.hasPointerCapture(gesture.id))gesture.handle.releasePointerCapture(gesture.id);observer.disconnect();dock.removeEventListener('pointerdown',down);dock.removeEventListener('click',click,true);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
 },[]);
 return ref;
}
function NumberField({name,value,onChange,min,max}:{name:string;value:number;onChange:(n:number)=>boolean|void;min:number;max:number}){
 const display=(n:number)=>String(Math.round(n*10)/10),[draft,setDraft]=useState(()=>display(value)),focused=useRef(false),lastApplied=useRef(value);
 useEffect(()=>{if(!focused.current||value!==lastApplied.current)setDraft(display(value));lastApplied.current=value;},[value]);
 const finish=()=>{focused.current=false;const parsed=draft.trim()===''?NaN:Number(draft),next=Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):value;const accepted=onChange(next);lastApplied.current=accepted===false?value:next;setDraft(display(lastApplied.current));};
 return <label className="scene-editor-field">{name}<input type="number" step="0.1" min={min} max={max} value={draft} onFocus={()=>{focused.current=true;}} onBlur={finish} onChange={e=>{setDraft(e.target.value);const n=e.target.valueAsNumber;if(Number.isFinite(n)&&n>=min&&n<=max){lastApplied.current=n;onChange(n);}}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></label>;
}
const decorLimit=80;
const toggleAllCaptions=(buildings:SceneBuilding[])=>{const hide=buildings.some(b=>!b.decor&&!b.captionHidden);return buildings.map(b=>b.decor?b:{...b,captionHidden:hide});};
const en:Record<string,string>={shop:'Trading house',market:'Market',hall:'Town hall',tavern:'Tavern',temple:'Temple',training:'Training camp',warehouse:'Warehouse',glory:'Glory',notice:'Tasks',gates:'Exit to world'};
export function ModularCastleEditor({focusOnOpen=false,openAppearance=false,canDecor=false,canPaths=false,canStyledDecor=false,appearanceAccess=castleAppearanceAccess(),buildings,selected,ru,onSelect,onChange,onAdd,onCopy,pendingDecor,onCancelPlacement,onDone,onSave,onUndo,onDiscard,dirty,canUndo,error,busy=false,status,onRestoreLocal,onReload,pathMode='pan',onPathMode,onPathActive,onZoomOut,onZoomIn,onSelectionScopeChange}:{focusOnOpen?:boolean;openAppearance?:boolean;onSelectionScopeChange?:(ids:string[],erase?:boolean)=>void;onZoomOut?:()=>void;onZoomIn?:()=>void;canDecor?:boolean;canPaths?:boolean;canStyledDecor?:boolean;appearanceAccess?:AppearanceAccess;buildings:SceneBuilding[];selected:string;ru:boolean;onSelect:(id:string)=>void;onChange:(b:SceneBuilding[])=>boolean|void;onAdd:(id:string)=>void;onCopy:(source:SceneBuilding)=>void;pendingDecor:string|null;onCancelPlacement:()=>void;onDone:()=>void;onSave:()=>Promise<boolean>;busy?:boolean;status?:string;onRestoreLocal?:()=>void;onReload?:()=>void;onPathActive?:(active:boolean)=>void;pathMode?:'draw'|'erase'|'pan';onPathMode?:(mode:'draw'|'erase'|'pan')=>void;onUndo:()=>void;onDiscard:()=>void;dirty:boolean;canUndo:boolean;error:string}){
 const editorRoot=useRef<HTMLElement>(null),didFocus=useRef(false);
 useEffect(()=>{if(!focusOnOpen||busy||didFocus.current)return;const target=editorRoot.current?.querySelector<HTMLElement>(openAppearance?'[aria-controls=castle-editor-appearance-panel]':'.castle-editor-object-trigger');if(target){didFocus.current=true;target.focus();}},[focusOnOpen,busy,openAppearance]);
 const [tab,setTab]=useState<'buildings'|'decor'|'paths'>('buildings'),[inspector,setInspector]=useState<'size'|'caption'|null>(null),[inspectorOpen,setInspectorOpen]=useState(true),[appearanceOpen,setAppearanceOpen]=useState(openAppearance),[closing,setClosing]=useState(false),[category,setCategory]=useState('all'),[catalogOpen,setCatalogOpen]=useState(false);
 const [decorErasing,setDecorErasing]=useState(false);
 const dialogRef=useRef<HTMLDialogElement>(null);
 const dockRef=useEditorDockDrag();
 const objectPicker=useRef<HTMLDivElement>(null),[objectPickerOpen,setObjectPickerOpen]=useState(false);
 useEffect(()=>{
  if(!objectPickerOpen)return;
  const outside=(e:PointerEvent)=>{if(!objectPicker.current?.contains(e.target as Node))setObjectPickerOpen(false);};
  document.addEventListener('pointerdown',outside);
  return()=>document.removeEventListener('pointerdown',outside);
 },[objectPickerOpen]);
 useEffect(()=>setObjectPickerOpen(false),[tab,selected]);
 const hasDecor=canDecor&&appearanceAccess.decor.size>0;
 const selectedObject=buildings.find(b=>b.id===selected);
 useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;if(closing&&!dialog.open)dialog.showModal();else if(!closing&&dialog.open)dialog.close();},[closing]);
 useEffect(()=>{setInspector(null);setInspectorOpen(!!selectedObject);},[selected]);
 useEffect(()=>{if(!hasDecor&&tab==='decor'){setTab('buildings');setCatalogOpen(false);}},[hasDecor,tab]);
 const t=(a:string,b:string)=>ru?a:b;
 const categories=[['all','Все предметы','All items'],['light','Свет','Light'],['plants','Растения','Plants'],['water','Вода','Water'],['items','Предметы','Items']];
 const activeCategory=categories.find(c=>c[0]===category)||categories[0];
 const captionsVisible=buildings.some(p=>!p.decor&&!p.captionHidden);
 const availableBuildingStyles=buildingStyleOptions.filter(s=>appearanceAccess.buildingStyles.includes(s.id));
 const availableTerritoryStyles=castleTerritoryStyles.filter(s=>s.id==='base'||appearanceAccess.territoryStyles.includes(s.id));
 const availablePathStyles=castlePathStyles.filter(s=>s.id==='base'||appearanceAccess.roadStyles.includes(s.id));
 const activeDecorStyle=buildings.find(p=>p.id==='gates')?.territoryStyle||'base';
 useEffect(()=>{setCategory('all');onCancelPlacement();},[activeDecorStyle]);
 useEffect(()=>{setDecorErasing(false);},[tab,activeDecorStyle,category]);
 const items=buildings.filter(p=>tab==='buildings'?!p.decor:tab==='decor'?!!p.decor&&(decorCatalog.find(d=>d.id===p.catalogId)?.style||'base')===activeDecorStyle&&(category==='all'||decorCatalog.find(d=>d.id===p.catalogId)?.category===category):false);
 const b=items.find(p=>p.id===selected)||items[0];
 const scopeItems=tab==='decor'&&decorErasing?buildings.filter(p=>p.decor&&!!p.catalogId&&appearanceAccess.decor.has(p.catalogId)&&(category==='all'||decorCatalog.find(d=>d.id===p.catalogId)?.category===category)):items;
 const scopeKey=JSON.stringify(scopeItems.map(p=>p.id));
 useEffect(()=>{onSelectionScopeChange?.(JSON.parse(scopeKey),tab==='decor'&&decorErasing);},[scopeKey,onSelectionScopeChange,tab,decorErasing]);
 const catalogItems=decorCatalog.filter(d=>(d.style||'base')===activeDecorStyle&&(category==='all'||d.category===category)&&appearanceAccess.decor.has(d.id));
 const selectTab=(next:'buildings'|'decor'|'paths')=>{setAppearanceOpen(false);onPathActive?.(next==='paths');onPathMode?.(next==='paths'?'draw':'pan');setTab(next);setInspector(null);setCatalogOpen(next==='decor'&&!pendingDecor);setInspectorOpen(next!=='paths');if(next==='paths')return;const first=buildings.find(p=>next==='decor'?p.decor&&(decorCatalog.find(d=>d.id===p.catalogId)?.style||'base')===activeDecorStyle:!p.decor);if(first)onSelect(first.id);};
 const update=(fn:(b:SceneBuilding)=>void)=>{if(!b)return false;return onChange(buildings.map(p=>{if(p.id!==b.id)return p;const copy={...p,caption:{...p.caption}};fn(copy);return copy;}));};
 const base=b?(originals.find(o=>o.id===b.id)?.size??b.baseSize??b.size):100;
 const field=(name:string,value:number,change:(n:number)=>boolean|void,min:number,max:number)=><NumberField key={`${b?.id}:${name}`} name={name} value={value} onChange={change} min={min} max={max}/>;
 return <section ref={editorRoot} aria-label={t('Редактор замка','Castle editor')} className="castle-scene-editor">
  <fieldset disabled={busy} className="castle-editor-top-controls">
   <header className="castle-editor-header">
   <nav className="castle-editor-sidebar" aria-label={t('Инструменты','Tools')}>
    <button aria-pressed={tab==='buildings'} onClick={()=>selectTab('buildings')}><span aria-hidden="true" className="castle-editor-tab-art castle-editor-tab-art--buildings"/><span>{t('Здания','Buildings')}</span></button>
    {hasDecor&&<button aria-pressed={tab==='decor'} onClick={()=>selectTab('decor')}><span aria-hidden="true" className="castle-editor-tab-art castle-editor-tab-art--decor"/><span>{t('Декор','Decor')}</span></button>}
    {canPaths&&<button aria-pressed={tab==='paths'} onClick={()=>selectTab('paths')}><span aria-hidden="true" className="castle-editor-tab-art castle-editor-tab-art--paths"/><span>{t('Дороги','Paths')}</span></button>}
   </nav>
   {<div className="castle-editor-appearance">
    <button className="castle-editor-icon" aria-label={t('Оформление','Appearance')} title={t('Оформление','Appearance')} aria-expanded={appearanceOpen} aria-controls="castle-editor-appearance-panel" onClick={()=>setAppearanceOpen(v=>!v)}><Palette size={20}/></button>
    {appearanceOpen&&<div id="castle-editor-appearance-panel" className="castle-editor-popover">
     {canStyledDecor&&availableTerritoryStyles.length>0&&<AppearancePicker label={t('Окружение','Environment')} description={t('Территория, декор и дороги','Territory, decor and paths')} value={buildings.find(p=>p.id==='gates')?.territoryStyle||availableTerritoryStyles[0].id} options={availableTerritoryStyles} ru={ru} onChange={id=>onChange(buildings.map(p=>p.id==='gates'?{...p,territoryStyle:id,roadStyle:availablePathStyles.some(s=>s.id===id)?id:(availablePathStyles.some(s=>s.id==='base')?'base':p.roadStyle)}:p))}/>}
     {canStyledDecor&&availableBuildingStyles.length>1&&<AppearancePicker label={t('Здания','Buildings')} description={t('Стиль зданий','Building style')} value={buildings.find(p=>p.id==='gates')?.buildingStyle||'base'} options={availableBuildingStyles} ru={ru} onChange={id=>onChange(buildings.map(p=>p.id==='gates'?{...p,buildingStyle:id}:p))}/>}
     <div className="castle-editor-appearance-row castle-editor-caption-row"><span title={t('Подписи на карте','Map labels')}>{t('Подписи','Labels')}</span><button className="castle-editor-caption-toggle" role="switch" aria-label={t('Подписи на карте','Map labels')} aria-checked={captionsVisible} onClick={()=>onChange(toggleAllCaptions(buildings))}><span className="castle-editor-switch-track" aria-hidden="true"><span/></span></button></div>
    </div>}
   </div>}
    <button className="castle-editor-icon" aria-label={t('Закрыть редактор','Close editor')} onClick={()=>dirty?setClosing(true):onDone()}><X size={18}/></button>
   </header>
  </fieldset>
  <div ref={dockRef} className="castle-editor-dock">
  <fieldset disabled={busy} className="castle-editor-controls">
   {decorErasing&&tab==='decor'&&<div className="castle-editor-erase-hint"><span>{t('Нажимай на предметы категории, чтобы убрать их','Tap items in this category to remove them')}</span><button onClick={()=>setDecorErasing(false)}>{t('Готово','Done')}</button></div>}
   {hasDecor&&tab==='decor'&&(!b||catalogOpen||!!pendingDecor)&&<aside className="castle-editor-toolpanel castle-editor-catalog-panel" aria-label={t('Декор','Decor')}>
    {pendingDecor&&<div className="castle-editor-placement"><span>{t('Коснись места на карте','Tap a position on the map')}</span><button onClick={onCancelPlacement}>{t('Отмена','Cancel')}</button></div>}
    {!pendingDecor&&(catalogOpen||!b)&&<>
     <div className="castle-editor-catalog-filter">
      <details className="castle-editor-category-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))e.currentTarget.open=false;}} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
       <summary aria-label={t('Категория декора','Decor category')}><span>{t(activeCategory[1],activeCategory[2])}</span><ChevronDown size={16}/></summary>
       <div className="castle-editor-category-options">{categories.map(([id,ruName,enName])=><button key={id} aria-pressed={category===id} onClick={e=>{setCategory(id);const picker=e.currentTarget.closest('details');if(picker){picker.open=false;picker.querySelector('summary')?.focus();}}}>{t(ruName,enName)}</button>)}</div>
      </details>
      <button className="castle-editor-icon" aria-label={t('Очистить категорию','Clear category')} title={t('Очистить категорию','Clear category')} aria-pressed={decorErasing} onClick={()=>{onCancelPlacement();setDecorErasing(v=>!v);setInspector(null);}}><Trash2 size={20}/></button>
      {b&&<button className="castle-editor-icon" aria-label={t('Вернуться к объекту','Back to object')} title={t('Вернуться к объекту','Back to object')} onClick={()=>setCatalogOpen(false)}><X size={17}/></button>}
     </div>
     <div className="castle-editor-catalog">{catalogItems.map(d=><button key={d.id} title={ru?d.name:d.en} aria-label={t('Добавить: '+d.name,'Add '+d.en)} disabled={buildings.length>=decorLimit} onClick={()=>{setDecorErasing(false);onAdd(d.id);setCatalogOpen(false);setInspector(null);}}><img src={d.image} alt="" loading="eager" decoding="async"/></button>)}{!catalogItems.length&&<span>{t('В этой категории пока нет предметов','No items in this category yet')}</span>}</div>
    </>}
   </aside>}
   {canPaths&&tab==='paths'&&<aside className="castle-editor-toolpanel castle-editor-paths" aria-label={t('Дорожки','Paths')}>
    <div className="castle-editor-mode-row">{(['draw','erase','pan'] as const).map((mode,i)=><button key={mode} aria-pressed={pathMode===mode} onClick={()=>onPathMode?.(mode)}>{t(['Построить','Ластик','Карта'][i],['Build','Eraser','Pan'][i])}</button>)}</div>
    <p>{pathMode==='draw'?t('Тяни дорожку. Поворот — от её конца.','Drag a straight section. Start at its end to turn.'):pathMode==='erase'?t('Проведи по дороге, чтобы стереть её часть.','Drag over the road to erase part of it.'):t('Перемещай карту одним пальцем.','Drag to pan the map.')}</p>
   </aside>}
   {tab!=='paths'&&b&&!pendingDecor&&!(tab==='decor'&&catalogOpen)&&<aside className="castle-editor-inspector" aria-label={t('Выбранный объект','Selected object')}>
    <div className="castle-editor-inspector-head" title={t('Потяни, чтобы переместить панель','Drag to move panel')}>
     <div ref={objectPicker} className="castle-editor-object-picker" data-open={objectPickerOpen||undefined} onKeyDown={e=>{
      if(e.key==='Escape'){e.stopPropagation();setObjectPickerOpen(false);objectPicker.current?.querySelector<HTMLButtonElement>('.castle-editor-object-trigger')?.focus();}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.castle-editor-object-options button'));if(!objectPickerOpen){setObjectPickerOpen(true);return;}const i=buttons.indexOf(e.target as HTMLButtonElement);buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
     }}>
      <button type="button" className="castle-editor-object-trigger" aria-label={t('Выбрать объект','Select object')} aria-expanded={objectPickerOpen} onClick={()=>setObjectPickerOpen(v=>!v)}><img src={modularCastleAssets[b.image]||b.image} alt="" draggable={false}/><span>{ru?b.name:en[b.id]||decorCatalog.find(d=>d.id===b.catalogId)?.en||b.name}</span><ChevronDown size={16}/></button>
      {objectPickerOpen&&(<div className="castle-editor-object-options">{items.map(p=><button key={p.id} aria-pressed={p.id===b.id} onClick={e=>{onSelect(p.id);setInspectorOpen(true);setObjectPickerOpen(false);objectPicker.current?.querySelector<HTMLButtonElement>('.castle-editor-object-trigger')?.focus();}}><img src={modularCastleAssets[p.image]||p.image} alt=""/><span>{ru?p.name:en[p.id]||decorCatalog.find(d=>d.id===p.catalogId)?.en||p.name}</span></button>)}</div>)}
     </div>
     <button className="castle-editor-icon" aria-label={t(inspectorOpen?'Свернуть свойства':'Развернуть свойства',inspectorOpen?'Collapse details':'Expand details')} aria-expanded={inspectorOpen} onClick={()=>{setInspectorOpen(v=>!v);setInspector(null);}}><span aria-hidden="true">{inspectorOpen?"−":"+"}</span></button>
    </div>
    {inspectorOpen&&<div className="castle-editor-inspector-body">
     {b.placed===false&&<p role="status">{t("Выбери место на карте","Choose a position on the map")}</p>}
     <div className={`castle-editor-actions${b.decor?' castle-editor-actions--decor':''}`}>
      <button aria-label={t('Размер','Size')} title={t('Размер','Size')} aria-expanded={inspector==='size'} onClick={()=>setInspector(v=>v==='size'?null:'size')}><Maximize2 size={21}/></button>
      <button aria-label={t('Отразить','Flip')} title={t('Отразить','Flip')} aria-pressed={!!b.mirrored} onClick={()=>update(p=>{p.mirrored=!p.mirrored;})}><FlipHorizontal2 size={21}/></button>
      {!b.decor?<button aria-label={t('Подпись','Caption')} title={t('Подпись','Caption')} aria-expanded={inspector==='caption'} onClick={()=>setInspector(v=>v==='caption'?null:'caption')}><Type size={21}/></button>:<>
       <button aria-label={t('Копировать','Copy')} title={t('Копировать','Copy')} disabled={buildings.length>=decorLimit} onClick={()=>{setDecorErasing(false);onCopy(b);setCatalogOpen(false);setInspector(null);}}><Copy size={20}/></button>
       <button aria-label={t('Добавить декор','Add decor')} title={t('Добавить декор','Add decor')} onClick={()=>{setDecorErasing(false);setCatalogOpen(true);setInspectorOpen(false);}}><Plus size={21}/></button>
       <button aria-label={t('Очистить категорию','Clear category')} title={t('Очистить категорию','Clear category')} aria-pressed={decorErasing} onClick={()=>{onCancelPlacement();setDecorErasing(v=>!v);setInspector(null);}}><Trash2 size={20}/></button>
      </>}
     </div>
     {inspector==='size'&&<div className="castle-editor-detail">{field(t('Размер объекта, %','Object size, %'),b.size/base*100,n=>update(p=>resizeBuilding(p,base*n/100)),50,BUILDING_SCALE_MAX*100)}</div>}
     {inspector==='caption'&&!b.decor&&<div className="castle-editor-detail">
      <button role="switch" aria-checked={!b.captionHidden} onClick={()=>update(p=>{p.captionHidden=!p.captionHidden;})}>{t('Показывать название','Show name')}: {b.captionHidden?t('нет','off'):t('да','on')}</button>
      <span>{t('Положение подписи','Caption position')}</span>
      <div className="castle-editor-directions">{[[ArrowLeft,-2,0],[ArrowUp,0,-2],[ArrowDown,0,2],[ArrowRight,2,0]].map(([Icon,dx,dy],i)=>{const Glyph=Icon as typeof ArrowLeft;return <button key={i} aria-label={t(['Подпись влево','Подпись вверх','Подпись вниз','Подпись вправо'][i],['Caption left','Caption up','Caption down','Caption right'][i])} onClick={()=>update(p=>{p.caption.x=Math.max(-240,Math.min(240,p.caption.x+Number(dx)));p.caption.y=Math.max(-240,Math.min(240,p.caption.y+Number(dy)));})}><Glyph size={16}/></button>;})}</div>
      {field(t('Текст','Text'),b.caption.font,n=>update(p=>{p.caption.font=n;p.caption.height=Math.max(p.caption.height,n*(1+(p.lines.length-1)*1.15)+6);}),10,26)}
      {field(t('Плашка','Plaque'),b.caption.height,n=>update(p=>{p.caption.height=Math.max(n,p.caption.font*(1+(p.lines.length-1)*1.15)+6);}),16,80)}
     </div>}
     {b.id==='gates'&&<div className="castle-editor-gates"><span>{t('Ворота · верхняя ограда','Gate · upper fence')}</span><button aria-label={t('Ворота влево','Gate left')} onClick={()=>update(p=>{p.x=Math.max(-400,p.x-20);})}><ArrowLeft size={17}/></button><button aria-label={t('Ворота вправо','Gate right')} onClick={()=>update(p=>{p.x=Math.min(1200,p.x+20);})}><ArrowRight size={17}/></button></div>}
    </div>}
   </aside>}
  </fieldset>
   <footer className="castle-editor-footer">
    <div className="castle-map-controls" role="group" aria-label={t('Размер выбранного объекта','Selected object size')}>
     <button className="castle-editor-icon" aria-label={t('Уменьшить объект','Shrink object')} title={t('Уменьшить выбранный объект','Shrink selected object')} disabled={busy||!b||tab==='paths'||(tab==='decor'&&catalogOpen)||!!pendingDecor||decorErasing||b.size<=base*.5} onClick={()=>update(p=>resizeBuilding(p,Math.max(base*.5,p.size-base*.05)))}>−</button>
     <button className="castle-editor-icon" aria-label={t('Увеличить объект','Enlarge object')} title={t('Увеличить выбранный объект','Enlarge selected object')} disabled={busy||!b||tab==='paths'||(tab==='decor'&&catalogOpen)||!!pendingDecor||decorErasing||b.size>=base*BUILDING_SCALE_MAX} onClick={()=>update(p=>resizeBuilding(p,Math.min(base*BUILDING_SCALE_MAX,p.size+base*.05)))}>+</button>
    </div>
    <button className="castle-editor-icon" aria-label={t('Отменить шаг','Undo')} disabled={busy||!canUndo} onClick={onUndo}><Undo2 size={19}/></button>
    <span role="status">{status||(dirty?t('Изменено','Changed'):t('Сохранено в аккаунте','Saved to account'))}</span>
    <button className="castle-editor-save" disabled={busy||!dirty||!!pendingDecor} onClick={()=>onSave()}>{busy?t('Сохраняю…','Saving…'):dirty?t('Сохранить','Save'):(status||t('Сохранено','Saved'))}</button>
    {onReload&&<details className="castle-editor-recovery"><summary aria-label={t('Ещё','More')} title={t('Ещё','More')}>⋯</summary><div>{onReload&&<button disabled={busy&&!error} onClick={()=>{if(!dirty||window.confirm(t('Загрузить расстановку с сервера? Несохранённые изменения будут потеряны.','Load the server layout? Unsaved changes will be lost.')))onReload();}}>{t('Загрузить актуальную','Load latest')}</button>}</div></details>}
   </footer>
   {error&&<p className="castle-editor-error" role="alert">{error}</p>}
  </div>
  <dialog ref={dialogRef} className="castle-editor-confirm" aria-label={t('Сохранить изменения?','Save changes?')} onClose={()=>setClosing(false)} onCancel={e=>{if(busy)e.preventDefault();else setClosing(false);}}><strong>{t('Сохранить изменения?','Save changes?')}</strong><button className="castle-editor-save" disabled={busy} onClick={async()=>{if(await onSave())onDone();}}>{t('Сохранить','Save')}</button><button disabled={busy} onClick={()=>{onDiscard();onDone();}}>{t('Выйти без сохранения','Discard and close')}</button><button disabled={busy} onClick={()=>setClosing(false)}>{t('Остаться','Stay')}</button></dialog>
 </section>;
}





