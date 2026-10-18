// Approved castle market UI. Production actions use the existing single-listing API.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Square, CheckSquare, Plus } from 'lucide-react';
import { ChipImage } from '@/components/ChipImage';
import { ResourceGlyph } from '@/components/ui/ResourceGlyph';
import { MarketListingDetail } from './MarketListingDetail';
import { MarketCreateListing } from './MarketCreateListing';
import { listMarketListings, listMyMarketListings, buyMarketListing, adminCancelMarketListing, getMarketAccess } from '@/server/api/chipsMarket';
import { listChipCollectionsPublic } from '@/server/api/chips-stake';
import { useTickets } from '@/lib/hooks/useTickets';
import { useLang } from '@/lib/i18n';
import { humanError } from '@/lib/humanError';
import './market-preview.css';
import { useMarketSweep } from './useMarketSweep';

type Lot = Awaited<ReturnType<typeof listMarketListings>>[number];
type BatchPurchase = (ids: string[], total: number) => { count: number; total: number } | Promise<{ count: number; total: number }>;
const chipNoun = (count:number)=>count%10===1&&count%100!==11?'фишку':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'фишки':'фишек';
export function CastleMarketScreen({ batchPurchase, bonusEnabled, onBuyTickets, onOpenShop }: { batchPurchase?: BatchPurchase; bonusEnabled?: boolean; onBuyTickets?: () => void; onOpenShop?: () => void } = {}) {
  const ru = useLang() === 'ru', qc = useQueryClient();
  const text = (a:string,b:string) => ru ? a : b;
  const marketError = (error:unknown, fallbackRu:string, fallbackEn:string) => {
    const raw = error instanceof Error ? error.message : String(error ?? '');
    const friendly = humanError(error);
    if (friendly !== raw) return friendly;
    if (ru && /^(Не хватает|Недостаточно|Листинг|Лот|Фишка|Фишку|Это не|Не тво|Маркет|Пак|Сейчас)/i.test(raw)) return raw;
    return text(fallbackRu, fallbackEn);
  };
  const money = (n:number) => n.toLocaleString(ru?'ru':'en',{maximumFractionDigits:2});
  const q = useQuery({queryKey:['market','listings'], queryFn:()=>listMarketListings(),refetchInterval:20000});
  const own = useQuery({queryKey:['market','my-listings'],queryFn:()=>listMyMarketListings(),refetchInterval:20000});
  const collectionCovers = useQuery({queryKey:['chip-collections-public'],queryFn:()=>listChipCollectionsPublic()});
  const balance = useTickets();
  const access = useQuery({queryKey:['market','access'],queryFn:()=>getMarketAccess()});
  const [sort,setSort] = useState('price-up'), [pack,setPack] = useState(''), [packOpen,setPackOpen] = useState(false), [mine,setMine] = useState(false);
  const catalogRef = useRef<HTMLDivElement>(null);
  const [reviewItems,setReviewItems] = useState<{id:string;priceTickets:number}[]>([]);
  const [selecting,setSelecting] = useState(false), [ids,setIds] = useState<string[]>([]);
  const [detail,setDetail] = useState<Lot|null>(null), [creating,setCreating] = useState(false);
  const [detailError,setDetailError] = useState('');
  const [confirm,setConfirm] = useState(false), [busy,setBusy] = useState(false), [notice,setNotice] = useState('');
  const [shown,setShown] = useState(24);
  const cancelRef = useRef<HTMLButtonElement>(null), buyRef = useRef<HTMLButtonElement>(null), packRef = useRef<HTMLDivElement>(null);
  const rows = q.data ?? [], ownRows = own.data ?? [], ownIds = ownRows.map(l=>l.id);
  const chosen:Lot[] = rows.filter(l=>ids.includes(l.id)&&!ownIds.includes(l.id));
  const total = chosen.reduce((sum,l)=>sum+l.priceTickets,0);
  const rawBalance = balance.data as {available?:number;availableRaw?:number}|undefined;
  const available = Number(rawBalance?.availableRaw ?? rawBalance?.available ?? 0);
  const locked = !!access.data?.locked, unavailable = q.isPending || q.isError || balance.isPending || balance.isError || access.isPending || access.isError || own.isPending || own.isError;
  const listError = mine ? own.isError : q.isError;
  const listPending = mine ? own.isPending : q.isPending;
  const currentDetail = detail && (rows.find(l=>l.id===detail.id) ?? ownRows.find(l=>l.id===detail.id));
  const detailBlockedReason = !detail ? null : locked
    ? text('Покупка откроется после покупки пака в Магазине.','Buy a pack in the Shop to unlock trading.')
    : unavailable ? q.isPending || balance.isPending || access.isPending || own.isPending
      ? text('Проверяем объявления и баланс…','Checking listings and balance…')
      : text('Покупка пока недоступна. Повтори загрузку.','Purchasing is unavailable. Retry loading.')
    : !currentDetail ? text('Объявление больше не доступно.','This listing is no longer available.')
    : currentDetail.priceTickets!==detail.priceTickets ? text('Цена изменилась. Закрой и открой объявление снова.','The price changed. Close and reopen this listing.')
    : currentDetail.priceTickets>available ? text('Недостаточно билетов.','Not enough tickets.') : null;
  const filterRows = mine ? ownRows : rows;
  const packs = Array.from(new Map(filterRows.filter(l=>!!l.collectionId).map(l=>[l.collectionId!,l.collectionName??l.collectionId!])).entries());
  const coverByCollection = new Map((collectionCovers.data ?? []).map(collection=>[collection.id,collection.coverImageUrl]));
  const visible = [...(mine?ownRows:rows)].filter(l=>!pack||l.collectionId===pack).sort((a,b)=> {
    const d=sort.startsWith('price')?a.priceTickets-b.priceTickets:a.chip.level-b.chip.level;
    return sort.endsWith('up')?d:-d;
  });
  const selectFloor=(n:number)=>setIds([...rows].filter(l=>(!pack||l.collectionId===pack)&&!ownIds.includes(l.id)).sort((a,b)=>a.priceTickets-b.priceTickets).slice(0,n).map(l=>l.id));
  const reviewStale = confirm && (reviewItems.length !== chosen.length || reviewItems.some(item => !chosen.some(l => l.id === item.id && l.priceTickets === item.priceTickets)));
  const sweep = useMarketSweep({enabled:selecting&&!busy&&!confirm&&!listPending&&!listError,order:visible.slice(0,shown).filter(l=>!ownIds.includes(l.id)).map(l=>l.id),selected:ids,onChange:setIds,scrollRef:catalogRef});
  useEffect(()=>setShown(24),[sort,pack,mine]);
  useEffect(()=>{if(!packOpen)return;const close=(event:PointerEvent)=>{if(!packRef.current?.contains(event.target as Node))setPackOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[packOpen]);
  useEffect(()=>{if(confirm) cancelRef.current?.focus();},[confirm]);
  useEffect(()=>{if(pack&&!(mine?own.isPending:q.isPending)&&!filterRows.some(l=>l.collectionId===pack))setPack('');},[filterRows,pack,mine,own.isPending,q.isPending]);
  const refresh = ()=>{void Promise.allSettled([qc.invalidateQueries({queryKey:['market']}),qc.invalidateQueries({queryKey:['my-tickets']}),qc.invalidateQueries({queryKey:['my-chip-inventory']}),qc.invalidateQueries({queryKey:['my-chip-history']})]);};
  const forgetLot = (id:string)=>{for(const key of [['market','listings'],['market','my-listings']])qc.setQueryData<Lot[]>(key,old=>old?.filter(l=>l.id!==id));};
  const openDetail = (lot:Lot)=>{setDetailError('');setDetail(lot);};
  const leave = ()=>{setSelecting(false);setIds([]);setConfirm(false);};
  const closeConfirm = ()=>{if(!busy){setConfirm(false);requestAnimationFrame(()=>(buyRef.current??catalogRef.current)?.focus());}};
  const buyBatch = async()=>{
    if(!batchPurchase||busy||locked||unavailable||reviewStale||!chosen.length||total>available)return;
    setBusy(true);setNotice('');
    try {
      const result = await batchPurchase(chosen.map(l=>l.id),total);
      setIds([]);setConfirm(false);setSelecting(false);refresh();requestAnimationFrame(()=>catalogRef.current?.focus());
      setNotice(text(`Куплено фишек: ${result.count}. Списано ${money(result.total)} билетов.`,`Purchased ${result.count} chips for ${money(result.total)} tickets.`));
    } catch(e) {setNotice(e instanceof Error?e.message:text('Не удалось купить выбранные фишки.','Could not purchase selected chips.'));refresh();}
    finally {setBusy(false);}
  };
  const buyOne = async()=>{
    if(!detail||busy||detailBlockedReason)return;setBusy(true);setDetailError('');setNotice('');
    try {await buyMarketListing({data:{listingId:detail.id}});forgetLot(detail.id);setDetail(null);refresh();setNotice(text('Фишка куплена.','Chip purchased.'));}
    catch(e){setDetailError(marketError(e,'Не удалось купить фишку. Повтори загрузку рынка.','Could not buy the chip. Reload the market.'));refresh();}finally{setBusy(false);}
  };
  const remove = async(l:Lot)=>{if(busy||own.isPending||own.isError||!ownRows.some(row=>row.id===l.id))return;setBusy(true);setNotice('');try{await adminCancelMarketListing({data:{listingId:l.id}});forgetLot(l.id);refresh();setNotice(text('Объявление снято.','Listing removed.'));}catch(e){setNotice(marketError(e,'Не удалось снять объявление. Повтори загрузку рынка.','Could not remove the listing. Reload the market.'));refresh();}finally{setBusy(false);}};
  return <div className={`market-preview ${chosen.length?'has-selection':''}`}>
      <div className="market-preview__scene">
      {onOpenShop && <button type="button" className="market-preview__trading-house-door" onClick={onOpenShop} aria-label={text("Войти в Торговый дом", "Enter Trading House")} />}
      <div className="market-preview__balance"><span>{text('Твои билеты','Your tickets')}</span><strong><ResourceGlyph kind="tickets"/>{balance.isError?'—':balance.isPending?'…':money(available)}{onBuyTickets&&<button type="button" className="market-preview__balance-add" aria-label={text('Купить билеты','Buy tickets')} onClick={onBuyTickets}><Plus aria-hidden="true" /></button>}</strong></div>
      <button className="market-preview__sell" onClick={()=>setCreating(true)}>+ {text('Выставить','Sell')}</button>
    </div>
    <div className="market-preview__filters" aria-label={text('Фильтры рынка','Market filters')}>
      <button aria-pressed={sort.startsWith('price')} onClick={()=>setSort(sort==='price-up'?'price-down':'price-up')}>{text('Цена','Price')} {sort==='price-down'?'↓':'↑'}</button>
      <button aria-label={text('Сортировать по звёздам','Sort by stars')} aria-pressed={sort.startsWith('stars')} onClick={()=>setSort(sort==='stars-down'?'stars-up':'stars-down')}>★ {sort==='stars-up'?'↑':'↓'}</button>
      <div className="market-preview__pack" ref={packRef}>
        <button type="button" className="market-preview__pack-trigger" aria-label={text('Пак фишек','Chip pack')} aria-haspopup="listbox" aria-expanded={packOpen} onClick={()=>setPackOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setPackOpen(true);requestAnimationFrame(()=>packRef.current?.querySelector<HTMLButtonElement>('[role=option]')?.focus());}}}>
          <span>{pack?packs.find(([id])=>id===pack)?.[1]:text('Все паки','All packs')}</span><span aria-hidden="true">⌄</span>
        </button>
        {packOpen&&<div className="market-preview__pack-list" role="listbox" aria-label={text('Выбери пак','Choose pack')}>
          {([['',text('Все паки','All packs')],...packs] as [string,string][]).map(([id,name])=><button key={id||'all'} type="button" role="option" aria-selected={pack===id} onClick={()=>{setPack(id);setPackOpen(false);}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setPackOpen(false);packRef.current?.querySelector<HTMLButtonElement>('.market-preview__pack-trigger')?.focus();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const options=Array.from(packRef.current?.querySelectorAll<HTMLButtonElement>('[role=option]')??[]);const at=options.indexOf(event.currentTarget);options[(at+(event.key==='ArrowDown'?1:options.length-1))%options.length]?.focus();}}}>{id&&coverByCollection.get(id)&&<img className="market-preview__pack-icon" src={coverByCollection.get(id)!} alt="" onError={event=>{event.currentTarget.hidden=true;}}/>}<span>{name}</span></button>)}
        </div>}
      </div>
      <button aria-pressed={mine} onClick={()=>setMine(!mine)}><span className={`market-preview__switch ${mine?'is-on':''}`} aria-hidden="true"/>{text('Мои','Mine')}{ownRows.length?` · ${ownRows.length}`:''}</button>
      {batchPurchase&&<button type="button" className="market-preview__select" aria-label={selecting?text("Отменить выбор","Cancel selection"):text("Выбрать фишки","Select chips")} title={selecting?text("Отменить выбор","Cancel selection"):text("Выбрать фишки","Select chips")} aria-pressed={selecting} onClick={()=>selecting?leave():setSelecting(true)} disabled={busy}>{selecting?<CheckSquare aria-hidden="true"/>:<Square aria-hidden="true"/>}</button>}

    </div>
    <div ref={catalogRef} className="market-preview__catalog" aria-label={text("Предложения рынка","Market offers")} tabIndex={0}>
    {notice&&<p className="market-preview__notice" role="status">{notice}</p>}
    {locked&&<p className="market-preview__notice">{text('Покупка откроется после покупки пака в Магазине.','Buy a pack in the Shop to unlock trading.')}</p>}
    {selecting&&<div className="market-preview__floor" role="group" aria-label={text('Откуп по флору','Floor sweep')}><span>{text('Флор','Floor')}</span>{[10,25,50,100,200].map(n=><button key={n} type="button" disabled={busy} onClick={()=>selectFloor(n)}>{n}</button>)}</div>}
    {listError?<div role="alert" className="market-preview__notice">{text(mine?'Не удалось загрузить свои объявления.':'Не удалось загрузить рынок.',mine?'Could not load your listings.':'Could not load market.')} <button onClick={()=>{void (mine?own:q).refetch();}}>{text('Повторить','Retry')}</button></div>:listPending?<p role="status">{text('Загрузка…','Loading…')}</p>:<>
    {!visible.length&&<p className="market-preview__notice">{text(mine?'Нет своих объявлений.':pack?'В этом паке пока нет предложений.':'Пока нет предложений.',mine?'No listings of your own.':pack?'No offers in this pack.':'No offers yet.')}</p>}
    <div className={`market-preview__grid ${selecting?'is-sweeping':''}`} {...sweep}>{visible.slice(0,shown).map(l=>{
      const isOwn=ownIds.includes(l.id), checked=chosen.some(c=>c.id===l.id);
      return <article key={l.id} className={`market-preview__card ${checked?'is-selected':''} ${selecting&&isOwn?'is-own':''}`}>
        <button data-sweep-id={l.id} className="market-preview__chip" role={selecting?'checkbox':undefined} aria-checked={selecting?checked:undefined} disabled={busy||(selecting&&isOwn)} aria-label={selecting?text(`Выбрать фишку #${l.chip.serialNo}`,`Select chip #${l.chip.serialNo}`):text(`Открыть фишку #${l.chip.serialNo}`,`Open chip #${l.chip.serialNo}`)} onClick={()=>{if(!selecting)openDetail(l);}}>
          <span className="market-preview__serial"><span>#{l.chip.templateNo??'?'}</span><span>№{l.chip.serialNo??'?'}</span></span>
          {selecting&&<span className="market-preview__check">{checked?<CheckSquare/>:<Square/>}</span>}
          <ChipImage src={l.chip.imageUrl??''} level={l.chip.level} alt={l.chip.name} className="w-full"/>
        </button>
        <p className="market-preview__seller" title={l.sellerUsername??l.sellerWallet}>@{l.sellerUsername??l.sellerWallet}</p>
        <strong className="market-preview__price"><ResourceGlyph kind="tickets"/>{money(l.priceTickets)}</strong>
        {!selecting&&<button className={isOwn?'market-preview__unlist':'market-preview__buy'} disabled={busy||(isOwn?(own.isPending||own.isError):(locked||unavailable))} onClick={()=>{if(isOwn){if(!own.isPending&&!own.isError&&window.confirm(text('Снять объявление с рынка?','Remove this listing?')))void remove(l);}else openDetail(l);}}>{text(isOwn?'Снять':'Купить',isOwn?'Unlist':'Buy')}</button>}
      </article>;
    })}</div>
    {shown<visible.length&&<button className="market-preview__more" onClick={()=>setShown(shown+24)}>{text('Показать ещё','Show more')} · {visible.length-shown}</button>}
    </>}
    </div>
    {chosen.length>0&&<div className="market-preview__basket" aria-label={text('Выбранные фишки','Selected chips')}><div><span role="status">{text(`Выбрано: ${chosen.length}`,`Selected: ${chosen.length}`)} <button type="button" className="market-preview__reset" disabled={busy||confirm} onClick={()=>setIds([])}>{text('Сбросить','Clear')}</button></span><strong><ResourceGlyph kind="tickets"/>{money(total)}</strong></div><button ref={buyRef} className="market-preview__buy" disabled={busy||locked||unavailable||total>available} onClick={()=>{setReviewItems(chosen.map(l=>({id:l.id,priceTickets:l.priceTickets})));setConfirm(true);}}>{text('Проверить покупку','Review purchase')}</button>{total>available&&<small>{text('Недостаточно билетов','Not enough tickets')}</small>}</div>}
    {confirm&&<div className="market-preview__veil" onKeyDown={e=>{
      if(e.key==='Escape')closeConfirm();
      if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0]?.focus();}}
    }}><section className="market-preview__confirm" role="alertdialog" aria-modal="true" aria-labelledby="market-confirm-title"><h2 id="market-confirm-title">{text(`Купить ${reviewItems.length} ${chipNoun(reviewItems.length)}?`,`Buy ${reviewItems.length} chips?`)}</h2><div className="market-preview__confirm-total"><span>{text('Итого','Total')}</span><strong><ResourceGlyph kind="tickets"/>{money(reviewItems.reduce((sum,l)=>sum+l.priceTickets,0))}</strong></div>{reviewStale&&<p role="alert">{text('Предложения изменились. Вернись к выбору и проверь сумму.','Offers changed. Return to your selection and review the total.')}</p>}{notice&&<p role="alert">{notice}</p>}<div><button ref={cancelRef} disabled={busy} onClick={closeConfirm}>{text('Отмена','Cancel')}</button><button className="market-preview__buy" disabled={busy||locked||unavailable||reviewStale||!chosen.length||total>available} onClick={()=>void buyBatch()}>{busy?text('Покупаем…','Buying…'):text('Купить','Buy')}</button></div></section></div>}
    {creating&&<MarketCreateListing onClose={()=>setCreating(false)}/>}
    {detail&&<MarketListingDetail listing={currentDetail??detail} mine={ownIds.includes(detail.id)} buying={busy} buyBlockedReason={detailBlockedReason} buyError={detailError} bonusEnabled={bonusEnabled} onBuy={()=>void buyOne()} onClose={()=>{setDetail(null);setDetailError('');}}/>}
  </div>;
}

