import React,{useId,useState} from 'react';
import {weatherShown,type MapWeatherShown} from '@/lib/raid/weatherYield';
import {WeatherBadge} from '@/components/beta-raid/weather/WeatherBadge';
import {ChevronDown,Clock,Expand,Wrench,Loader2,TriangleAlert} from 'lucide-react';
import {MINE_MODES,type MineMode} from '@/lib/mineV2';
import {mineLifePct,mineBrokenNow,mineLeftAfterSwitch} from '@/lib/mineV2Clock';
import {Resource,blueprintArt} from '../mine-buildings/Art';
import {names,tr,duration,type Kind,type Lang} from '../mine-buildings/presentation';
import {formatQty as fmt} from '@/lib/formatQty';
import {mineRowReady} from '@/lib/mineLost';
import type {OfficeMine as Mine} from '@/server/api/mine-office/mine-office-list';
import {useOfficeClaim,useOfficeRepair,useOfficeSetMode} from './useMineOffice';
import {MineModeConfirm} from '@/components/beta-raid/mine/MineModePicker';

export function MineCard({m,l,onMap,now,weather}:{m:Mine;l:Lang;onMap:(m:Mine)=>void;now:number;weather?:MapWeatherShown}){
 const claim=useOfficeClaim(m),repair=useOfficeRepair(m),mode=useOfficeSetMode(m),ready=mineRowReady(m,now),id=useId(),[expanded,setExpanded]=useState(false),[pick,setPick]=useState<MineMode|null>(null);
 const broken=mineBrokenNow(m.view,now),pct=mineLifePct(m.view,now),manageable=!broken&&!m.view.island;
 const busy=claim.isPending||repair.isPending||mode.isPending,remaining=m.view.breakAt-now;
 const shown=weatherShown(m.yield,m.island?1:weather?.coefs.mine,m.island?null:weather?.kind);
 const rate=broken?0:(!Number.isFinite(m.yield)||(!m.island&&!weather)?null:shown.value*(m.stepHours===24?24:1));
 const rateText=rate===null?'—':`${fmt(rate)}${tr(l,m.stepHours===24?'/сут':'/ч',m.stepHours===24?'/day':'/h')}`;
 const rateTitle=rate===null?tr(l,'Выработка временно недоступна: обновляем погоду мира','Production temporarily unavailable: refreshing world weather'):tr(l,'Текущая выработка с учётом режима и погоды','Current production including mode and weather');
 const modes={ru:{base:'Бережно',mid:'Усердно',max:'На износ'},en:{base:'Careful',mid:'Hard work',max:'Overdrive'}};
 return <article className={'mb-mine mb-compact '+(broken?'broken ':'')+(expanded&&manageable?'is-open':'')} aria-label={`${names[l][m.kind]} ${m.q}, ${m.r}`}>
  <button className="mb-object" aria-label={tr(l,`Показать карту: ${m.place}, ${m.q}, ${m.r}`,`Show map: ${m.mapId}, ${m.q}, ${m.r}`)} onClick={()=>onMap(m)}>
   <img src={blueprintArt[m.kind]} alt=""/><Expand size={13} aria-hidden="true"/>
  </button>
  <div className="mb-identity"><h3>{names[l][m.kind]}</h3><p className="mb-level-rate">{!m.view.island&&<span>{tr(l,'Ур.','Lv.')} {m.level}</span>}<span className="mb-production-rate" title={rateTitle} aria-label={`${rateTitle}: ${rateText}`}>{!m.view.island&&<span aria-hidden>· </span>}{rateText}{!broken&&rate!==null&&shown.kind&&<WeatherBadge kind={shown.kind}/>}</span></p></div>
  <div className="mb-compact-ready"><span>{tr(l,'Готово','Ready')} <b>{fmt(ready)}</b><Resource kind={m.kind} lang={l}/></span>
   <button className="mb-gold" disabled={busy||ready<=0} onClick={()=>claim.mutate()}>{claim.isPending?<Loader2 className="mb-spin" size={14}/>:null}{tr(l,'Собрать','Collect')}</button>
  </div>
  <div className="mb-compact-summary">
   {broken?<strong className="mb-danger mb-broken-label"><TriangleAlert size={15}/>{tr(l,'Сломана','Broken')}</strong>:<span className={'mb-remaining '+(remaining<3600000?'mb-danger':remaining<3*3600000?'mb-warning':'')}><Clock size={14}/><span>{tr(l,m.view.island?'До истощения':'До поломки',m.view.island?'Exhausts in':'Breaks in')} <b>{duration(remaining,l)}</b></span></span>}
   {manageable&&<button className="mb-manage-toggle" aria-expanded={expanded} aria-controls={expanded?id:undefined} onClick={()=>{setExpanded(!expanded);setPick(null)}}>{tr(l,'Управление','Manage')}<ChevronDown className={expanded?'up':''} size={15}/></button>}
  </div>
  {expanded&&manageable&&<div className="mb-management" id={id}>
   <div className="mb-stock"><span>{tr(l,'Запас','Life')} <b>{pct}%</b></span><div className="mb-bar" role="progressbar" aria-label={tr(l,'Запас службы','Service life')} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{width:pct+'%',background:pct>50?'#49d5a1':pct>20?'#edc05e':'#f4656b'}}/></div></div>
   <div className="mb-modes" role="group" aria-label={tr(l,'Режим работы','Work mode')}>{MINE_MODES.map(x=><button key={x.id} aria-pressed={(pick??m.view.mode)===x.id} className={(pick??m.view.mode)===x.id?'selected':''} disabled={busy} onClick={()=>setPick(m.view.mode===x.id?null:x.id)}>{modes[l][x.id]} <span>×{x.mult}</span></button>)}</div>
   {pick&&<div className="mb-confirm"><strong>{modes[l][pick]}</strong><MineModeConfirm pick={pick} v2={m.view} now={now} busy={mode.isPending} onApply={()=>mode.mutate({mode:pick,leftMs:mineLeftAfterSwitch(m.view,pick,now)},{onSuccess:()=>setPick(null)})} onCancel={()=>setPick(null)}/></div>}
   <button className="mb-repair mb-outline" disabled={busy} onClick={()=>repair.mutate()}>{repair.isPending?<Loader2 className="mb-spin" size={15}/>:<Wrench size={15}/>}<span>{tr(l,'Починить за','Repair for')}</span>{Object.entries(m.view.repairCost).map(([k,v])=><span key={k}><Resource kind={k as Kind} lang={l}/><b>{fmt(Number(v))}</b></span>)}</button>
  </div>}
 </article>
}
