import {useMemo,useState} from 'react';
import {createNewspaperTranslator,uploadNewspaperOriginal} from '@/lib/newspaper-publish';
import {EditionFileInput} from './EditionFileInput';
type Ports=Parameters<typeof createNewspaperTranslator>[0];
export function NewspaperTranslationPanel({id,ru,ports,disabled,onBusyChange,onComplete}:{id:string;ru:boolean;ports:Omit<Ports,'upload'>;disabled:boolean;onBusyChange:(busy:boolean)=>void;onComplete:()=>Promise<unknown>}){
 const [title,setTitle]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const add=useMemo(()=>createNewspaperTranslator({...ports,upload:uploadNewspaperOriginal}),[ports]);
 return <details><summary className="cursor-pointer py-2">{ru?'Добавить английскую версию':'Add English edition'}</summary><form onSubmit={async e=>{e.preventDefault();if(!file||busy||disabled||!title.trim())return;setBusy(true);onBusyChange(true);setError('');try{await add(id,{title,files:[file]});}catch{setError(ru?'Не удалось добавить перевод. Обнови список и проверь, не сохранён ли он уже.':'Could not add translation. Refresh the list and check whether it was already saved.');}finally{await onComplete().catch(()=>{});setBusy(false);onBusyChange(false);}}}>
 <fieldset disabled={disabled||busy} className="grid min-w-0 gap-3"><label>{ru?'Название · EN':'Title · EN'}<input required maxLength={120} className="block min-h-11 w-full rounded border border-border bg-background p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label><EditionFileInput required ru={ru} label={ru?'Английский разворот · PNG до 8 МБ':'English spread · PNG up to 8 MB'} onChange={setFile}/><p className="text-sm">{ru?'Русский оригинал и размещённые экземпляры сохранятся.':'The Russian original and existing copies stay unchanged.'}</p><button disabled={!file||!title.trim()||busy} className="min-h-11 rounded border border-border p-2">{busy?(ru?'Сохраняем перевод…':'Saving translation…'):(ru?'Сохранить английскую версию':'Save English edition')}</button></fieldset>{error&&<p role="alert">{error}</p>}
 </form></details>;
}
