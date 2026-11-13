import {useEffect,useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import {useLang} from '@/lib/i18n';
import {humanError} from '@/lib/humanError';
import {newspaperPageSrc,newspaperEdition,newspaperPage} from '@/lib/newspaper';

type ReaderIssue={issueId:string;date:string;title:string|null;imageUrl:string;editions?:import('@/lib/newspaper').NewspaperEditions|null;read:boolean;canDefer:boolean;kiosk:boolean};
type ReaderProps={onBack:()=>void|Promise<void>;onCollect:()=>void|Promise<void>;onDefer:()=>void|Promise<void>;issue:ReaderIssue};
export function Reader(props:ReaderProps){
 const lang=useLang(),edition=newspaperEdition(props.issue,lang);
 if(!edition)return <section className="np-request" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();void props.onBack();}}}><p role="status">English edition is not available for this issue yet.</p><button autoFocus onClick={()=>void props.onBack()}>Back</button></section>;
 return <LocalizedReader key={JSON.stringify([props.issue.issueId,lang,edition])} {...props} edition={edition}/>;
}
function LocalizedReader({onBack,onDefer,onCollect,issue,edition}:ReaderProps&{edition:import('@/lib/newspaper').NewspaperEdition}){
 const ru=useLang()==='ru';
 const [retry,setRetry]=useState(0);
 const [busy,setBusy]=useState(false),[actionError,setActionError]=useState('');
 const pending=useRef(false),loaded=useRef(false);
 const dateLabel=new Date(issue.date+'T12:00:00Z').toLocaleDateString(ru?'ru':'en',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).replace(' г.','');
 async function act(action:'back'|'defer'|'collect'){if(pending.current||(action==='collect'&&!loaded.current))return;pending.current=true;setBusy(true);setActionError('');try{if(action==='defer')await onDefer();else if(action==='collect')await onCollect();else await onBack();}catch(e){setActionError(humanError(e));}finally{pending.current=false;setBusy(false);}}

 const [page,setPage]=useState(0),[scale,setScale]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[status,setStatus]=useState('loading');
 const box=useRef<HTMLDivElement>(null),points=useRef(new Map<number,{x:number,y:number}>());
 const gesture=useRef({x:0,y:0,ox:0,oy:0,dist:0,scale:1,multi:false,time:0});
 const reset=()=>{setScale(1);setOffset({x:0,y:0});};
 const pageInfo=newspaperPage(edition,page);
 const source=newspaperPageSrc(pageInfo.url);
 const currentSource=useRef(source);currentSource.current=source;
 const turn=(next:number)=>{const n=newspaperPage(edition,next);if(n.index!==page){if(n.url!==pageInfo.url){loaded.current=false;setStatus('loading');}setPage(n.index);reset();}};
 function clamp(x:number,y:number,s:number){const r=box.current?.getBoundingClientRect();const w=r?.width||360,h=w*4/3;return {x:Math.max(-w*(s-1)/2,Math.min(w*(s-1)/2,x)),y:Math.max(-h*(s-1)/2,Math.min(h*(s-1)/2,y))};}
 useEffect(()=>{const el=box.current;if(!el)return;const wheel=(e:WheelEvent)=>{if(!e.ctrlKey)return;e.preventDefault();const s=Math.max(1,Math.min(4,scale-e.deltaY*.01));setScale(s);setOffset(clamp(offset.x,offset.y,s));};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[scale,offset]);
 function down(e:PointerEvent){e.currentTarget.setPointerCapture(e.pointerId);points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=[...points.current.values()];gesture.current={x:p.length===2?(p[0].x+p[1].x)/2:e.clientX,y:p.length===2?(p[0].y+p[1].y)/2:e.clientY,ox:offset.x,oy:offset.y,dist:p.length===2?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0,scale,multi:p.length>1,time:Date.now()};}
 function move(e:PointerEvent){if(!points.current.has(e.pointerId))return;points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=[...points.current.values()],g=gesture.current;if(p.length===2&&g.dist){const s=Math.max(1,Math.min(4,g.scale*Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)/g.dist));const r=box.current!.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;setScale(s);setOffset(clamp((p[0].x+p[1].x)/2-cx-(g.x-cx-g.ox)*s/g.scale,(p[0].y+p[1].y)/2-cy-(g.y-cy-g.oy)*s/g.scale,s));}else if(scale>1&&!g.multi){setOffset(clamp(g.ox+e.clientX-g.x,g.oy+e.clientY-g.y,scale));}}
 const lastTap=useRef(0);
 function up(e:PointerEvent){const g=gesture.current;points.current.delete(e.pointerId);if(!g.multi){const dx=e.clientX-g.x,dy=e.clientY-g.y;if(scale===1&&Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))turn(page+(dx<0?1:-1));else if(Math.abs(dx)<8&&Math.abs(dy)<8&&Date.now()-g.time<300){if(Date.now()-lastTap.current<320){if(scale>1)reset();else setScale(2);lastTap.current=0;}else lastTap.current=Date.now();}}if(points.current.size===0)gesture.current.multi=false;}
 return <section onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();void act('back');}}} className={`np-reader${!issue.kiosk&&!issue.read&&issue.canDefer?' np-reader-with-hint':''}`}><header><button autoFocus disabled={busy} onClick={()=>void act('back')} aria-label={ru?'Назад':'Back'}>‹ {ru?'Назад':'Back'}</button><span>{edition.title}</span></header><time className="np-issue-date" dateTime={issue.date}>{dateLabel}</time><div className="np-reader-body"><div ref={box} tabIndex={0} role="region" aria-label={ru?`Страница ${page+1} из ${pageInfo.count}. Листайте стрелками клавиатуры или свайпом. Двойное нажатие увеличивает.`:`Page ${page+1} of ${pageInfo.count}. Swipe or use arrow keys. Double tap to zoom.`} className="np-paper" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>points.current.clear()} onKeyDown={e=>{if(e.key==='ArrowRight')turn(page+1);if(e.key==='ArrowLeft')turn(page-1);if(e.key==='Enter'){scale>1?reset():setScale(2);}}}>
 <div className="np-page-transform" style={{transform:`translate(${offset.x}px,${offset.y}px) scale(${scale})`}}><div className="np-page-crop"><img key={`${source}:${retry}`} draggable={false} src={source} alt={`${edition.title}, ${dateLabel}, ${ru?'страница':'page'} ${page+1}`} style={{left:pageInfo.half===0?'0':'-100%'}} onLoad={()=>{if(currentSource.current===source){loaded.current=true;setStatus('ready');}}} onError={()=>{if(currentSource.current===source){loaded.current=false;setStatus('error');}}}/></div></div>
 {status==='loading'&&<p className="np-load">{ru?'Загрузка газеты…':'Loading newspaper…'}</p>}{status==='error'&&<div className="np-load">{ru?'Не удалось открыть газету.':'Could not open the newspaper.'}<button onClick={()=>{loaded.current=false;setStatus('loading');setRetry(n=>n+1);}}>{ru?'Повторить':'Retry'}</button></div>}
 </div></div><footer><button aria-label={ru?'Предыдущая страница':'Previous page'} disabled={page===0} onClick={()=>turn(page-1)}>‹</button><span aria-live="polite">{page+1} / {pageInfo.count}</span><button aria-label={ru?'Следующая страница':'Next page'} disabled={page===pageInfo.count-1} onClick={()=>turn(page+1)}>›</button></footer><div className="np-reader-actions">{!issue.kiosk&&!issue.read&&issue.canDefer&&<p className="np-defer-hint" id="np-defer-hint">{ru?'Прочитать позже можно будет в построенном газетном киоске.':'You can read it later after building a newspaper kiosk.'}</p>}{actionError&&<p role="alert">{actionError}</p>}{!issue.read&&<button disabled={busy||status!=='ready'} className="np-collect" onClick={()=>void act('collect')}>{ru?'Забрать':'Collect'}</button>}{!issue.read&&issue.canDefer&&<button disabled={busy} aria-describedby={!issue.kiosk?'np-defer-hint':undefined} className="np-defer" onClick={()=>void act('defer')}>{busy?(ru?'Сохранение…':'Saving…'):(ru?'Отложить на потом':'Read later')}</button>}</div></section>;
}
