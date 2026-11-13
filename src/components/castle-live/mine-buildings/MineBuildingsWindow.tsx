import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useQuery} from '@tanstack/react-query';
import {X,Lock,Pickaxe,ScrollText,HandCoins,Loader2,MapPin} from 'lucide-react';
import {useLang} from '@/lib/i18n';
import {getBetaRaidState} from '@/server/api/beta-raid';
import {getMineOffice} from '@/server/api/mine-office/mine-office-own';
import {useCastleArchitect} from '../useWithArchitect';
import {MINE_OFFICE_OWNED_KEY} from '../useWithMineOffice';
import {ArchitectScreen} from '../architect/ArchitectScreen';
import {OfficeTabs} from '../mine-office/OfficeTabs';
import type {MapSpot} from '../mine-office/OfficeLost';
import {useOfficeMines,useOfficeClaimAll} from '../mine-office/useMineOffice';
import {RepairAll} from '../mine-office/RepairAll';
import {useMineListNow} from '@/components/beta-raid/hud/useMineListNow';
import {mineRowReady} from '@/lib/mineLost';
import {requestCenter} from '@/components/beta-raid/centerMapBus';
import managementHeader from './assets/mine-management-header.webp';
import architectHeader from './assets/mine-architect-header.webp';
import './mine-buildings.css';
import '../mine-office/compact-card.css';

type Building='mine_office'|'architect';
const titles={ru:{mine_office:'Управление шахтами',architect:'Архитектор рудников'},en:{mine_office:'Mine management',architect:'Mine architect'}};
function CollectAll(){
 const ru=useLang()!=='en',q=useOfficeMines(),all=useOfficeClaimAll(),mines=q.data?.mines??[],now=useMineListNow(q.data,mines);
 if(!mines.length||q.isError)return null;
 return <footer className="mb-footer mb-footer-pair"><RepairAll l={ru?'ru':'en'} mines={mines} now={now}/><button type="button" className="mb-gold" disabled={all.isPending||!mines.some(m=>mineRowReady(m,now)>0)} onClick={()=>all.mutate()}>{all.isPending?<Loader2 className="mb-spin" size={21}/>:<HandCoins size={24}/>}<span>{ru?'Собрать всё':'Collect all'}</span></button></footer>;
}
/** Both entrances share the same UI; ownership only unlocks the second tab. */
export function MineBuildingsWindow({entry,onClose}:{entry:Building;onClose:()=>void}){
 const l=useLang()==='en'?'en':'ru',ru=l==='ru';
 const [active,setActive]=useState(entry),[locked,setLocked]=useState<Building|null>(null),[location,setLocation]=useState<MapSpot|null>(null);
 const nested=useRef<HTMLDivElement>(null),lastNestedFocus=useRef<HTMLElement|null>(null),root=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 const architect=useCastleArchitect();
 const office=useQuery({queryKey:MINE_OFFICE_OWNED_KEY,queryFn:()=>getMineOffice(),staleTime:0,retry:1});
 const raid=useQuery({queryKey:['beta-raid-state'],queryFn:()=>getBetaRaidState(),enabled:!!location,staleTime:0});
 const order:Building[]=[entry,entry==='mine_office'?'architect':'mine_office'];
 const exists=(id:Building)=>id===entry||(id==='architect'?(architect.data?.level??0)>0:office.data?.owned===true);
 const pending=(id:Building)=>id!==entry&&(id==='architect'?architect.isPending:office.isPending);
 const failed=(id:Building)=>id==='architect'?architect.isError:office.isError;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';closeButton.current?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus();};},[]);
 useEffect(()=>{body.current?.scrollTo({top:0});},[active]);
 useEffect(()=>{if(locked||location){lastNestedFocus.current=document.activeElement as HTMLElement;nested.current?.querySelector<HTMLButtonElement>('button')?.focus();}else lastNestedFocus.current?.focus();},[locked,location]);
 function select(id:Building){if(exists(id)){setActive(id);return;}if(pending(id))return;setLocked(id);}
 function upgrade(){onClose();window.dispatchEvent(new CustomEvent('yuplink:mine-architect-upgrade'));}
 return createPortal(<div className="mine-buildings" ref={root} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(location)setLocation(null);else if(locked)setLocked(null);else onClose();}
   if(e.key==='Tab'){const items=Array.from((nested.current??root.current)?.querySelectorAll<HTMLElement>('button:not(:disabled),select,a[href],[tabindex="0"]')??[]).filter(x=>x.offsetParent!==null);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}><section className="mb-window" role="dialog" aria-modal="true" aria-labelledby="mine-building-title">
 <header className="mb-header mb-scenic-header"><img className="mb-header-scene" src={active==='mine_office'?managementHeader:architectHeader} alt=""/><h1 id="mine-building-title">{titles[l][active]}</h1><button ref={closeButton} type="button" className="mb-close" onClick={onClose} aria-label={ru?'Закрыть окно':'Close window'}><X size={26}/></button></header>
 <nav className="mb-tabs" role="tablist" aria-label={ru?'Здания замка':'Castle buildings'}>{order.map(id=><button type="button" role="tab" key={id} id={'mb-tab-'+id} aria-controls={'mb-panel-'+id} aria-selected={id===active} aria-disabled={!exists(id)} onClick={()=>select(id)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?order[0]:e.key==='End'?order[1]:order.find(x=>x!==id)!;document.getElementById('mb-tab-'+next)?.focus();}}}>{id==='mine_office'?<Pickaxe size={21}/>:<ScrollText size={21}/>}<span>{titles[l][id]}</span>{pending(id)?<Loader2 className="mb-spin" size={16}/>:!exists(id)?<Lock size={16}/>:null}</button>)}</nav>
 <div className="mb-content" ref={body} role="tabpanel" id={'mb-panel-'+active} aria-labelledby={'mb-tab-'+active} tabIndex={0}>{active==='mine_office'?<OfficeTabs l={l} onMap={setLocation}/>:<ArchitectScreen ru={ru} onUpgrade={upgrade}/>}</div>{active==='mine_office'&&<CollectAll/>}
 </section>
 {locked&&<div className="mb-dialog-layer" ref={nested}><section role="dialog" aria-modal="true" className="mb-message"><button type="button" className="mb-close" onClick={()=>setLocked(null)} aria-label={ru?'Закрыть сообщение':'Close message'}><X/></button><h2>{failed(locked)?(ru?'Не удалось проверить здание':'Could not check building'):(ru?'Здание ещё не построено':'Building not built yet')}</h2><p>{failed(locked)?(ru?'Повтори загрузку.':'Please retry.'):(ru?`Построй «${titles.ru[locked]}», чтобы открыть вторую вкладку.`:`Build “${titles.en[locked]}” to unlock the second tab.`)}</p><button type="button" className="mb-gold" onClick={()=>{if(failed(locked))void(locked==='architect'?architect.refetch():office.refetch());setLocked(null);}}>{failed(locked)?(ru?'Повторить':'Retry'):(ru?'Понятно':'Got it')}</button></section></div>}
 {location&&<div className="mb-dialog-layer" ref={nested}><section role="dialog" aria-modal="true" className="mb-message"><button type="button" className="mb-close" onClick={()=>setLocation(null)} aria-label={ru?'Закрыть карту':'Close map'}><X/></button><h2>{location.place||location.mapId} · {location.q}, {location.r}</h2><p>{raid.isFetching?(ru?'Загрузка карты…':'Loading map…'):raid.isError?(ru?'Не удалось загрузить карту.':'Could not load the map.'):raid.data?.mapId!==location.mapId?(ru?'Шахта находится в другом мире.':'This mine is in another world.'):ru?'Показать выбранную клетку на карте. Герой останется на месте.':'Show the selected cell on the map. Your hero stays in place.'}</p><button type="button" className="mb-gold" disabled={raid.isFetching||raid.isError||raid.data?.mapId!==location.mapId} onClick={()=>{if(raid.isFetching||raid.isError||raid.data?.mapId!==location.mapId)return;onClose();requestCenter({q:location.q,r:location.r,ttlMs:3000});}}><MapPin size={18}/>{ru?'Показать на карте':'Show on map'}</button>{raid.isError&&<button type="button" className="mb-outline" onClick={()=>void raid.refetch()}>{ru?'Повторить':'Retry'}</button>}</section></div>}
 </div>,document.body);
}

