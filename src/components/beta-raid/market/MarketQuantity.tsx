import {useEffect,useState} from 'react';
import {useLang,useT} from '@/lib/i18n';
export function MarketQuantity({value,max,disabled,onChange,name,maxAffordable}:{value:number;max:number;disabled:boolean;onChange:(n:number)=>void;name:string;maxAffordable?:number|null}){
 const t=useT(),en=useLang()==='en';
 const [draft,setDraft]=useState(String(value));
 useEffect(()=>setDraft(String(value)),[value]);
 const commit=(text:string)=>{const next=Math.max(0,Math.min(max,Math.floor(Number(text)||0)));setDraft(String(next));onChange(next);};
 const maxPick=maxAffordable==null?null:Math.min(max,maxAffordable);
 return <div className="raid-market-quantity" role="group" aria-label={name} data-max={maxPick!=null}>
  <button type="button" aria-label={`− ${name}`} disabled={disabled||value<=0} onClick={()=>onChange(Math.max(0,value-1))}>−</button>
  <input role="spinbutton" type="text" inputMode="numeric" pattern="[0-9]*" value={draft} disabled={disabled} aria-label={`${en?'Quantity':'Количество'}: ${name}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
   onChange={e=>{if(/^\d*$/.test(e.target.value)){if(e.target.value==='')setDraft('');else commit(e.target.value);}}} onBlur={()=>commit(draft)} onFocus={e=>e.currentTarget.select()}
   onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();commit(String(value+(e.key==='ArrowUp'?1:-1)));}if(e.key==='Enter')e.currentTarget.blur();}}/>
  <button type="button" aria-label={`+ ${name}`} disabled={disabled||value>=max} onClick={()=>onChange(Math.min(max,value+1))}>+</button>
  {maxPick!=null&&<button type="button" className="raid-market-max" title={maxPick<=0?(en?'Available maximum is zero. Check resources and backpack space.':'Доступный максимум — 0. Проверь ресурсы и место в рюкзаке.'):value===maxPick?(en?'Maximum already selected':'Максимум уже выбран'):(en?`Select ${maxPick}`:`Выбрать ${maxPick}`)} disabled={disabled||maxPick<=0||value===maxPick} aria-label={`${t('market.max')}: ${name}`} onClick={()=>onChange(maxPick)}>{t('market.max')}</button>}
 </div>;
}

