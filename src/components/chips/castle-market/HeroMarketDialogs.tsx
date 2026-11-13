import { usePurchaseMusic } from "@/hooks/usePurchaseMusic";
import { X } from 'lucide-react';
import { TavernDialog } from '@/components/castle-live/TavernDialog';
import { HeroSummaryCard } from '@/components/heroes/HeroSummaryCard';
import { EnchantMark } from '@/components/EnchantMark';
import type { HeroLotView } from '@/server/api/hero-market';
import { money, rarityName, priceOf, lotPrices, payIcon, type ReviewItem, type Currency } from './heroMarketUi';
import { thumb } from '@/lib/image';
export function HeroMarketReview({review,ru,busy,blocked,onConfirm,onClose}:{review:{items:ReviewItem[];currency:Currency;withdraw:boolean};ru:boolean;busy:boolean;blocked:boolean;onConfirm:()=>void;onClose:()=>void}) {
  usePurchaseMusic(true);
  const tr=(a:string,b:string)=>ru?a:b;
  const allDone=review.items.every(x=>x.done);
  const total=review.items.reduce((sum,x)=>sum+(priceOf(x.lot,review.currency)??0),0);
  return <TavernDialog title={tr('Подтверждение','Confirmation')} className="market-hero-purchase market-hero-purchase--batch" overlayClassName="market-hero-purchase-veil" locked={busy} onClose={onClose}>
    <header><h2>{allDone?tr('Готово','Done'):review.withdraw?tr('Снять с продажи?','Withdraw listing?'):tr('Купить героев?','Buy heroes?')}</h2><button disabled={busy} aria-label={tr('Закрыть','Close')} onClick={onClose}><X size={20}/></button></header>
    <div className="market-hero-purchase__items">{review.items.map(item=><div key={item.lot.id}>{item.lot.hero.imageUrl&&<img src={thumb(item.lot.hero.imageUrl, 128)} alt=""/>}<div><b>{item.lot.hero.name}</b> <span className="market-heroes-visual__rarity" data-rarity={item.lot.hero.rarity}>{rarityName(item.lot.hero.rarity,ru)}</span><p>{item.lot.hero.race} · {item.lot.hero.specialization} · {tr('Ур.','Lv.')} {item.lot.hero.level} / {item.lot.hero.maxLevel}</p>{review.withdraw?<b className="hero-market-own-prices">{lotPrices(item.lot).map(({pay,value})=><span key={pay}><img src={payIcon(pay)} alt={pay==='gold'?tr('золото','gold'):'DARAI'}/>{money(value,ru)}</span>)}</b>:<b>{money(priceOf(item.lot,review.currency)??0,ru)}</b>}{item.done&&<p role="status">{review.withdraw?tr('Снято','Withdrawn'):tr('Куплено','Purchased')}</p>}{item.error&&<p role="alert">{item.error}</p>}</div></div>)}</div>
    {!review.withdraw&&<strong><img src={payIcon(review.currency)} alt={review.currency}/>{money(total,ru)}</strong>}
    {review.items.length>1&&!allDone&&<p className="hero-market-review-note">{tr('Каждый герой покупается отдельно. Итог будет показан по каждому.','Each hero is purchased separately. Results are shown individually.')}</p>}
    {!review.withdraw&&blocked&&<p className="hero-market-review-note" role="alert">{tr('Покупка сейчас недоступна.','Purchasing is currently unavailable.')}</p>}
    <footer><button disabled={busy} onClick={onClose}>{allDone?tr('К героям','Back to heroes'):tr('Назад','Back')}</button>{!allDone&&<button className="market-hero-purchase__primary" disabled={busy||(!review.withdraw&&blocked)} onClick={onConfirm}>{busy?tr('Подождите…','Please wait…'):review.items.some(x=>x.error)?tr('Повторить','Retry'):tr('Подтвердить','Confirm')}</button>}</footer>
  </TavernDialog>;
}
export function HeroMarketDetails({lot,ru,onClose}:{lot:HeroLotView;ru:boolean;onClose:()=>void}){
  const tr=(a:string,b:string)=>ru?a:b;
  return <TavernDialog title={lot.hero.name} onClose={onClose} className="market-hero-details" overlayClassName="market-hero-purchase-veil">
    <header className="market-hero-details__header"><button className="market-hero-details__back" onClick={onClose}>← {tr('Назад к героям','Back to heroes')}</button><h2>{lot.hero.name}</h2><button aria-label={tr('Закрыть характеристики','Close stats')} onClick={onClose}><X size={20}/></button></header>
    <HeroSummaryCard hero={lot.hero} stats={lot.hero.stats} compact unframed/>
    {!!lot.hero.artifacts.length&&<section><h3>{tr('Артефакты с героем','Included artifacts')}</h3>{lot.hero.artifacts.map(a=><p key={a.itemId}>{a.name} <EnchantMark pct={a.enchantPct} show="pct"/> · {tr('Износ','Wear')} {a.wear}%</p>)}</section>}
    {!!lot.hero.spells.length&&<section><h3>{tr('Заклинания','Spells')}</h3>{lot.hero.spells.map(s=><p key={s.id}>{s.name}</p>)}</section>}
  </TavernDialog>;
}

