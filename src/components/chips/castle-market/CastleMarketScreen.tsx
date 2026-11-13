// Approved castle market UI. Production actions use the existing single-listing API.
// С 21.10.2026 маркет за золото: баланс, цены и нехватка — в золоте (market-gold/*).
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Square, CheckSquare, Plus, ShoppingCart, Trash2, ChevronDown, ArrowUp, ArrowDown, Star } from 'lucide-react';
import { ChipImage } from '@/components/ChipImage';
import { ResourceGlyph } from '@/components/ui/ResourceGlyph';
import { MarketListingDetail } from './MarketListingDetail';
import { MarketCreateListing } from './MarketCreateListing';
import { listMarketListings, listMyMarketListings, buyMarketListing, adminCancelMarketListing, getMarketAccess } from '@/server/api/chipsMarket';
import { listChipCollectionsPublic } from '@/server/api/chips-stake';
import { RESOURCES_KEY, useResources } from '@/lib/hooks/useResources';
import { goldShortfall, goldShortText } from '../market-gold/goldMarket';
import { useLang } from '@/lib/i18n';
import { humanError } from '@/lib/humanError';
import './market-preview.css';
import './market-readable.css';
import './market-approved.css';
import { HeroMarketScreen } from './HeroMarketScreen';
import { MarketOfferCount, MarketViewControl, useMarketView } from './MarketViewControl';
import { useMarketSweep } from './useMarketSweep';

type Lot = Awaited<ReturnType<typeof listMarketListings>>[number];
type BatchPurchase = (ids: string[], total: number) => { count: number; total: number } | Promise<{ count: number; total: number }>;
const chipNoun = (count:number)=>count%10===1&&count%100!==11?'фишку':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'фишки':'фишек';
// onBuyGold — «+» у баланса: окно покупки золота (§8.66), на месте прежнего «+» билетов.
export function CastleMarketScreen({ batchPurchase, bonusEnabled, onOpenShop, onBuyGold }: { batchPurchase?: BatchPurchase; bonusEnabled?: boolean; onOpenShop?: () => void; onBuyGold?: () => void } = {}) {
  const [view, setView] = useMarketView();
  const [category,setCategory] = useState<'chips'|'heroes'>('chips');
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
  const catalogPrice = (n:number) => { if(n < 100000) return money(n); const [scale,suffix] = n>=1e9 ? [1e9,ru?'млрд':'B'] : n>=1e6 ? [1e6,ru?'млн':'M'] : [1e3,ru?'тыс.':'K']; return `${(Math.floor(n/Number(scale)*10)/10).toLocaleString(ru?'ru':'en',{maximumFractionDigits:1})} ${suffix}`; };
  // Ключи «-gold»: суточный кэш со старыми лотами в билетах сюда не попадёт.
  const q = useQuery({queryKey:['market','listings-gold'], queryFn:()=>listMarketListings(),refetchInterval:20000});
  const own = useQuery({queryKey:['market','my-listings-gold'],queryFn:()=>listMyMarketListings(),refetchInterval:20000});
  const collectionCovers = useQuery({queryKey:['chip-collections-public'],queryFn:()=>listChipCollectionsPublic()});
  const balance = useResources();
  const access = useQuery({queryKey:['market','access'],queryFn:()=>getMarketAccess()});
  const [sort,setSort] = useState('price-up'), [pack,setPack] = useState(''), [packOpen,setPackOpen] = useState(false), [mine,setMine] = useState(false);
  const [typeNumber,setTypeNumber] = useState('');
  const matchesType = (lot:Lot) => !typeNumber || lot.chip.templateNo === Number(typeNumber);
  const catalogRef = useRef<HTMLDivElement>(null);
  const [reviewItems,setReviewItems] = useState<{id:string;priceGold:number}[]>([]);
  const [selecting,setSelecting] = useState(false), [ids,setIds] = useState<string[]>([]);
  const [heroSaleRequest,setHeroSaleRequest] = useState(0);
  const [detail,setDetail] = useState<Lot|null>(null), [creating,setCreating] = useState(false);
  const [detailError,setDetailError] = useState('');
  const [confirm,setConfirm] = useState(false), [busy,setBusy] = useState(false), [notice,setNotice] = useState('');
  const [shown,setShown] = useState(24);
  const cancelRef = useRef<HTMLButtonElement>(null), buyRef = useRef<HTMLButtonElement>(null), packRef = useRef<HTMLDivElement>(null);
  const rows = q.data ?? [], ownRows = own.data ?? [], ownIds = ownRows.map(l=>l.id);
  const chosen:Lot[] = rows.filter(l=>ids.includes(l.id)&&!ownIds.includes(l.id));
  const total = chosen.reduce((sum,l)=>sum+l.priceGold,0);
  const available = Number(balance.data?.gold ?? 0);
  const totalShort = goldShortfall(total, balance.isSuccess ? available : null);
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
    : currentDetail.priceGold!==detail.priceGold ? text('Цена изменилась. Закрой и открой объявление снова.','The price changed. Close and reopen this listing.')
    : goldShortfall(currentDetail.priceGold, available) ? goldShortText(goldShortfall(currentDetail.priceGold, available)!, ru) : null;
  const filterRows = mine ? ownRows : rows;
  const packs = Array.from(new Map(filterRows.filter(l=>!!l.collectionId).map(l=>[l.collectionId!,l.collectionName??l.collectionId!])).entries());
  const coverByCollection = new Map((collectionCovers.data ?? []).map(collection=>[collection.id,collection.coverImageUrl]));
  const visible = [...(mine?ownRows:rows)].filter(l=>(!pack||l.collectionId===pack)&&matchesType(l)).sort((a,b)=> {
    const d=sort.startsWith('price')?a.priceGold-b.priceGold:a.chip.level-b.chip.level;
    return sort.endsWith('up')?d:-d;
  });
  const selectFloor=(n:number)=>setIds([...rows].filter(l=>(!pack||l.collectionId===pack)&&matchesType(l)&&!ownIds.includes(l.id)).sort((a,b)=>a.priceGold-b.priceGold).slice(0,n).map(l=>l.id));
  const reviewStale = confirm && (reviewItems.length !== chosen.length || reviewItems.some(item => !chosen.some(l => l.id === item.id && l.priceGold === item.priceGold)));
  const sweep = useMarketSweep({enabled:selecting&&!busy&&!confirm&&!listPending&&!listError,order:visible.slice(0,shown).filter(l=>!ownIds.includes(l.id)).map(l=>l.id),selected:ids,onChange:setIds,scrollRef:catalogRef});
  useEffect(()=>setShown(24),[sort,pack,mine,typeNumber]);
  useEffect(()=>{if(!packOpen)return;const close=(event:PointerEvent)=>{if(!packRef.current?.contains(event.target as Node))setPackOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[packOpen]);
  useEffect(()=>{
    if(!packOpen)return;
    const fit=()=>{
      const menu=packRef.current?.querySelector<HTMLElement>('[role=listbox]');
      if(menu)menu.style.maxHeight=`${Math.max(44,Math.min(250,window.innerHeight-menu.getBoundingClientRect().top-8))}px`;
    };
    fit();window.addEventListener('resize',fit);
    return()=>window.removeEventListener('resize',fit);
  },[packOpen]);
  useEffect(()=>{if(confirm) cancelRef.current?.focus();},[confirm]);
  useEffect(()=>{if(pack&&!(mine?own.isPending:q.isPending)&&!filterRows.some(l=>l.collectionId===pack))setPack('');},[filterRows,pack,mine,own.isPending,q.isPending]);
  const refresh = ()=>{void Promise.allSettled([qc.invalidateQueries({queryKey:['market']}),qc.invalidateQueries({queryKey:RESOURCES_KEY}),qc.invalidateQueries({queryKey:['my-chip-inventory']}),qc.invalidateQueries({queryKey:['my-chip-history']})]);};
  const forgetLot = (id:string)=>{for(const key of [['market','listings-gold'],['market','my-listings-gold']])qc.setQueryData<Lot[]>(key,old=>old?.filter(l=>l.id!==id));};
  const openDetail = (lot:Lot)=>{setDetailError('');setDetail(lot);};
  const leave = ()=>{setSelecting(false);setIds([]);setConfirm(false);};
  const closeConfirm = ()=>{if(!busy){setConfirm(false);requestAnimationFrame(()=>(buyRef.current??catalogRef.current)?.focus());}};
  const buyBatch = async()=>{
    if(!batchPurchase||busy||locked||unavailable||reviewStale||!chosen.length||totalShort)return;
    setBusy(true);setNotice('');
    try {
      const result = await batchPurchase(chosen.map(l=>l.id),total);
      setIds([]);setConfirm(false);setSelecting(false);refresh();requestAnimationFrame(()=>catalogRef.current?.focus());
      setNotice(text(`Куплено фишек: ${result.count}. Списано ${money(result.total)} золота.`,`Purchased ${result.count} chips for ${money(result.total)} gold.`));
    } catch(e) {setNotice(e instanceof Error?humanError(e):text('Не удалось купить выбранные фишки.','Could not purchase selected chips.'));refresh();}
    finally {setBusy(false);}
  };
  const buyOne = async()=>{
    if(!detail||busy||detailBlockedReason)return;setBusy(true);setDetailError('');setNotice('');
    try {await buyMarketListing({data:{listingId:detail.id}});forgetLot(detail.id);setDetail(null);refresh();setNotice(text('Фишка куплена.','Chip purchased.'));}
    catch(e){setDetailError(marketError(e,'Не удалось купить фишку. Повтори загрузку рынка.','Could not buy the chip. Reload the market.'));refresh();}finally{setBusy(false);}
  };
  const remove = async(l:Lot)=>{if(busy||own.isPending||own.isError||!ownRows.some(row=>row.id===l.id))return;setBusy(true);setNotice('');try{await adminCancelMarketListing({data:{listingId:l.id}});forgetLot(l.id);refresh();setNotice(text('Объявление снято.','Listing removed.'));}catch(e){setNotice(marketError(e,'Не удалось снять объявление. Повтори загрузку рынка.','Could not remove the listing. Reload the market.'));refresh();}finally{setBusy(false);}};
  return <div data-view={view} className={`market-preview market-readable market-approved ${chosen.length?'has-selection':''}`}>
      <div className="market-preview__scene">
      {onOpenShop && <button type="button" className="market-preview__trading-house-door" onClick={onOpenShop} aria-label={text("Войти в Торговый дом", "Enter Trading House")} />}
      <div className="market-preview__balance"><span className="sr-only">{text('Твоё золото','Your gold')}</span><strong><ResourceGlyph kind="gold" label={text('золото','gold')}/>{balance.isError?'—':balance.isPending?'…':money(available)}{onBuyGold&&<button type="button" className="market-preview__balance-add" data-gold-topup aria-label={text('Купить золото','Buy gold')} onClick={onBuyGold}><Plus aria-hidden="true"/></button>}</strong></div>
      <button className="market-preview__sell" onClick={()=>category==='heroes'?setHeroSaleRequest(n=>n+1):setCreating(true)}>{text('Выставить','Sell')}</button>
    </div>
    <div className="market-approved__tabs" role="tablist" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'chips':event.key==='End'?'heroes':category==='chips'?'heroes':'chips';setCategory(next);leave();event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next==='chips'?0:1]?.focus();}} aria-label={text('Раздел рынка','Market section')}>
      <button type="button" role="tab" tabIndex={category==='chips'?0:-1} aria-selected={category==='chips'} onClick={()=>{setCategory('chips');leave();}}>{text('Фишки','Chips')}</button>
      <button type="button" role="tab" tabIndex={category==='heroes'?0:-1} aria-selected={category==='heroes'} onClick={()=>{setCategory('heroes');leave();}}>{text('Герои','Heroes')}</button>
    </div>
    {category==='heroes'?<HeroMarketScreen saleRequest={heroSaleRequest}/>:<>
    <div className="market-readable__toolbar market-catalog-toolbar"><MarketOfferCount count={listPending||listError?null:visible.length} pending={listPending} ru={ru}/><div className="market-approved__type-search market-catalog-toolbar__search"><input aria-label={text('Номер типа фишки','Chip type number')} placeholder={text('№ типа','Type no.')} inputMode="numeric" pattern="[0-9]*" value={typeNumber} onChange={event=>{setTypeNumber(event.target.value.replace(/[^0-9]/g,''));setIds([]);}}/></div><button type="button" className="market-catalog-toolbar__reset" aria-label={text('Сбросить фильтры фишек','Reset chip filters')} title={text('Сбросить фильтры','Reset filters')} onClick={()=>{setTypeNumber('');setPack('');setMine(false);setSort('price-up');setIds([]);}}><Trash2 size={17} aria-hidden="true"/></button><MarketViewControl view={view} onChange={setView} ru={ru}/></div>
    <div className="market-preview__filters" aria-label={text('Фильтры рынка','Market filters')}>
      <button aria-pressed={sort.startsWith('price')} onClick={()=>setSort(sort==='price-up'?'price-down':'price-up')}>{text('Цена','Price')} {sort==='price-down'?'↓':'↑'}</button>
      <button className="market-approved__star-sort" aria-label={text('Сортировать по звёздам','Sort by stars')} aria-pressed={sort.startsWith('stars')} onClick={()=>setSort(sort==='stars-down'?'stars-up':'stars-down')}><Star className="market-approved__sort-star" aria-hidden="true"/>{sort==='stars-up'?<ArrowUp aria-hidden="true"/>:<ArrowDown aria-hidden="true"/>}</button>
      <div className="market-preview__pack" ref={packRef}>
        <button type="button" className="market-preview__pack-trigger" aria-label={text('Пак фишек','Chip pack')} aria-haspopup="listbox" aria-expanded={packOpen} onClick={()=>setPackOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setPackOpen(true);requestAnimationFrame(()=>packRef.current?.querySelector<HTMLButtonElement>('[role=option]')?.focus());}}}>
          <span>{pack?packs.find(([id])=>id===pack)?.[1]:text('Все паки','All packs')}</span><ChevronDown className="market-approved__pack-chevron" aria-hidden="true"/>
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
    {selecting&&<div className="market-preview__floor" role="group" aria-label={text('Откуп по флору','Floor sweep')}><span title={text('Выбрать самые дешёвые фишки','Select the cheapest chips')}>{text('Откуп','Sweep')}</span>{[10,25,50,100,200].map(n=><button key={n} type="button" aria-label={text(`Выбрать ${n} самых дешёвых фишек`,`Select ${n} cheapest chips`)} disabled={busy} onClick={()=>selectFloor(n)}>{n} {text('шт.','pcs')}</button>)}</div>}
    {listError?<div role="alert" className="market-preview__notice">{text(mine?'Не удалось загрузить свои объявления.':'Не удалось загрузить рынок.',mine?'Could not load your listings.':'Could not load market.')} <button onClick={()=>{void (mine?own:q).refetch();}}>{text('Повторить','Retry')}</button></div>:listPending?<p role="status">{text('Загрузка…','Loading…')}</p>:<>
    {!visible.length&&<p className="market-preview__notice">{text(typeNumber?'Для этого типа нет предложений с выбранными фильтрами.':mine?'Нет своих объявлений.':pack?'В этом паке пока нет предложений.':'Пока нет предложений.',typeNumber?'No offers for this type with the selected filters.':mine?'No listings of your own.':pack?'No offers in this pack.':'No offers yet.')}</p>}
    <div className={`market-preview__grid ${selecting?'is-sweeping':''}`} {...sweep}>{visible.slice(0,shown).map(l=>{
      const isOwn=ownIds.includes(l.id), checked=chosen.some(c=>c.id===l.id);
      return <article key={l.id} className={`market-preview__card ${checked?'is-selected':''} ${selecting&&isOwn?'is-own':''}`}>
        <button data-sweep-id={l.id} className="market-preview__chip" role={selecting?'checkbox':undefined} aria-checked={selecting?checked:undefined} disabled={busy||(selecting&&isOwn)} aria-label={selecting?text(`Выбрать фишку #${l.chip.serialNo}`,`Select chip #${l.chip.serialNo}`):text(`Открыть фишку #${l.chip.serialNo}`,`Open chip #${l.chip.serialNo}`)} onClick={()=>{if(!selecting)openDetail(l);}}>
          <span className="market-preview__serial"><span>#{l.chip.templateNo??'?'}</span><span>№{l.chip.templateNo??'?'}</span></span>
          {selecting&&<span className="market-preview__check">{checked?<CheckSquare/>:<Square/>}</span>}
          {(view==='2'||view==='3')&&<span className="market-portrait-stars" aria-label={`${l.chip.level} ★`}>{Array.from({length:5},(_,i)=><span key={i} aria-hidden="true" style={{backgroundImage:`linear-gradient(90deg,#ffce38 ${Math.max(0,Math.min(1,l.chip.level-i))*100}%,#ffffff 0)`}}>★</span>)}</span>}
          <ChipImage src={l.chip.imageUrl??''} level={l.chip.level} hideStars={true} alt={l.chip.name} className="w-full"/>
        </button>
        <p className="market-readable__name" title={l.collectionName??text('Коллекция','Collection')}><span className="market-collection-title">{l.collectionName??text('Коллекция','Collection')}</span>{view==='list'&&<span className="market-list-stars" aria-label={`${l.chip.level} ★`}>{Array.from({length:5},(_,i)=><span key={i} aria-hidden="true" style={{backgroundImage:`linear-gradient(90deg,#ffce38 ${Math.max(0,Math.min(1,l.chip.level-i))*100}%,#ffffff 0)`}}>★</span>)}</span>}</p>
        <p className="market-preview__seller" title={l.sellerUsername??l.sellerWallet}>{view==='list'&&<span className="market-list-number">№{l.chip.templateNo??'?'}<span aria-hidden="true"> · </span></span>}<span className="market-list-seller">{l.sellerUsername??l.sellerWallet}</span></p>
        <strong className="market-preview__price" title={text(`Цена: ${money(l.priceGold)} золота`,`Price: ${money(l.priceGold)} gold`)} aria-label={text(`Цена: ${money(l.priceGold)} золота`,`Price: ${money(l.priceGold)} gold`)}><ResourceGlyph kind="gold" label={text('золото','gold')}/>{catalogPrice(l.priceGold)}</strong>
        {!selecting&&<button className={isOwn?'market-preview__unlist':'market-preview__buy'} aria-label={text(isOwn?'Снять':'Купить',isOwn?'Unlist':'Buy')} title={text(isOwn?'Снять':'Купить',isOwn?'Unlist':'Buy')} disabled={busy||(isOwn?(own.isPending||own.isError):(locked||unavailable))} onClick={()=>{if(isOwn){if(!own.isPending&&!own.isError&&window.confirm(text('Снять объявление с рынка?','Remove this listing?')))void remove(l);}else openDetail(l);}}>{view==='list'&&!isOwn?<ShoppingCart size={16} aria-hidden="true"/>:text(isOwn?'Снять':'Купить',isOwn?'Unlist':'Buy')}</button>}
      </article>;
    })}</div>
    {shown<visible.length&&<button className="market-preview__more" onClick={()=>setShown(shown+24)}>{text('Показать ещё','Show more')} · {visible.length-shown}</button>}
    </>}
    </div>
    </>}
    {category==='chips'&&chosen.length>0&&<div className="market-preview__basket" aria-label={text('Выбранные фишки','Selected chips')}><div><span role="status">{text(`Выбрано: ${chosen.length}`,`Selected: ${chosen.length}`)} <button type="button" className="market-preview__reset" disabled={busy||confirm} onClick={()=>setIds([])}>{text('Сбросить','Clear')}</button></span><strong><ResourceGlyph kind="gold" label={text('золото','gold')}/>{money(total)}</strong></div><button ref={buyRef} className="market-preview__buy" disabled={busy||locked||unavailable||!!totalShort} onClick={()=>{setReviewItems(chosen.map(l=>({id:l.id,priceGold:l.priceGold})));setConfirm(true);}}>{text('Проверить покупку','Review purchase')}</button>{totalShort&&<small role="status">{goldShortText(totalShort, ru)}</small>}</div>}
    {confirm&&<div className="market-preview__veil" onKeyDown={e=>{
      if(e.key==='Escape')closeConfirm();
      if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0]?.focus();}}
    }}><section className="market-preview__confirm" role="alertdialog" aria-modal="true" aria-labelledby="market-confirm-title"><h2 id="market-confirm-title">{text(`Купить ${reviewItems.length} ${chipNoun(reviewItems.length)}?`,`Buy ${reviewItems.length} chips?`)}</h2><div className="market-preview__confirm-total"><span>{text('Итого','Total')}</span><strong><ResourceGlyph kind="gold" label={text('золото','gold')}/>{money(reviewItems.reduce((sum,l)=>sum+l.priceGold,0))}</strong></div>{reviewStale&&<p role="alert">{text('Предложения изменились. Вернись к выбору и проверь сумму.','Offers changed. Return to your selection and review the total.')}</p>}{notice&&<p role="alert">{notice}</p>}<div><button ref={cancelRef} disabled={busy} onClick={closeConfirm}>{text('Отмена','Cancel')}</button><button className="market-preview__buy" disabled={busy||locked||unavailable||reviewStale||!chosen.length||!!totalShort} onClick={()=>void buyBatch()}>{busy?text('Покупаем…','Buying…'):text('Купить','Buy')}</button></div></section></div>}
    {creating&&<MarketCreateListing onClose={()=>setCreating(false)}/>}
    {detail&&<MarketListingDetail listing={currentDetail??detail} mine={ownIds.includes(detail.id)} buying={busy} buyBlockedReason={detailBlockedReason} buyError={detailError} bonusEnabled={bonusEnabled} onBuy={()=>void buyOne()} onClose={()=>{setDetail(null);setDetailError('');}}/>}
  </div>;
}

