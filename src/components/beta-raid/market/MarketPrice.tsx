import { thumb } from '@/lib/image';
import type { ExchangeEntry } from './exchange';
import { numText } from './num';
export function compactMarketNumber(value:number){
  const units=['','K','M','B'];let scaled=value,index=0;
  while(Math.abs(scaled)>=1000&&index<3){scaled/=1000;index++;}
  if(index&&Math.abs(Number(scaled.toFixed(1)))>=1000&&index<3){scaled/=1000;index++;}
  return index?numText(Number(scaled.toFixed(1)))+units[index]:numText(value);
}
/** short — этой строки игроку не хватает: число красным (marketShort). */
export function MarketPrice({entry,compact=false,unit,short=false}:{entry:ExchangeEntry;compact?:boolean;unit?:string;short?:boolean}){
 return <span className={short?'raid-market-amount is-short':'raid-market-amount'} data-short={short||undefined} title={`${numText(entry.amount)} ${entry.label}`} aria-label={`${numText(entry.amount)} ${entry.label}`}>
  {entry.image?<img src={thumb(entry.image,48)} alt="" loading="lazy" decoding="async"/>:<span>{entry.label}</span>}
  <b>{compact?compactMarketNumber(entry.amount):numText(entry.amount)}</b>{unit&&<small>{unit}</small>}
 </span>;
}

