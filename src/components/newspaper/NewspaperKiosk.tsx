import {useEffect,useState} from 'react';
import {useLang} from '@/lib/i18n';
import {humanError} from '@/lib/humanError';
import type {KioskNewspapers,NewspaperView} from '@/lib/newspaper';
import {getKioskNewspapers} from '@/server/api/newspaper-kiosk/kiosk-papers';
import {markNewspaperRead,deferNewspaper} from '@/server/api/newspaper/paper-map';
import {NewspaperCalendar} from './NewspaperCalendar';
import {Reader} from './Reader';
export function NewspaperKiosk({onBack}:{onBack:()=>void}){
 const ru=useLang()==='ru';
 const [shelves,setShelves]=useState<KioskNewspapers|null>(null);
 const [tab,setTab]=useState<'collection'|'deferred'|'read'>('collection');
 const [issue,setIssue]=useState<NewspaperView|null>(null);
 const [error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setShelves(null);setError(null);
  getKioskNewspapers().then(v=>{if(active)setShelves(v);}).catch(e=>{if(active)setError(humanError(e));});
  return()=>{active=false;};
 },[revision]);
 const close=()=>{setIssue(null);setRevision(n=>n+1);};
 if(issue)return <Reader key={issue.issueId} issue={issue} onBack={()=>setIssue(null)} onCollect={async()=>{
  await markNewspaperRead({data:{issueId:issue.issueId}});close();
 }} onDefer={async()=>{await deferNewspaper({data:{issueId:issue.issueId}});close();}}/>;
 const date=(value:string)=>new Date(value+'T12:00:00Z').toLocaleDateString(ru?'ru':'en',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).replace(' г.','');
 return <main className="np-kiosk" onKeyDown={e=>{if(e.key==='Escape')onBack();}}><header className="np-banner"><nav><button autoFocus onClick={onBack}>‹ {ru?'Замок':'Castle'}</button><h1>{ru?'Газетный киоск':'Newspaper kiosk'}</h1></nav></header><div className="np-list">
 <div role="tablist" aria-label={ru?'Мои газеты':'My newspapers'}>{(['collection','deferred','read'] as const).map(key=><button key={key} role="tab" tabIndex={tab===key?0:-1} aria-selected={tab===key} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const keys=['collection','deferred','read'] as const;const next=(keys.indexOf(key)+(e.key==='ArrowRight'?1:2))%3;e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();setTab(keys[next]);}}} onClick={()=>setTab(key)}>{key==='collection'?(ru?'Коллекция':'Collection'):key==='deferred'?(ru?'Отложенные':'Read later'):(ru?'Прочитанные':'Read')}</button>)}</div>
 {error?<p role="alert">{error} <button onClick={()=>setRevision(n=>n+1)}>{ru?'Повторить':'Retry'}</button></p>:!shelves?<p role="status">{ru?'Загрузка газет…':'Loading newspapers…'}</p>:<div role="tabpanel">
 {tab==='collection'?<NewspaperCalendar owned={[...shelves.deferred,...shelves.read].flatMap(g=>g.issues)} ru={ru} onOpen={setIssue}/>:<>
 {shelves[tab].length===0&&<p>{tab==='deferred'?(ru?'Отложенных газет пока нет.':'No newspapers saved for later.'):(ru?'Прочитанных газет пока нет.':'No read newspapers yet.')}</p>}
 {shelves[tab].map(group=><section key={group.week}><h3>{ru?'Неделя с':'Week of'} {date(group.week)}</h3>{group.issues.map(item=><button className="np-issue" key={item.issueId} onClick={()=>setIssue(item)}><span>{date(item.date)}</span><span className="np-issue-action">{!item.read&&<i className="np-unread-dot" aria-hidden="true"/>}{ru?'Прочитать':'Read'} <span aria-hidden="true">›</span></span></button>)}</section>)}</> }
 </div>}</div></main>;
}
