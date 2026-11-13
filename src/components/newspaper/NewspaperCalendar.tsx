import {useState} from 'react';
import type {NewspaperView} from '@/lib/newspaper';
import {calendarCells,monthOffset} from './calendar';
import './calendar.css';

export function NewspaperCalendar({owned,ru,onOpen}:{owned:NewspaperView[];ru:boolean;onOpen:(issue:NewspaperView)=>void}){
 const current=new Date().toISOString().slice(0,7);
 const [month,setMonth]=useState(current);
 const saved=new Map(owned.map(i=>[i.date,i]));
 const count=[...saved.keys()].filter(date=>date.startsWith(month)).length;
 const earliest=owned.reduce((min,i)=>i.date.slice(0,7)<min?i.date.slice(0,7):min,current);
 const title=new Date(month+'-01T12:00:00Z').toLocaleDateString(ru?'ru':'en',{month:'long',year:'numeric',timeZone:'UTC'}).replace(' г.','');
 const cells=calendarCells(month);
 return <section className="np-calendar" aria-label={ru?'Коллекция газет':'Newspaper collection'}>
  <div className="np-month"><button disabled={month<=earliest} aria-label={ru?'Предыдущий месяц':'Previous month'} onClick={()=>setMonth(monthOffset(month,-1))}>‹</button><h2>{title}</h2><button disabled={month>=current} aria-label={ru?'Следующий месяц':'Next month'} onClick={()=>setMonth(monthOffset(month,1))}>›</button></div>
  <p className="np-count" aria-live="polite">{ru?`Собрано: ${count}`:`Collected: ${count}`}</p>
  <div className="np-weekdays" aria-hidden="true">{(ru?['Пн','Вт','Ср','Чт','Пт','Сб','Вс']:['Mo','Tu','We','Th','Fr','Sa','Su']).map(d=><span key={d}>{d}</span>)}</div>
  <div className={`np-days np-weeks-${cells.length/7}`}>
   {cells.map((cell,index)=>{
    if(!cell)return <span key={'empty'+index} className="np-empty" aria-hidden="true"/>;
    const issue=saved.get(cell.date);
    const future=cell.date>new Date().toISOString().slice(0,10);
    const status=issue?(ru?'Собрана':'Collected'):(future?(ru?'Будущая дата':'Future date'):(ru?'Не собрана':'Not collected'));
    const date=new Date(cell.date+'T12:00:00Z').toLocaleDateString(ru?'ru':'en',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    return <button key={cell.date} className={`np-day ${issue?'np-collected':future?'np-no-issue':'np-missing'}`} disabled={!issue} aria-label={`${date}. ${status}${issue&&!issue.read?(ru?'. Не прочитано':'. Unread'):''}`} onClick={()=>issue&&onOpen(issue)}>
      <span>{cell.day}</span><span aria-hidden="true" className="np-day-mark">{issue?'✓':future?'—':<span className="np-box"/>}</span>
      {issue&&!issue.read&&<i className="np-unread" aria-hidden="true"/>}
    </button>;
   })}
  </div>
  <div className="np-legend"><span><b>✓</b>{ru?'Собрана':'Collected'}</span><span><i className="np-box"/>{ru?'Не собрана':'Missing'}</span><span><i className="np-dot"/>{ru?'Не прочитано':'Unread'}</span></div>
  <p className="np-calendar-hint">{ru?'Нажми на собранную дату, чтобы читать':'Select a collected date to read'}</p>
 </section>;
}
