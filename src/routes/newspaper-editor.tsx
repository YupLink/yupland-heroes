import {NewspaperTranslationPanel} from '@/components/newspaper/NewspaperTranslationPanel';
import {createFileRoute,Link} from '@tanstack/react-router';
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getSession} from '@/server/api/user-auth';
import {addNewspaperEnglish,saveNewspaperIssue,listNewspaperIssues,publishNewspaperIssue} from '@/server/api/newspaper/paper-editor';
import {humanError} from '@/lib/humanError';
import {useLang} from '@/lib/i18n';
import {NewspaperPublicationPanel} from '@/components/newspaper/NewspaperPublicationPanel';
const publicationPorts={list:()=>listNewspaperIssues(),save:(data:NonNullable<Parameters<typeof saveNewspaperIssue>[0]>['data'])=>saveNewspaperIssue({data}),publish:(id:string)=>publishNewspaperIssue({data:{id}})};
const translationPorts={list:()=>listNewspaperIssues(),add:(data:NonNullable<Parameters<typeof addNewspaperEnglish>[0]>['data'])=>addNewspaperEnglish({data})};
export const Route=createFileRoute('/newspaper-editor')({component:Editor,head:()=>({meta:[{name:'robots',content:'noindex'}]})});
const KEY=['newspaper-editor','issues'];
function Editor(){
 const ru=useLang()==='ru',qc=useQueryClient();const session=useQuery({queryKey:['session'],queryFn:()=>getSession()});
 const allowed=!!(session.data?.isAdmin||session.data?.isCastleEditor);
 const list=useQuery({queryKey:KEY,queryFn:()=>listNewspaperIssues(),enabled:allowed});
 const [date,setDate]=useState(''),[title,setTitle]=useState(''),[imageUrl,setImageUrl]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await action();await qc.invalidateQueries({queryKey:KEY});}catch(e){setMessage(humanError(e));}finally{setBusy(false);}}
 if(!allowed)return <main className="mx-auto max-w-3xl p-4"><Link to="/home">{ru?'Назад':'Back'}</Link><p>{session.isPending?(ru?'Загрузка…':'Loading…'):(ru?'Войди под учётной записью редакции.':'Sign in with an editorial account.')}</p></main>;
 return <main className="mx-auto max-w-3xl space-y-4 p-4"><Link to="/home">{ru?'Назад':'Back'}</Link><h1 className="text-xl font-bold">{ru?'Выпуски газеты':'Newspaper issues'}</h1>
 <NewspaperPublicationPanel ru={ru} ports={publicationPorts} disabled={busy} onBusyChange={setBusy} onComplete={()=>qc.invalidateQueries({queryKey:KEY})}/>
 <details><summary className="cursor-pointer py-2">{ru?'Сохранить черновик по готовой ссылке':'Save draft from an existing URL'}</summary>
 <form className="grid gap-3" onSubmit={e=>{e.preventDefault();void run(async()=>{
  if(list.data?.some(i=>i.date===date&&i.status!=='withdrawn'))throw Error(ru?'Выпуск за эту дату уже существует. Используй его в списке.':'An issue already exists for this date. Use the existing entry.');
  await saveNewspaperIssue({data:{date,title:title||undefined,imageUrl}});setMessage(ru?'Черновик сохранён.':'Draft saved.');
 });}}>
 <label>{ru?'Дата выпуска':'Issue date'}<input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="block w-full rounded border border-border bg-background p-2"/></label>
 <label>{ru?'Название':'Title'}<input value={title} onChange={e=>setTitle(e.target.value)} className="block w-full rounded border border-border bg-background p-2"/></label>
 <label>{ru?'Адрес картинки':'Image URL'}<input required value={imageUrl} onChange={e=>setImageUrl(e.target.value)} className="block w-full rounded border border-border bg-background p-2"/></label>
 <button disabled={busy||!list.data} className="min-h-11 rounded border border-border p-2">{ru?'Сохранить черновик':'Save draft'}</button></form></details>
 {message&&<p role="status">{message}</p>}{list.isError&&<p role="alert">{humanError(list.error)} <button onClick={()=>void list.refetch()}>{ru?'Повторить':'Retry'}</button></p>}
 <ul className="space-y-3">{list.data?.map(item=><li key={item.id} className="rounded border border-border p-3"><p>{item.date} · {item.title} · {item.status}</p><p>{ru?'Экземпляры':'Copies'}: {item.copies} · {ru?'Прочтения':'Reads'}: {item.reads}</p>{item.status==='published'&&!item.editions&&<NewspaperTranslationPanel id={item.id} ru={ru} ports={translationPorts} disabled={busy} onBusyChange={setBusy} onComplete={()=>qc.invalidateQueries({queryKey:KEY})}/>} {item.editions&&<p>{ru?'Языки: RU, EN · Страниц:':'Languages: RU, EN · Pages:'} {item.editions.ru.spreadUrls.length*2}</p>}{item.status==='draft'&&<button disabled={busy} className="min-h-11 rounded border border-border px-3" onClick={()=>void run(async()=>{const result=await publishNewspaperIssue({data:{id:item.id}});setMessage(`${ru?'Размещено на картах':'Published on maps'}: ${result.maps.length}`);})}>{ru?'Разместить на картах':'Publish on maps'}</button>}</li>)}</ul>
 </main>;
}

