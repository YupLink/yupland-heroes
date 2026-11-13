import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Square, Filter, LayoutGrid, List, RectangleVertical, Trash2 } from 'lucide-react';
import { listHeroMarketLots, buyHeroLot, withdrawHeroLot, type HeroLotView, type LotsInput } from '@/server/api/hero-market';
import { getMarketAccess } from '@/server/api/chipsMarket';
import { useLang } from '@/lib/i18n';
import { humanError } from '@/lib/humanError';
import { HeroMarketReview, HeroMarketDetails } from './HeroMarketDialogs';
import { HeroMarketSale } from './HeroMarketSale';
import { money, rarityName, priceOf, lotPrices, payIcon, newReview, type Currency, type ReviewItem } from './heroMarketUi';
import { MarketOfferCount } from './MarketViewControl';
import './hero-market.css';
import './market-approved.css';

import { thumb } from '@/lib/image';
export function HeroMarketScreen({ saleRequest }: { saleRequest: number }) {
  const ru = useLang() === 'ru', qc = useQueryClient();
  const tr = (a: string, b: string) => ru ? a : b;
  const [view, setView] = useState<'one'|'two'|'list'>('two');
  const [filterOpen, setFilterOpen] = useState(false), [selecting, setSelecting] = useState(false);
  const [name, setName] = useState(''), [rarity, setRarity] = useState(''), [race, setRace] = useState(''), [specialization, setSpecialization] = useState('');
  const [currency, setCurrency] = useState<Currency|'all'>('all'), [mine, setMine] = useState(false);
  const [sort, setSort] = useState<NonNullable<LotsInput['sort']>>('price_asc');
  const [selected, setSelected] = useState<HeroLotView[]>([]);
  const [review, setReview] = useState<{items: ReviewItem[]; currency: Currency; withdraw: boolean}|null>(null);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const [detail, setDetail] = useState<HeroLotView|null>(null), [saleOpen, setSaleOpen] = useState(false);
  const previousSale = useRef(saleRequest);
  useEffect(() => { if (previousSale.current !== saleRequest) { previousSale.current = saleRequest; setSaleOpen(true); } }, [saleRequest]);
  const access = useQuery({ queryKey:['market','access'], queryFn:()=>getMarketAccess() });
  const payCurrency:Currency=currency==='darai'?'darai':'gold';
  const input: LotsInput = { name: name.trim() || undefined, rarity: rarity ? [rarity as 'rare'|'epic'|'legendary'] : undefined, race: race || undefined, specialization: specialization || undefined, priceCurrency: currency==='all'?undefined:currency, mine, sort, limit:50 };
  const query = useInfiniteQuery({ queryKey:['hero-market',input], initialPageParam:0, queryFn:({pageParam})=>listHeroMarketLots({data:{...input,offset:pageParam}}), getNextPageParam:last=>last.nextOffset ?? undefined, refetchInterval:20000 });
  const lots = query.data?.pages.flatMap(p=>p.lots) ?? [];
  const blocked = access.isPending || access.isError || !!access.data?.locked;
  const total = selected.reduce((sum,lot)=>sum+(priceOf(lot,payCurrency)??0),0);
  const canBuy = selected.length>0 && selected.every(lot=>(priceOf(lot,payCurrency)??0)>0) && !blocked;
  const toggle = (lot:HeroLotView)=>setSelected(rows=>rows.some(x=>x.id===lot.id)?rows.filter(x=>x.id!==lot.id):[...rows,lot]);
  const openReview = (rows:HeroLotView[], pay:Currency, withdraw=false)=>setReview({items:newReview(rows),currency:pay,withdraw});
  const execute = async()=>{
    if(!review||busyRef.current||(!review.withdraw&&blocked))return;
    busyRef.current=true;setBusy(true);
    const next=[...review.items];
    for(let i=0;i<next.length;i++){
      if(next[i].done)continue;
      const item=next[i];
      try{
        if(review.withdraw)await withdrawHeroLot({data:{op:item.op,lotId:item.lot.id}});
        else await buyHeroLot({data:{op:item.op,lotId:item.lot.id,currency:review.currency,expectPrice:priceOf(item.lot,review.currency)!}});
        next[i]={...item,done:true,error:undefined};
        setSelected(rows=>rows.filter(row=>row.id!==item.lot.id));
      }catch(e){next[i]={...item,error:humanError(e)};}
      setReview(current=>current?{...current,items:[...next]}:current);
    }
    const done=next.filter(x=>x.done).length;
    setNotice(tr(`Готово: ${done} из ${next.length}.`,`Completed: ${done} of ${next.length}.`));
    await qc.invalidateQueries();
    busyRef.current=false;setBusy(false);
  };
  const layoutNames={one:tr('один в ряд','one per row'),two:tr('два в ряд','two per row'),list:tr('список','list')};
  return <div className="market-restored-heroes"><main className="market-heroes-visual" data-hero-view={view} aria-label={tr('Рынок героев','Hero market')}>
    <div className="market-heroes-visual__body">
      <div className="market-heroes-visual__tabs market-catalog-toolbar">
        <MarketOfferCount count={query.isPending||query.isError?null:query.data?.pages[0]?.total??lots.length} pending={query.isPending} ru={ru}/>
        <div className="market-catalog-toolbar__search"><input aria-label={tr('Имя героя','Hero name')} placeholder={tr('Имя героя','Hero name')} value={name} onChange={e=>setName(e.target.value)}/></div>
        <button type="button" className="market-catalog-toolbar__reset" aria-label={tr('Сбросить фильтры героев','Reset hero filters')} title={tr('Сбросить фильтры','Reset filters')} onClick={()=>{setName('');setRace('');setRarity('');setSpecialization('');setMine(false);setCurrency('all');setSort('price_asc');setSelected([]);}}><Trash2 size={17} aria-hidden="true"/></button>
        <button className="market-heroes-visual__view-toggle" aria-label={tr('Вид героев: ','Hero layout: ')+layoutNames[view]} onClick={()=>setView(v=>v==='two'?'list':v==='list'?'one':'two')}>{view==='two'?<LayoutGrid size={18}/>:view==='list'?<List size={18}/>:<RectangleVertical size={18}/>}</button>
        <button className="market-heroes-visual__filter-toggle" aria-label={tr('Фильтры героев','Hero filters')} aria-expanded={filterOpen} onClick={()=>setFilterOpen(!filterOpen)}><Filter size={18}/></button>
      </div>
      {filterOpen&&<><div className="market-heroes-visual__hero-tools">
        <button onClick={()=>setSort(sort==='price_asc'?'price_desc':'price_asc')}>{tr('Цена','Price')} {sort==='price_desc'?'↓':'↑'}</button>
        <button onClick={()=>setSort(sort==='level_desc'?'level_asc':'level_desc')}>{tr('Ур.','Lv.')} {sort==='level_asc'?'↑':'↓'}</button>
        <select aria-label={tr('Валюта','Currency')} value={currency} onChange={e=>setCurrency(e.target.value as Currency|'all')}><option value="all">{tr('Все валюты','All currencies')}</option><option value="gold">{tr('Золото','Gold')}</option><option value="darai">DARAI</option></select>
        <button aria-pressed={mine} onClick={()=>setMine(!mine)}>{tr('Мои','Mine')}</button>
        <button aria-label={tr('Выбрать героев','Select heroes')} aria-pressed={selecting} onClick={()=>{setSelecting(!selecting);setSelected([]);}}>{selecting?<CheckSquare size={16}/>:<Square size={16}/>}</button>
      </div><div className="market-heroes-visual__compact-filters">
        <select aria-label={tr('Редкость','Rarity')} value={rarity} onChange={e=>setRarity(e.target.value)}><option value="">{tr('Редкость','Rarity')}</option>{['rare','epic','legendary'].map(r=><option key={r} value={r}>{rarityName(r,ru)}</option>)}</select>
        <select aria-label={tr('Раса','Race')} value={race} onChange={e=>setRace(e.target.value)}><option value="">{tr('Раса','Race')}</option>{['Юпик','Кабан','Пчела','ДраКошка','Дракон','Единорог'].map(r=><option key={r}>{r}</option>)}</select>
        <select aria-label={tr('Специализация','Specialization')} value={specialization} onChange={e=>setSpecialization(e.target.value)}><option value="">{tr('Специализация','Specialization')}</option>{['Воин','Маг','Путешественник','Строитель','Торговец','Ассасин'].map(r=><option key={r}>{r}</option>)}</select>

      </div></>}
      <div className="market-heroes-visual__catalog" aria-label={tr('Предложения героев','Hero offers')}>
        {notice&&<p role="status">{notice}</p>}
        {access.data?.locked&&<p>{tr('Купи пак в Магазине, чтобы открыть покупки.','Buy a pack in the Shop to unlock purchases.')}</p>}
        {query.isPending?<p role="status">{tr('Загрузка…','Loading…')}</p>:query.isError?<p role="alert">{humanError(query.error)} <button onClick={()=>void query.refetch()}>{tr('Повторить','Retry')}</button></p>:!lots.length?<p>{tr('Герои не найдены','No heroes found')}</p>:null}
        <div className="market-heroes-visual__grid">{lots.map(lot=><article key={lot.id} className={`market-heroes-visual__card${selected.some(x=>x.id===lot.id)?' is-selected':''}`}>
          <div className="market-heroes-visual__heading"><span className="market-heroes-visual__rarity" data-rarity={lot.hero.rarity}>{rarityName(lot.hero.rarity,ru)}</span><strong title={lot.hero.name}>{lot.hero.name}</strong></div>
          {selecting&&<button className="market-heroes-visual__hero-check" disabled={lot.mine} aria-pressed={selected.some(x=>x.id===lot.id)} aria-label={tr('Выбрать ','Select ')+lot.hero.name} onClick={()=>toggle(lot)}>{selected.some(x=>x.id===lot.id)?<CheckSquare size={18}/>:<Square size={18}/>}</button>}
          <button className="market-heroes-visual__art" aria-label={tr('Характеристики: ','Stats: ')+lot.hero.name} onClick={()=>setDetail(lot)}>{lot.hero.imageUrl&&<img src={thumb(lot.hero.imageUrl, 320)} alt={lot.hero.name}/>}</button>
          <div className="market-heroes-visual__traits"><strong>{lot.hero.race} · {lot.hero.specialization}</strong><span className="market-heroes-visual__level">{tr('Ур.','Lv.')} {lot.hero.level} {tr('из','of')} {lot.hero.maxLevel}</span></div>
          <div className="market-heroes-visual__prices">{lotPrices(lot).map(({pay,value})=>lot.mine?<span key={pay} className="market-heroes-visual__own-price" data-currency={pay} aria-label={`${tr('Цена','Price')}: ${money(value,ru)} ${pay}`}><img src={payIcon(pay)} alt=""/>{money(value,ru)}</span>:<button key={pay} data-currency={pay} disabled={blocked} onClick={()=>openReview([lot],pay)} aria-label={`${tr('Купить','Buy')} ${lot.hero.name}: ${money(value,ru)} ${pay}`}><img src={payIcon(pay)} alt={pay==='gold'?tr('золото','gold'):'DARAI'}/>{money(value,ru)}</button>)}{lot.mine&&<button className="market-heroes-visual__withdraw" onClick={()=>openReview([lot],payCurrency,true)}>{tr('Снять','Withdraw')}</button>}</div>
        </article>)}</div>
        {query.hasNextPage&&<button disabled={query.isFetchingNextPage} onClick={()=>void query.fetchNextPage()}>{tr('Показать ещё','Show more')}</button>}
      </div>
      {!!selected.length&&<div className="market-heroes-visual__selection"><span>{tr('Выбрано','Selected')}: {selected.length}</span><button className="market-heroes-visual__clear" onClick={()=>setSelected([])}>{tr('Сбросить','Clear')}</button><strong><img src={payCurrency==='gold'?'/resources/gold.png':'/resources/darai.webp'} alt={payCurrency}/>{money(total,ru)}</strong><button className="market-heroes-visual__buy-selected" disabled={!canBuy} onClick={()=>openReview(selected,payCurrency)}>{tr('Купить выбранных','Buy selected')}</button></div>}
    </div>
    {review&&<HeroMarketReview review={review} ru={ru} busy={busy} blocked={blocked} onConfirm={()=>void execute()} onClose={()=>{if(!busy)setReview(null);}}/>}
    {detail&&<HeroMarketDetails lot={detail} ru={ru} onClose={()=>setDetail(null)}/>}
    {saleOpen&&<HeroMarketSale onClose={()=>setSaleOpen(false)}/>}
  </main></div>;
}
