import {RepairAll} from './RepairAll';
import './group-repair.css';
import React,{useState,useEffect,useRef,useId} from 'react';
import {ChevronDown,Clock,Loader2} from 'lucide-react';
import {Resource} from '../mine-buildings/Art';
import {kinds,groups,tr,duration,type Kind,type Lang} from '../mine-buildings/presentation';
import type {OfficeMine as Mine} from '@/server/api/mine-office/mine-office-list';
import {useMineListNow} from '@/components/beta-raid/hud/useMineListNow';
import {useOfficeMines} from './useMineOffice';
import {useWeatherByMap} from '@/components/beta-raid/weather/useWeatherByMap';
import {MineCard} from './CompactMineCard';
import {officeMineKey,useStableMineOrder} from './useStableMineOrder';
export function Office({l,onMap}:{l:Lang;onMap:(m:Mine)=>void}){
 const q=useOfficeMines(),mines=q.data?.mines??[],now=useMineListNow(q.data,mines),[filter,setFilter]=useState<Kind|'all'>('all'),[open,setOpen]=useState<Kind[]>(['diamonds']),[sort,setSort]=useState('soon'),[world,setWorld]=useState('all'),order=useStableMineOrder(mines,sort,now);
 const weather=useWeatherByMap(mines.filter(m=>!m.island).map(m=>m.mapId));
 if(q.isPending)return <div className="mb-empty" role="status"><Loader2 className="mb-spin"/>{tr(l,'Загружаем шахты…','Loading mines…')}</div>;
 if(q.isError)return <div className="mb-empty" role="alert"><h2>{tr(l,'Не удалось загрузить шахты','Could not load mines')}</h2><button className="mb-outline" onClick={()=>q.refetch()}>{tr(l,'Повторить','Retry')}</button></div>;
 if(!mines.length)return <div className="mb-empty"><h2>{tr(l,'У тебя пока нет шахт','You have no mines yet')}</h2><p>{tr(l,'Здесь появятся твои шахты на всех картах.','Your mines across all maps will appear here.')}</p></div>;
 const worlds=[...new Map(mines.map(m=>{const name=m.place?.trim()||m.mapId;return [m.mapId,name==='Мир Альфа'||name==='World Alpha'?tr(l,'Мидгард','Midgard'):name];})).entries()];
 const activeWorld=worlds.some(([id])=>id===world)?world:'all';
 const worldMines=activeWorld==='all'?mines:mines.filter(m=>m.mapId===activeWorld);
 const visible=filter==='all'?kinds:[filter];
 const hasResults=worldMines.some(m=>filter==='all'||m.kind===filter);
 function choose(k:Kind|'all'){setFilter(k);if(k!=='all')setOpen(o=>o.includes(k)?o:[...o,k])}
 return <><div className="mb-filters" aria-label={tr(l,'Вид ресурса','Resource type')}><button aria-pressed={filter==='all'} onClick={()=>choose('all')}>{tr(l,'Все','All')} <b>{worldMines.length}</b></button>{kinds.map(k=><button key={k} aria-pressed={filter===k} aria-label={`${groups[l][k]}: ${worldMines.filter(m=>m.kind===k).length}`} onClick={()=>choose(k)}><Resource kind={k} decorative/><span>{worldMines.filter(m=>m.kind===k).length}</span></button>)}</div>
 <div className="mb-browse-controls">
 <div className="mb-sort"><span>{tr(l,'Мир','World')}</span><MineSelect label={tr(l,'Мир шахт','Mine world')} options={[["all",tr(l,'Все миры','All worlds')],...worlds]} value={activeWorld} onChange={setWorld}/></div>
 <div className="mb-sort"><span>{tr(l,'Сортировка','Sort')}</span><MineSelect label={tr(l,'Сортировка шахт','Mine sorting')} options={[["soon",tr(l,'Скоро сломаются','Breaking soon')],["ready",tr(l,'Больше к сбору','Most ready to collect')],["level",tr(l,'По уровню','By level')]]} value={sort} onChange={setSort}/></div>
 </div>
 {!hasResults&&<div className="mb-filter-empty" role="status"><p>{tr(l,'В этом мире нет шахт выбранного ресурса.','No mines of this resource in this world.')}</p><button className="mb-outline" onClick={()=>choose('all')}>{tr(l,'Все ресурсы','All resources')}</button></div>}
 <div className="mb-groups">{visible.map(k=>{const rows=worldMines.filter(m=>m.kind===k).sort((a,b)=>(order.get(officeMineKey(a))??0)-(order.get(officeMineKey(b))??0));if(!rows.length)return null;const expanded=open.includes(k),remaining=Math.min(...rows.map(m=>m.view.breakAt-now));return <section className={'mb-group '+(expanded?'expanded':'')} key={k}><button className="mb-group-title" aria-expanded={expanded} aria-controls={'group-'+k} onClick={()=>setOpen(o=>expanded?o.filter(x=>x!==k):[...o,k])}><Resource kind={k} decorative/><h2>{groups[l][k]} <span>· {rows.length}</span></h2><span className={'mb-group-time '+(remaining<3600000?'mb-danger':'')}><Clock size={14}/>{remaining<=0?tr(l,'Есть сломанная','Broken mine'):tr(l,'от ','from ')+duration(remaining,l)}</span><ChevronDown className={expanded?'up':''} size={18}/></button>{expanded&&<div className="mb-group-rows" id={'group-'+k}>{rows.map(m=><MineCard key={`${m.mapId}:${m.q},${m.r}`} m={m} l={l} onMap={onMap} now={now} weather={weather.get(m.mapId)}/>)}<div className="mb-group-repair"><RepairAll key={activeWorld} l={l} mines={rows} now={now} scopeLabel={`${groups[l][k]} · ${activeWorld==='all'?tr(l,'Все миры','All worlds'):worlds.find(([id])=>id===activeWorld)![1]}`}/></div></div>}</section>})}</div></>
}

// Approved list style: selected row alone receives the warm fill and gold rail.
function MineSelect({label,options,value,onChange}:{label:string;options:string[][];value:string;onChange:(value:string)=>void}){
 const [open,setOpen]=useState(false),[focused,setFocused]=useState(0),id=useId();
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),items=useRef<(HTMLButtonElement|null)[]>([]);
 const selected=options.findIndex(([key])=>key===value);
 useEffect(()=>{if(open)items.current[focused]?.focus();},[open,focused]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 function show(){setFocused(selected);setOpen(true);}
 function choose(index:number){onChange(options[index][0]);setOpen(false);trigger.current?.focus();}
 return <div className="mb-select" ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}}>
  <button type="button" ref={trigger} className="mb-sort-trigger" aria-label={label} title={options[selected][1]} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>open?setOpen(false):show()} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();show();}}}>{options[selected][1]}<ChevronDown className="mb-select-arrow" aria-hidden="true" size={16}/></button>
  {open&&<div id={id} role="listbox" aria-label={label} className="mb-sort-menu" onKeyDown={e=>{
   if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();setFocused(i=>e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length);}
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}
  }}>{options.map(([key,label],i)=><button key={key} type="button" role="option" aria-selected={value===key} tabIndex={i===focused?0:-1} ref={el=>{items.current[i]=el;}} onClick={()=>choose(i)}>{label}</button>)}</div>}
 </div>;
}



