import {useEffect,useState} from 'react';
import {useLang} from '@/lib/i18n';
import {humanError} from '@/lib/humanError';
import type {NewspaperView} from '@/lib/newspaper';
import {openNewspaper,markNewspaperRead,deferNewspaper} from '@/server/api/newspaper/paper-map';
import {Reader} from './Reader';
export function NewspaperMapReader({copyId,onClose,onCollected}:{copyId:string;onClose:()=>void;onCollected:(issueId:string)=>void|Promise<void>}){
 const ru=useLang()==='ru';
 const [issue,setIssue]=useState<NewspaperView|null>(null);
 const [error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setError(null);setIssue(null);
  openNewspaper({data:{copyId}}).then(v=>{if(active)setIssue(v);}).catch(e=>{if(active)setError(humanError(e));});
  return()=>{active=false;};
 },[copyId,attempt]);
 if(!issue)return <section className="np-request" onKeyDown={e=>{if(e.key==='Escape')onClose();}}><p role={error?'alert':'status'}>{error||(ru?'Загрузка газеты…':'Loading newspaper…')}</p>{error&&<button onClick={()=>setAttempt(n=>n+1)}>{ru?'Повторить':'Retry'}</button>}<button autoFocus onClick={onClose}>{ru?'Назад':'Back'}</button></section>;
 return <Reader key={issue.issueId} issue={issue} onBack={onClose} onCollect={async()=>{
  await markNewspaperRead({data:{issueId:issue.issueId}});
  await onCollected(issue.issueId);
 }} onDefer={async()=>{await deferNewspaper({data:{issueId:issue.issueId}});await onCollected(issue.issueId);}}/>;
}
