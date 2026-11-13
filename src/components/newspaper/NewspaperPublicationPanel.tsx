import {EditionFileInput} from './EditionFileInput';
import {useMemo,useState} from 'react';
import {createNewspaperPublisher,PublicationError,uploadNewspaperOriginal,type PublicationResult,type PublicationStage} from '@/lib/newspaper-publish';

type Ports = Parameters<typeof createNewspaperPublisher>[0];
export function NewspaperPublicationPanel({ru,ports,onComplete,disabled=false,onBusyChange=()=>{}}:{ru:boolean;ports:Omit<Ports,'upload'>&{upload?:Ports['upload']};onComplete:()=>Promise<unknown>;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const [date,setDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  const [title,setTitle]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [enTitle,setEnTitle]=useState('');
  const [ruSecond,setRuSecond]=useState<File|null>(null),[enFirst,setEnFirst]=useState<File|null>(null),[enSecond,setEnSecond]=useState<File|null>(null);
  const complete=!!file&&!!enFirst&&!!title.trim()&&!!enTitle.trim()&&!!ruSecond===!!enSecond;
  const [stage,setStage]=useState<PublicationStage|null>(null);
  const [error,setError]=useState('');
  const [result,setResult]=useState<PublicationResult|null>(null);
  const publish=useMemo(()=>createNewspaperPublisher({...ports,upload:ports.upload??uploadNewspaperOriginal}),[ports]);
  const labels:Record<PublicationStage,string>=ru?{checking:'Проверяем выпуск…',uploading:'Загружаем и проверяем оригинал…',saving:'Сохраняем выпуск…',publishing:'Размещаем по мирам…'}:{checking:'Checking issue…',uploading:'Uploading and verifying original…',saving:'Saving issue…',publishing:'Publishing to worlds…'};
  const errors=ru?{busy:'Публикация уже выполняется.',exists:'Выпуск за эту дату уже опубликован или снят. Проверь список выпусков.',conflict:'За эту дату уже есть другой черновик. Проверь его: автоматически заменять его не будем.',empty:'Выпуск отмечен опубликованным, но экземпляров на картах нет. Повторно создавать выпуск не нужно.',not_published:'Размещение не подтверждено. Проверь список выпусков.'}:{busy:'Publication is already running.',exists:'An issue on this date is published or withdrawn. Check the issue list.',conflict:'A different draft exists for this date. Review it before proceeding.',empty:'The issue is marked published but has no map copies. Do not create another issue.',not_published:'Publication was not confirmed. Check the issue list.'};
  const inputClass='block min-h-11 w-full min-w-0 rounded border border-border bg-background p-2';
  return <section className="rounded border border-border p-3 sm:p-4" aria-label={ru?'Публикация газеты':'Publish newspaper'}>
    <form className="grid min-w-0 gap-4" onSubmit={async e=>{
      e.preventDefault();if(!file||!enFirst||!complete||stage||disabled)return;onBusyChange(true);setError('');setResult(null);
      try {setResult(await publish({date,title:title.trim(),file,editions:{ru:{title:title.trim(),files:ruSecond?[file,ruSecond]:[file]},en:{title:enTitle.trim(),files:enSecond?[enFirst,enSecond]:[enFirst]}}},setStage));}
      catch(e){setError(e instanceof PublicationError?errors[e.code]:(ru?'Не удалось завершить публикацию. Проверь соединение и список выпусков; повтор продолжит тот же номер.':'Could not complete publication. Check your connection and the issue list; retry resumes the same issue.'));}
      finally {await onComplete().catch(()=>{});setStage(null);onBusyChange(false);}
    }}>
      <fieldset disabled={!!stage||disabled} className="grid min-w-0 gap-4 disabled:opacity-70">
        <legend className="mb-3 font-semibold">{ru?'Готовая газета':'Finished newspaper'}</legend>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0">{ru?'Дата выпуска':'Issue date'}<input className={inputClass} required type="date" value={date} onChange={e=>{setDate(e.target.value);setResult(null);}}/></label>
          <label className="min-w-0">{ru?'Название · RU':'Title · RU'}<input className={inputClass} required maxLength={120} value={title} onChange={e=>{setTitle(e.target.value);setResult(null);}} placeholder="Вестник героев №…"/></label>
        </div>
        <label className="min-w-0">{ru?'Название · EN':'Title · EN'}<input required maxLength={120} className={inputClass} value={enTitle} onChange={e=>{setEnTitle(e.target.value);setResult(null);}}/></label>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-3"><h3>RU</h3>
            <EditionFileInput ru={ru} required label={ru?'Русский · разворот 1':'Russian · spread 1'} onChange={f=>{setFile(f);setResult(null);}}/>
            <EditionFileInput ru={ru} required={!!enSecond} label={ru?'Русский · разворот 2 (для недельного номера)':'Russian · spread 2 (weekly issue)'} onChange={f=>{setRuSecond(f);setResult(null);}}/>
          </div>
          <div className="grid min-w-0 gap-3"><h3>EN</h3>
            <EditionFileInput ru={ru} required label={ru?'Английский · разворот 1':'English · spread 1'} onChange={f=>{setEnFirst(f);setResult(null);}}/>
            <EditionFileInput ru={ru} required={!!ruSecond} label={ru?'Английский · разворот 2 (для недельного номера)':'English · spread 2 (weekly issue)'} onChange={f=>{setEnSecond(f);setResult(null);}}/>
          </div>
        </div>
        {Boolean(ruSecond)!==Boolean(enSecond)&&<p role="status">{ru?'Добавь второй разворот на обоих языках.':'Add the second spread in both languages.'}</p>}
        <button disabled={!complete||!!stage||!!result} className="min-h-11 w-full rounded bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{stage?labels[stage]:result?(ru?'Опубликовано':'Published'):(ru?'Опубликовать во всех мирах':'Publish to all worlds')}</button>
      </fieldset>
    </form>
    {stage&&<p role="status" className="mt-3 text-sm">{labels[stage]}</p>}
    {error&&<p role="alert" className="mt-3">{error}</p>}
    {result&&<div role="status" className="mt-4"><p className="font-semibold">{ru?'Размещено':'Published'}: {result.maps.reduce((n,m)=>n+m.copies,0)} · {ru?'Миров':'Worlds'}: {result.maps.length}</p><ul className="mt-2 space-y-1">{result.maps.map((m,i)=><li key={`${m.map}-${i}`} className="flex justify-between gap-3"><span className="min-w-0 break-words">{m.map}</span><span>{m.copies}</span></li>)}</ul></div>}
  </section>;
}
