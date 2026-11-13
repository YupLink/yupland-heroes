import type {NewspaperIssueAdmin,NewspaperEditions} from './newspaper';

export type PublicationResult = {status:string; maps:Array<{map:string;copies:number}>};
export type EditionFiles={title:string;files:File[]};
type Input = {date:string;title:string;file:File;editions?:{ru:EditionFiles;en:EditionFiles}};
type Ports = {
  list:()=>Promise<NewspaperIssueAdmin[]>;
  upload:(file:File)=>Promise<{url:string}>;
  save:(data:{id:string;date:string;title:string;imageUrl:string;editions?:NewspaperEditions;createOnly:true})=>Promise<{id:string}>;
  publish:(id:string)=>Promise<PublicationResult>;
};
export type PublicationStage = 'checking'|'uploading'|'saving'|'publishing';
export class PublicationError extends Error {
  constructor(public code:'busy'|'exists'|'conflict'|'empty'|'not_published') { super(code); }
}

/** One controller per editor; stable date ID also survives reloads/timeouts. */
export function createNewspaperPublisher(ports:Ports) {
  let busy = false;
  return async (input:Input, stage:(value:PublicationStage)=>void = ()=>{}) => {
    if (busy) throw new PublicationError('busy');
    busy = true;
    try {
      stage('checking');
      const issues = (await ports.list()).filter(i=>i.date===input.date);
      if (issues.some(i=>i.status!=='draft')) throw new PublicationError('exists');
      if (issues.length>1) throw new PublicationError('conflict');
      if(input.editions && (input.editions.ru.files.length<1 || input.editions.ru.files.length>2 || input.editions.ru.files.length!==input.editions.en.files.length || !input.editions.en.title.trim() || input.editions.ru.title!==input.title || input.editions.ru.files[0]!==input.file)) throw new PublicationError('conflict');
      stage('uploading');
      const uploaded = await ports.upload(input.file);
      let editions:NewspaperEditions|undefined;
      if(input.editions){
        const ruUrls=[uploaded.url];
        for(const file of input.editions.ru.files.slice(1))ruUrls.push((await ports.upload(file)).url);
        const enUrls:string[]=[];
        for(const file of input.editions.en.files)enUrls.push((await ports.upload(file)).url);
        editions={ru:{title:input.editions.ru.title,spreadUrls:ruUrls},en:{title:input.editions.en.title,spreadUrls:enUrls}};
      }
      // Refetch after uploading: another editor may have saved/published meanwhile.
      const fresh = (await ports.list()).filter(i=>i.date===input.date);
      if (fresh.some(i=>i.status!=='draft')) throw new PublicationError('exists');
      if (fresh.length>1) throw new PublicationError('conflict');
      const draft = fresh[0];
      if (draft && (draft.imageUrl !== uploaded.url || (draft.title??'') !== input.title || JSON.stringify(draft.editions??null)!==JSON.stringify(editions??null))) throw new PublicationError('conflict');
      const id = draft?.id ?? `npi_daily_${input.date.replaceAll('-','')}`;
      if (!draft) {
        stage('saving');
        await ports.save({id,date:input.date,title:input.title,imageUrl:uploaded.url,...(editions?{editions}:{}),createOnly:true});
      }
      stage('publishing');
      const result = await ports.publish(id);
      if (result.status!=='published') throw new PublicationError('not_published');
      if (!result.maps.some(m=>m.copies>0)) throw new PublicationError('empty');
      return {id,...result};
    } finally { busy = false; }
  };
}

/** Both response and downloaded PNG must match the selected original. */
export async function uploadNewspaperOriginal(file:File) {
  const hash = async (bytes:ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('');
  const expected = await hash(await file.arrayBuffer());
  const form = new FormData(); form.set('file',file); form.set('purpose','newspaper');
  const response = await fetch('/api/upload',{method:'POST',body:form});
  if (!response.ok) throw new Error('Не удалось загрузить PNG. Проверь файл и доступ к редакции.');
  const data = await response.json() as {url:string;sha256:string};
  // Only the same-origin static upload returned by our endpoint may be downloaded.
  if (typeof data.url!=='string' || !data.url.startsWith('/uploads/') || data.url.startsWith('//') || data.url.includes('\\') || data.sha256!==expected) throw new Error('Проверка оригинала не пройдена.');
  const download = await fetch(data.url,{cache:'no-store'});
  if (!download.ok || await hash(await download.arrayBuffer())!==expected) throw new Error('Не удалось проверить сохранённый оригинал. Повтори загрузку.');
  return {url:data.url};
}

/** Attach a translation to the same published ID; never call publish again. */
export function createNewspaperTranslator(ports:{list:()=>Promise<NewspaperIssueAdmin[]>;upload:(file:File)=>Promise<{url:string}>;add:(data:{id:string;expectedImageUrl:string;editions:NewspaperEditions})=>Promise<{id:string}>}) {
 let busy=false;
 return async(id:string,en:EditionFiles)=>{
  if(busy)throw new PublicationError('busy');busy=true;
  try {
   const issue=(await ports.list()).find(i=>i.id===id);
   if(!issue||issue.status!=='published'||issue.editions)throw new PublicationError('conflict');
   if(en.files.length!==1||!en.title.trim())throw new PublicationError('conflict');
   const urls:string[]=[];for(const file of en.files)urls.push((await ports.upload(file)).url);
   return await ports.add({id,expectedImageUrl:issue.imageUrl,editions:{ru:{title:issue.title||'Вестник героев',spreadUrls:[issue.imageUrl]},en:{title:en.title.trim(),spreadUrls:urls}}});
  } finally {busy=false;}
 };
}
