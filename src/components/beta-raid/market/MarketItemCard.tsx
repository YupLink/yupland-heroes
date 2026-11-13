import {useState} from 'react';
import {Lock} from 'lucide-react';
import type {MarketItemView} from '@/lib/buildingEffect';
import {useLang,useT} from '@/lib/i18n';
import {ItemInfoModal} from './ItemInfoModal';
import {artPayNeed,artPickMax} from './artPay';
import {MarketArtPick,type ArtChoice} from './MarketArtPick';
import {MarketHeroPick} from './MarketHeroPick';
import {goodEntry,priceEntries} from './exchange';
import {artAnyRarity} from './artAnyIcon';
import {RarityBadge} from '@/components/beta-raid/economy/EconomyRarity';
import {metaLabel} from '@/components/heroMeta';
import {QTY_CAP} from './useMarketMax';
import {numText} from './num';
import {MarketPrice} from './MarketPrice';
import {MarketQuantity} from './MarketQuantity';
import {MarketItemImage} from './MarketItemImage';
import {useCardItemInfo} from './useCardItemInfo';
import {MarketInlineDetails} from './MarketInlineDetails';
import {hasOwnedStock,type OwnedStock} from './sellInventory';
import {MarketCardActions} from './MarketCardActions';
import {RecipeInfoModal} from './RecipeInfoModal';
import {recipeBrief} from './recipeView';
import {cityAvgPrice} from './townQuote';
import {priceKeys} from './marketShort';
export function MarketItemCard({
  it,
  qty,
  onQty,
  pick,
  onPick,
  maxAffordable,
  owned,
  cityTotal,
  short,
  buyCap,
}: {
  it: MarketItemView;
  /** Сколько выбрано в корзину (0 = не берём). */
  qty: number;
  onQty: (qty: number) => void;
  /** Какой артефакт игрок отдаёт по позиции «любой арт редкости X». */
  pick?: ArtChoice | null;
  onPick?: (choice: ArtChoice) => void;
  /**
   * Сколько единиц игрок может взять прямо сейчас — под кнопку «Макс».
   * Считает useMarketMax: в скупке по товару на руках, в покупке по деньгам.
   * null — источник неизвестен (паки, герои, именной артефакт), и кнопки тогда
   * нет: обещать наугад хуже, чем не обещать.
   */
  maxAffordable?: number | null;
  owned?: OwnedStock;
  /** Итог строки корзины по кривой ратуши (cityCartTotals) — для средней «/шт». */
  cityTotal?: number | null;
  /** Покупка: ключи costKey строк цены, которых не хватает (marketShort) — красным. */
  short?: ReadonlySet<string>;
  /** Покупка: сколько единиц по карману (без места в рюкзаке) — потолок «+». null — не знаем. */
  buyCap?: number | null;
}) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const [info, setInfo] = useState(false);
  const isSell = it.side === "sell";
  // «Подробности» имеют смысл для того, что несёт статы/бонусы: арт, герой,
  // босс, кастом. У ресурса за иконкой ничего кроме количества — не мучаем.
  const artAny = artPayNeed(it);
  // «Любой герой» — псевдо-шаблон, карточки шаблона у него нет.
  const canHaveDetails =
    !!it.refId &&
    artAny?.what !== "hero" &&
    !artAnyRarity(it.refId) &&
    (it.kind === "art" || it.kind === "hero" || it.kind === "boss" || it.kind === "custom");
  const details = useCardItemInfo(canHaveDetails ? it.refId! : null, lang, it.boost);
  // Остаток работает на обеих витринах: у покупки это «сколько ещё продадим»,
  // у скупки — «сколько ещё примем» (лимит выкупа задаёт админ).
  const soldOut = it.remaining != null && it.remaining <= 0;
  // «Любой артефакт редкости X» — и в скупке (это товар), и в покупке (это
  // цена): пока игрок не ткнул, КАКОЙ именно отдаёт, класть позицию в корзину
  // нельзя — иначе сервер забрал бы самый старый свободный, а игрок берёг его.
  // То же у скупки «Любой … герой»: игрок выбирает копию (artAny.what='hero').
  const locked = !it.buyable || soldOut || (artAny != null && !pick);
  // Целых штук, не больше остатка. Округляем ВНИЗ: у позиций, которые торговали
  // десятыми до этой правки, остаток бывает дробным (7,2), и «+» до самого верха
  // положил бы в корзину 7,2 — сервер такое количество уже не принимает.
  // Выбранный артефакт добавляет свой потолок: сдать можно только свободные, и
  // одна единица сделки уносит perUnit штук (artPickMax делит).
  const ceil = (count: number | null) =>
    Math.floor(
      Math.min(
        it.remaining == null ? QTY_CAP : it.remaining,
        QTY_CAP,
        count != null ? artPickMax(it, count) : QTY_CAP,
      ),
    );
  // В покупке «+» не уводит дальше, чем по карману, — как «Макс» (useMarketMax).
  const max = Math.min(ceil(pick ? pick.count : null), !isSell && buyCap != null ? buyCap : QTY_CAP);
  // «Макс» — всё, что игрок реально потянет: в скупке это товар на руках, в
  // покупке — деньги под цену (обе цены разом, если админ задал алхимию). Ноль
  // оставляем видимым, кнопка просто гаснет: «Макс 0» честно говорит, что
  // сделка сейчас не выйдет.
  const maxPick = maxAffordable ?? null;
  // Ломбард «Любой …» (скупка не у лавки города): героев и артефакты отмечают
  // поштучно — сколько отметил, столько и сдаёт (в пределах остатка скупки и
  // капа), без лишних нажатий «+».
  const pawn = isSell && !it.town;
  const pickMany = (c: ArtChoice) => {
    onPick?.(c);
    if (it.buyable && !soldOut) onQty(ceil(c.count));
  };

  // Рецепт (§8.104): исходы с шансами строкой на плитке и списком по «i».
  const recipe = it.kind === 'recipe' ? (it.outcomes ?? []) : null;
  const good = goodEntry(it, t, lang);
  // Город: при 2+ шт. «/шт» — средняя по кривой из итога корзины, а не цена первой штуки.
  const avg = cityAvgPrice(it, qty, cityTotal);
  const prices = priceEntries(t, avg == null ? it : {...it, priceAmount: avg});
  const keys = isSell || !short ? [] : priceKeys(it);

  const choice=!!artAny&&isSell;
  const unit=good.amount!==1?(lang==='en'?'/bundle':'/набор'):(lang==='en'?'/item':'/шт');
  return <article data-market-ref={it.refId ?? undefined} data-market-side={it.side ?? "buy"} ref={details.cardRef} className={`raid-market-card ${owned&&hasOwnedStock(owned)?'is-owned':''} ${qty>0?'is-selected':''} ${choice?'is-choice':''}`} aria-label={good.label}>
    <MarketCardActions rush={!!(isSell&&it.town?.rush)} label={t('market.town_rush')}>
    {recipe&&<button type="button" className="raid-market-info" aria-label={`${t('recipe.can_get')}: ${good.label}`} title={t('recipe.can_get')} onClick={()=>setInfo(true)}>i</button>}
    {(details.hasDetails||details.isError)&&<button type="button" className="raid-market-info" aria-label={`${t('market.item_info')}: ${good.label}`} title={details.isError?(lang==='en'?'Could not load details. Open to retry.':'Не удалось загрузить свойства. Открыть и повторить.'):t('market.item_info')} onClick={()=>setInfo(true)}>{details.isError?'!':'i'}</button>}
    {details.loading&&!details.hasDetails&&!details.isError&&<span className="raid-market-info is-loading" role="status" aria-label={lang==='en'?'Loading properties':'Загрузка свойств'}>…</span>}
    </MarketCardActions>
    <h3 title={good.label}>{good.label}</h3>
    <div className="raid-market-picture"><MarketItemImage normalize good={good} tone={isSell?"pay":"get"} art={it.kind==="art"&&!artAnyRarity(it.refId)}/></div>
    <MarketInlineDetails lines={recipe?recipeBrief(recipe,t,lang):details.lines} reserveAction={!!(isSell&&it.town?.rush)}><div className="raid-market-prices">{prices.map((entry,i)=><MarketPrice key={i} entry={entry} compact unit={i===prices.length-1?unit:undefined} short={!!short?.has(keys[i]??'')}/>)}{avg!=null&&<small className="raid-market-avg">{t('market.avg_price')}</small>}</div>
    <div className="raid-market-stock">
      {isSell&&owned&&<span className="raid-market-owned-count" title={owned.count==null&&!owned.loading?(lang==='en'?'Quantity could not be confirmed':'Количество не удалось подтвердить'):undefined}>{it.kind==='art'||artAny?.what==='hero'?(lang==='en'?'Available:':'Свободно:'):(lang==='en'?'You have:':'У тебя:')} {owned.count==null?(owned.loading?'…':'—'):`${numText(owned.count)}${owned.limited?'+':''}`}</span>}
      {it.heroRarity&&<RarityBadge rarity={it.heroRarity} label={metaLabel(it.heroRarity,lang)} className="text-[9px] tracking-normal"/>}
      {soldOut?<span className="text-destructive">{t(isSell?'market.buyout_full':'market.sold_out')}</span>:!it.buyable&&it.lockKey?<span className="text-destructive"><Lock size={10}/>{t(it.lockKey)}</span>:it.remaining!=null?<span>{t(isSell?'market.buyout_left':'market.left',{n:numText(it.remaining)})}</span>:null}
    </div>
    </MarketInlineDetails>
    <div className="raid-market-controls">
      {artAny&&onPick&&artAny.what==='hero'&&<MarketHeroPick rarity={artAny.rarity} value={pick??null} onPick={pickMany}/>}
      {artAny&&onPick&&artAny.what==='art'&&<MarketArtPick rarity={artAny.rarity} worn={pawn} multi={pawn} value={pick??null} onPick={pawn?pickMany:onPick}/>}
      {!choice&&<MarketQuantity value={qty} max={max} disabled={locked} onChange={onQty} name={good.label} maxAffordable={maxPick}/>}
    </div>
    {info&&recipe&&<RecipeInfoModal name={good.label} outcomes={recipe} onClose={()=>setInfo(false)}/>}
    {info&&canHaveDetails&&it.refId&&<ItemInfoModal id={it.refId} fullName={good.label} layer="z-[170]" onClose={()=>setInfo(false)}/>}
  </article>;
}




