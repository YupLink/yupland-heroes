import {useEffect,useState} from 'react';
export function EditionFileInput({label,required=false,ru,onChange}:{label:string;required?:boolean;ru:boolean;onChange:(file:File|null)=>void}){
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[error,setError]=useState('');
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 return <label className="block min-w-0">{label}<input type="file" accept="image/png,.png" required={required} className="block min-h-11 w-full min-w-0 rounded border border-border bg-background p-2 text-sm" onChange={e=>{
 const next=e.target.files?.[0]??null;
 if(next&&(next.type!=='image/png'||!next.size||next.size>8*1024*1024)){setError(ru?'Выбери PNG до 8 МБ.':'Choose a PNG up to 8 MB.');setFile(null);onChange(null);e.target.value='';return;}
 setError('');setFile(next);onChange(next);
 }}/>{error&&<span role="alert">{error}</span>}{preview&&<a className="mt-2 block" href={preview} target="_blank" rel="noreferrer" aria-label={ru?`Открыть: ${label}`:`Open: ${label}`}><img src={preview} alt={label} className="max-h-60 w-full rounded object-contain"/></a>}</label>;
}
