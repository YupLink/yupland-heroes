import {useId,useRef} from 'react';
import {useLang,useT} from '@/lib/i18n';
import {MarketPrice} from './MarketPrice';
import {goodEntry,priceEntries,type ExchangeEntry} from './exchange';
import {costKey,type CartLine,type CostEntry} from './cartCost';
import {cityCartTotals} from './townQuote';
/** short — ключи costKey строк цены, которых игроку не хватает (marketShort): в «Передашь» они красные. */
export function MarketTradeSummary({lines,costs,side,short}:{lines:CartLine[];costs:CostEntry[];side:'buy'|'sell';short?:ReadonlySet<string>}){
 const t=useT(),lang=useLang(),en=lang==='en',dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),headingId=useId();
 const goods=lines.map(({it,qty})=>({...goodEntry(it,t,lang),amount:Math.round(it.giveAmount*qty*1000)/1000}));
 const city=cityCartTotals(lines);
 const paid=costs.map(c=>{
  const source=lines.find(({it})=>it.priceResource===c.resource&&it.priceToken===c.token||it.price2Resource===c.resource&&it.price2Token===c.token)?.it??lines.find(({it})=>(it.priceMore??[]).some(m=>m.resource===c.resource&&m.token===c.token))?.it;
  if(!source)return {amount:c.need,label:c.name||t(`market.res.${c.resource}`),image:null,pixel:false};
  const second=source.price2Resource===c.resource&&source.price2Token===c.token;
  return priceEntries(t,{...source,priceResource:c.resource,priceToken:c.token,priceAmount:c.need,priceName:c.name,priceImage:c.image??(second?source.price2Image:source.priceImage),price2Resource:null,price2Amount:null,priceMore:null})[0];
 });
 const payouts=lines.flatMap(({it,qty})=>it.town?[{amount:city.get(it.id)??0,label:t('market.res.gold'),image:'/resources/gold.webp',pixel:true}]:priceEntries(t,{...it,priceAmount:Math.round(it.priceAmount*qty*1000)/1000,price2Amount:it.price2Amount==null?null:Math.round(it.price2Amount*qty*1000)/1000,priceMore:(it.priceMore??[]).map(m=>({...m,amount:Math.round(m.amount*qty*1000)/1000}))}));
 function sum(entries:ExchangeEntry[]){const out=new Map<string,ExchangeEntry>();for(const e of entries){const key=`${e.label}|${e.image}`;const old=out.get(key);out.set(key,{...e,amount:Math.round(((old?.amount??0)+e.amount)*1000)/1000});}return [...out.values()];}
 const given=side==='sell'?goods:paid,received=side==='sell'?sum(payouts):goods;
 // Скупка не красится: там отдают товар с рук, его пересчитывает своя витрина.
 const givenShort=side==='sell'?[]:costs.map(c=>!!short?.has(costKey(c.resource,c.token)));
 const titleGive=en?'You give':'Передашь',titleGet=en?'You get':'Получишь';
 return <>
  <div className="raid-market-summary" aria-live="polite" data-dense={given.length>2||undefined}>
   <div><button ref={trigger} type="button" onClick={()=>dialog.current?.showModal()} disabled={!lines.length} aria-label={en?'Show full trade details':'Показать полный состав обмена'}>{titleGive}{lines.length?' ›':''}</button><div>{given.length?given.map((e,i)=><MarketPrice entry={e} key={i} short={givenShort[i]}/>):'—'}</div></div>
   <div><small>{titleGet}</small><div>{received.length?received.map((e,i)=><MarketPrice entry={e} key={i}/>):'—'}</div></div>
  </div>
  <dialog ref={dialog} className="raid-market-details" aria-labelledby={headingId} onClose={()=>trigger.current?.focus()} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}>
   <header><h3 id={headingId}>{en?'Trade details':'Состав обмена'}</h3><button type="button" aria-label={en?'Close trade details':'Закрыть состав'} onClick={()=>dialog.current?.close()}>×</button></header>
   {[[titleGive,given],[titleGet,received]].map(([title,entries])=><section key={title as string}><h4>{title as string}</h4><ul>{(entries as ExchangeEntry[]).map((entry,i)=><li key={i}><MarketPrice entry={entry} short={entries===given&&givenShort[i]}/><span>{entry.label}</span></li>)}</ul></section>)}
  </dialog>
 </>;
}
