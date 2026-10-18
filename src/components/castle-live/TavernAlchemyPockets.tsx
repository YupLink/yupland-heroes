import {useEffect,useRef,useState} from 'react';
import type {Castle} from '@/components/beta-raid/castle/useCastle';
import {bagLayout} from '@/components/beta-raid/backpackCellList';
import {CELL_SIZE} from '@/lib/hero/backpackCells';
import {boostListText} from '@/lib/hero/boost';
import {boostEffectText} from '@/lib/hero/boost';
import {useLang} from '@/lib/i18n';
import {useT} from '@/lib/i18n';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {humanError} from '@/lib/humanError';
import {applyItemBoost} from '@/server/api/beta-raid/boost-item';
import {applyItemBoosts} from '@/server/api/beta-raid/boost-items';
import {newOpId} from '@/lib/opId';
import {invalidateBackpack,invalidateHeroQueries} from '@/lib/query';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import './tavern-alchemy.css';

export function TavernAlchemyPockets({data,loading,allowUse=false,beforeUse,batchPreview=true}:{data?:Castle['backpack']['data'];loading:boolean;allowUse?:boolean;beforeUse?:()=>Promise<void>;batchPreview?:boolean}){
 const ru=useLang()!=='en';
 const t=useT();
 const qc=useQueryClient();
 const [selected,setSelected]=useState(0);
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 const [qtyDraft,setQtyDraft]=useState('');
 const [failed,setFailed]=useState<string[]>([]);
 const pointer=useRef<{x:number;y:number}|null>(null),swiped=useRef(false);
 const extra=data as (NonNullable<typeof data>&{potionCapacity?:number;potionOccupied?:number;alchemy?:number})|undefined;
 const hasPotionFlags=data?.stacks.every(stack=>typeof (stack as typeof stack & {potion?:unknown}).potion==='boolean')??false;
 const hasPotionData=Number.isFinite(extra?.potionCapacity)&&Number.isFinite(extra?.potionOccupied)&&Number.isFinite(extra?.alchemy)&&hasPotionFlags;
 const capacity=Math.max(0,Math.floor(extra?.potionCapacity??0));
 useEffect(()=>{setSelected(0);setFailed([]);setQuantities({})},[data?.heroId]);
 const current=Math.min(selected,Math.max(0,capacity-1));
 const page=Math.floor(current/8),pages=Math.ceil(capacity/8);
 const cells=data?bagLayout(data.stacks,data.capacity,capacity).potions:[];
 const chosen=cells[current];
 const chosenTotal=chosen?Math.floor(data?.stacks.find(stack=>stack.stackKey===chosen.stackKey)?.count??0):undefined;
 const chosenQty=chosen?Math.min(quantities[chosen.stackKey]??0,chosenTotal??0):0;
 useEffect(()=>{setQtyDraft(chosenQty?String(chosenQty):'')},[chosen?.stackKey,chosenQty]);
 const selectedStacks=Object.entries(quantities).flatMap(([stackKey,qty])=>{
  const stack=data?.stacks.find(s=>s.stackKey===stackKey);
  const cell=cells.find(item=>item?.stackKey===stackKey);
  return stack?.boost?.length&&cell?.usable&&stack.count>=1&&qty>0?[{stackKey,name:stack.name,qty:Math.min(Math.floor(qty),Math.floor(stack.count)),effect:boostListText(stack.boost,ru?'ru':'en'),image:cell?.image??'/design-assets/gear-potion.webp'}]:[];
 });
 const selectedTotal=selectedStacks.reduce((sum,stack)=>sum+stack.qty,0);
 const canUse=allowUse&&!!beforeUse;
 const changeQty=(stackKey:string,delta:number)=>setQuantities(previous=>{
  const available=Math.floor(data?.stacks.find(stack=>stack.stackKey===stackKey)?.count??0);
  const next=Math.max(0,Math.min(available,(previous[stackKey]??0)+delta));
  const updated={...previous};
  if(next)updated[stackKey]=next;else delete updated[stackKey];
  return updated;
 });
 const setQty=(stackKey:string,amount:number)=>setQuantities(previous=>{
  const available=Math.floor(data?.stacks.find(stack=>stack.stackKey===stackKey)?.count??0);
  return {...previous,[stackKey]:Math.max(1,Math.min(available,amount))};
 });
 const useBoost=useMutation({
  mutationFn:async(stackKey:string)=>{
   if(!canUse||!beforeUse)throw new Error(ru?'Использовать вещи можно только у активного героя.':'Only the active hero can use items.');
   await beforeUse();
   return applyItemBoost({data:{stackKey,op:newOpId()}});
  },
  onSuccess:res=>{
   const line=res.rolls.map(r=>boostEffectText({stat:r.stat,value:String(r.amount),minutes:String(r.minutes)},ru?'ru':'en')).join(' · ');
   toast.success(t('braid.boost_item_done',{hero:res.heroName??'',line}));
   invalidateBackpack(qc);
   invalidateHeroQueries(qc,['beta-raid-state']);
  },
  onError:(error:Error)=>toast.error(humanError(error)),
 });
 const useBatch=useMutation({
  mutationFn:async(stacks:typeof selectedStacks)=>{
   if(!batchPreview||!canUse||!beforeUse)throw new Error(ru?'Использовать вещи можно только у активного героя.':'Only the active hero can use items.');
   if(stacks.length>20)throw new Error(ru?'Можно выбрать не больше 20 видов зелий.':'Select up to 20 potion types.');
   await beforeUse();
   return applyItemBoosts({data:{items:stacks.map(({stackKey,qty})=>({stackKey,qty})),op:newOpId()}});
  },
  onSuccess:res=>{
   const used=res.items.reduce((sum,item)=>sum+item.qty,0);
   toast.success(res.repeat?(ru?'Зелья уже использованы.':'Potions were already used.'):(ru?`Использовано зелий: ${used}`:`Potions used: ${used}`));
   setQuantities({});invalidateBackpack(qc);invalidateHeroQueries(qc,['beta-raid-state']);
  },
  onError:(error:Error)=>{setQuantities({});invalidateBackpack(qc);invalidateHeroQueries(qc,['beta-raid-state']);toast.error(humanError(error))},
 });
 const go=(next:number)=>{if(next>=0&&next<pages)setSelected(next*8)};
 const renderCell=(offset:number)=>{const index=page*8+offset,item=cells[index],locked=index>=capacity,picked=!!item&&!!quantities[item.stackKey];return <button data-game-button="surface" key={index} type="button" className={`alchemy-cell${locked?' is-locked':''}`} disabled={locked} data-current={!locked&&index===current||undefined} data-picked={batchPreview&&picked||undefined} role={batchPreview&&!locked&&item?.boost?.length&&item.usable?'checkbox':undefined} aria-checked={batchPreview&&!locked&&item?.boost?.length&&item.usable?picked:undefined} aria-pressed={!batchPreview&&!locked?index===current:undefined} aria-label={locked?(ru?`Карман ${index+1}: недоступен при вместимости ${capacity}`:`Pocket ${index+1}: unavailable with capacity ${capacity}`):item?`${item.name}, ${item.units}/${CELL_SIZE}, ${ru?'карман':'pocket'} ${index+1}`:(ru?`Карман ${index+1} пуст`:`Pocket ${index+1} is empty`)} onClick={()=>{if(swiped.current){swiped.current=false;return}setSelected(index);if(batchPreview&&item?.boost?.length&&item.usable)setQuantities(previous=>{const next={...previous};if(next[item.stackKey])delete next[item.stackKey];else next[item.stackKey]=Math.floor(data?.stacks.find(stack=>stack.stackKey===item.stackKey)?.count??item.units);return next})}}>
  <span className="alchemy-number" aria-hidden="true">{index+1}</span>
  {locked?<span className="alchemy-lock" aria-hidden="true"/>:item?<><span className="alchemy-quantity">{item.units}/{CELL_SIZE}</span>{batchPreview&&item.boost?.length&&item.usable?<span className="alchemy-check" aria-hidden="true">{picked?'✓':''}</span>:null}<img draggable={false} src={failed.includes(item.key)?'/design-assets/gear-potion.webp':item.image??'/design-assets/gear-potion.webp'} onError={()=>{if(!failed.includes(item.key))setFailed(a=>[...a,item.key])}} alt=""/></>:null}
 </button>};
 if(loading&&!data)return <p role="status">{ru?'Загрузка…':'Loading…'}</p>;
 if(!data?.heroId)return <p>{ru?'Герой не выбран':'No hero selected'}</p>;
 if(!hasPotionData)return <p role="status">{ru?'Данные алхимических карманов пока не получены.':'Potion data is unavailable.'}</p>;
 return <section data-alchemy-preview data-batch-preview={batchPreview||undefined} data-list-rows={batchPreview?Math.max(1,Math.min(3,selectedStacks.length)):undefined} data-quantity-row={batchPreview&&chosen?.boost?.length&&chosenQty>0||undefined} aria-label={ru?'Алхимический футляр':'Alchemy case'}>
  <div className="alchemy-stats"><span>{ru?'Ячейки':'Slots'}: {extra?.potionOccupied}/{capacity}</span><span>{ru?'Алхимия':'Alchemy'}: {extra?.alchemy}</span></div>
  {capacity>0?<>
   <div className="alchemy-case" onPointerDown={e=>{pointer.current={x:e.clientX,y:e.clientY};swiped.current=false}} onPointerCancel={()=>{pointer.current=null}} onPointerUp={e=>{const start=pointer.current;pointer.current=null;if(start&&Math.abs(e.clientY-start.y)<30&&Math.abs(e.clientX-start.x)>40){swiped.current=true;go(page+(e.clientX<start.x?1:-1))}}}>
    {batchPreview?<div className="alchemy-art" aria-hidden="true"/>:<img className="alchemy-art-original" src="/design-assets/alchemy-case-eight-webp-optimized.webp" alt="" draggable={false}/>}
    <div className="alchemy-cells alchemy-cells-top">{Array.from({length:4},(_,col)=>renderCell(col))}</div>
    <div className={`alchemy-detail${chosen||selectedStacks.length?'':' is-empty'}`} aria-live="polite" aria-atomic="true">
     <div className={`alchemy-detail-copy${batchPreview&&selectedStacks.length?' has-selection':''}`}>
     {batchPreview&&selectedStacks.length?<div className="alchemy-selected-list" data-overflow={selectedStacks.length>3||undefined} aria-label={ru?'Выбранные зелья и эффекты':'Selected potions and effects'}>
      {selectedStacks.map(stack=><button key={stack.stackKey} type="button" className="alchemy-selected-row" data-active={chosen?.stackKey===stack.stackKey||undefined} aria-label={ru?`${stack.name}, ${stack.qty} шт., ${stack.effect}`:`${stack.name}, ${stack.qty} items, ${stack.effect}`} onClick={()=>{const index=cells.findIndex(item=>item?.stackKey===stack.stackKey);if(index>=0)setSelected(index)}}>
       <img src={stack.image} alt="" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src='/design-assets/gear-potion.webp'}}/>
       <span className="alchemy-selected-text"><span className="alchemy-selected-name"><strong>{stack.name}</strong><b>×{stack.qty}</b></span><span className="alchemy-selected-effect">{stack.effect}</span></span>
      </button>)}
     </div>:<>
     <span className="alchemy-selected-label" aria-live="polite">{ru?'Карман':'Pocket'} {current+1}/{capacity} · {ru?'Стр.':'Page'} {page+1}/{pages}</span>
     <div className="alchemy-detail-title"><strong>{chosen?.name??(ru?'Карман пуст':'Empty pocket')}</strong>{chosen&&(!batchPreview||!chosenQty)&&<span>{batchPreview?chosenTotal:chosen.units} {ru?'шт.':'items'}</span>}</div>
     {chosen&&!batchPreview&&chosenTotal!=null&&chosenTotal>chosen.units?<p className="alchemy-total">{ru?'Всего у героя':'Hero total'}: {chosenTotal}</p>:null}
     {chosen?.boost?.length?<p>{boostListText(chosen.boost,ru?'ru':'en')}</p>:null}
     </>}
     </div>
     {batchPreview&&chosen?.boost?.length&&chosenQty>0?<div className="alchemy-quantity-row" aria-label={ru?`Количество ${chosen.name}`:`Quantity of ${chosen.name}`}>
       <span className="alchemy-qty-label">{ru?'Кол-во':'Qty'}</span>
       <button type="button" aria-label={ru?`Меньше ${chosen.name}`:`Less ${chosen.name}`} onClick={()=>changeQty(chosen.stackKey,-1)}>−</button>
       <input type="text" inputMode="numeric" pattern="[0-9]*" aria-label={ru?`Сколько выпить: ${chosen.name}`:`How many to use: ${chosen.name}`} value={qtyDraft} onFocus={event=>event.currentTarget.select()} onChange={event=>{const raw=event.currentTarget.value;if(!/^\d*$/.test(raw))return;setQtyDraft(raw);if(raw)setQty(chosen.stackKey,Number(raw))}} onBlur={()=>setQtyDraft(String(chosenQty))}/>
       <button type="button" aria-label={ru?`Больше ${chosen.name}`:`More ${chosen.name}`} disabled={chosenQty>=(chosenTotal??0)} onClick={()=>changeQty(chosen.stackKey,1)}>+</button>
       <span>{ru?'из':'of'} {chosenTotal??0}</span>
     </div>:null}
     {batchPreview?(selectedTotal>0?<div className="alchemy-batch-action"><span>{ru?'Выбрано':'Selected'}: {selectedStacks.length}</span><button data-game-button="primary" className="alchemy-use" type="button" disabled={!canUse||useBatch.isPending} onClick={()=>useBatch.mutate(selectedStacks)}>{useBatch.isPending?(ru?'Используем…':'Using…'):(ru?`Использовать ${selectedTotal}`:`Use ${selectedTotal}`)}</button></div>:null)
      :canUse&&chosen?.boost?.length?<button data-game-button="primary" className="alchemy-use" type="button" disabled={useBoost.isPending} onClick={()=>useBoost.mutate(chosen.stackKey)}>{useBoost.isPending?(ru?'Используем…':'Using…'):(ru?'Использовать 1':'Use 1')}</button>:null}
    </div>
    <nav className="alchemy-pages" aria-label={ru?`Страницы карманов, страница ${page+1} из ${pages}`:`Pocket pages, page ${page+1} of ${pages}`}>
     <button type="button" disabled={page===0} aria-label={ru?'Предыдущая страница карманов':'Previous pocket page'} onClick={()=>go(page-1)}><ChevronLeft aria-hidden="true"/></button>
     <button type="button" disabled={page===pages-1} aria-label={ru?'Следующая страница карманов':'Next pocket page'} onClick={()=>go(page+1)}><ChevronRight aria-hidden="true"/></button>
    </nav>
    <div className="alchemy-cells alchemy-cells-bottom">{Array.from({length:4},(_,col)=>renderCell(col+4))}</div>
   </div>
  </>:<p>{ru?'У героя пока нет алхимических карманов':'No alchemy pockets yet'}</p>}
 </section>;
}
