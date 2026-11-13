import { usePurchaseMusic } from "@/hooks/usePurchaseMusic";
// Витрина маркета глазами игрока. У клетки ДВЕ независимые витрины, между
// которыми переключается тумблер сверху:
//   «Купить»  — магазин продаёт: игрок платит цену, получает товар (buyMarketItem);
//   «Продать» — магазин скупает: игрок отдаёт товар, получает цену (sellMarketItem).
// Содержимое у сторон разное — это разные списки товаров, а не зеркало одного.
//
// Внутри стороны — грид 3-в-ряд, у каждой плитки степпер количества (корзина).
// Одна кнопка внизу проводит ВСЮ корзину: каждая позиция уходит атомарным
// server-fn (деньги→товар→откат), корзина обходит их по очереди и сводит итог
// (useMarketCheckout).
import { useContext, useMemo, useState } from "react";
import { Loader2, ShoppingCart, X } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import type { MarketItemView } from "@/lib/buildingEffect";
import type { MarketSide } from "@/lib/marketItem";
import { MarketItemCard } from "./market/MarketItemCard";
import { MarketSideTabs } from "./market/MarketSideTabs";
import { MarketShopBanner } from "./market/MarketShopBanner";
import { TrainingSalePanel } from "./island/TrainingSalePanel";
import { cartCost } from "./market/cartCost";
import {goodEntry} from "./market/exchange";
import {GridViewToggle,useGridColumns} from "./market/MarketGridToggle";
import {MarketSecondaryAction} from "./market/MarketSecondaryAction";
import {MarketTradeSummary} from "./market/MarketTradeSummary";
import "./market/market-player.css";
import { useMarketShort } from "./market/useMarketShort";
import { useMarketCheckout } from "./market/useMarketCheckout";
import { artPayNeed, artPickMax } from "./market/artPay";
import type { ArtChoice } from "./market/MarketArtPick";
import { numText } from "./market/num";
import { sortMarketItems } from "./market/marketSort";
import { useMarketMax } from "./market/useMarketMax";
import {useSellInventory} from './market/useSellInventory';
import {hasOwnedStock} from './market/sellInventory';
import {cityCartTotals} from './market/townQuote';

export function MarketAction({
  q,
  r,
  items: itemsRaw,
  shopRaces: shopRacesRaw,
  shopSpecs: shopSpecsRaw,
  heroFits,
  townStarving,
  onDone,
}: {
  q: number;
  r: number;
  /** Товары обеих витрин. Тоже необязательные — по той же причине, что фильтры. */
  items?: MarketItemView[] | null;
  /**
   * Расы, для которых работает магазин. Пусто — фильтра нет.
   *
   * Необязательные: ответ окна постройки лежит у игрока в суточном кэше, и
   * снимок, снятый до появления витринных фильтров, приходил без этих полей —
   * окно лавки падало на `shopRaces.length` («undefined is not an object»).
   */
  shopRaces?: string[] | null;
  /** Специализации, для которых работает магазин. Пусто — фильтра нет. */
  shopSpecs?: string[] | null;
  /** Проходит ли ВЫБРАННЫЙ герой фильтр витрины. */
  heroFits?: boolean;
  /** Лавка голодающего города: приём еды; на острове ещё продажа ресурсов портала (town-shop). */
  townStarving?: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const secondaryAction = useContext(MarketSecondaryAction);
  const lang = useLang(),en=lang==='en';
  const {columns,cycle}=useGridColumns();
  const [search,setSearch]=useState('');
  const [ownedOnly,setOwnedOnly]=useState(false);
  const items = useMemo(() => (Array.isArray(itemsRaw) ? itemsRaw : []), [itemsRaw]);
  const shopRaces = Array.isArray(shopRacesRaw) ? shopRacesRaw : [];
  const shopSpecs = Array.isArray(shopSpecsRaw) ? shopSpecsRaw : [];
  const [cart, setCart] = useState<Record<string, number>>({});
  // Какой именно артефакт игрок отдаёт по позиции «любой арт редкости X» — и в
  // скупке (там артефакт это товар), и в покупке (там он цена).
  // Отдельной картой, а не полем корзины: количество и выбор живут своей
  // жизнью — выбор переживает обнуление степпера, но не смену витрины.
  const [picks, setPicks] = useState<Record<string, ArtChoice>>({});
  // Старые снимки приходят без side — это покупка. Каждая витрина
  // упорядочивается СВОЯ: дешёвое в начале, дорогое вглубь (marketSort).
  const { buyItems, sellItems } = useMemo(
    () => ({
      buyItems: sortMarketItems(items.filter((it) => it.side !== "sell")),
      sellItems: sortMarketItems(items.filter((it) => it.side === "sell")),
    }),
    [items],
  );
  const [sideRaw, setSideRaw] = useState<MarketSide>(() =>
    buyItems.length === 0 && sellItems.length > 0 ? "sell" : "buy",
  );
  // Товары приезжают живьём (событие клетки): выбранная сторона могла опустеть
  // между рендерами — тогда показываем ту, где что-то есть, без «пусто».
  const side: MarketSide =
    sideRaw === "sell" && sellItems.length === 0 && buyItems.length > 0
      ? "buy"
      : sideRaw === "buy" && buyItems.length === 0 && sellItems.length > 0
        ? "sell"
        : sideRaw;
  usePurchaseMusic(side === "buy");
  const shown = side === "sell" ? sellItems : buyItems;
  const inventory = useSellInventory(sellItems, side === 'sell');
  const searched=shown.filter(it=>goodEntry(it,t,lang).label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const filtered=searched.filter(it=>side!=='sell'||!ownedOnly||hasOwnedStock(inventory.get(it)));
  const unknownStock=side==='sell'?searched.filter(it=>{const stock=inventory.get(it);return stock.loading||stock.retryable;}):[];
  const loadingStock=unknownStock.some(it=>inventory.get(it).loading);
  const retryStock=unknownStock.some(it=>inventory.get(it).retryable);
  // Обе стороны непусты — есть между чем переключаться.
  const bothSides = buyItems.length > 0 && sellItems.length > 0;
  const clearCart = () => {
    setCart({});
    setPicks({});
  };
  // Смена стороны сбрасывает корзину: «купить 2 молока» и «продать 2 молока» —
  // разные сделки, тащить общий счёт из одной в другую нельзя.
  const setSide = (s: MarketSide) => {
    clearCart();
    setSearch('');
    setOwnedOnly(false);
    setSideRaw(s);
  };

  const lines = shown.map((it) => ({ it, qty: cart[it.id] ?? 0 })).filter((l) => l.qty > 0);
  // Количества целые — складываются без дробных хвостов.
  const hiddenSelected=lines.filter(({it})=>!filtered.some(item=>item.id===it.id)).length;
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  // Позиция «любой арт редкости X» без выбранного артефакта — сделку не пускаем:
  // сервер иначе взял бы самый старый свободный, а это лотерея, а не сделка.
  // Проверяем ОБЕ витрины: в скупке такой артефакт — товар, в покупке — цена.
  // У скупки «Любой … герой» выбирают героя — кнопка так и подписана.
  const pickWhat = lines.map((l) => (picks[l.it.id] ? null : artPayNeed(l.it)?.what)).find(Boolean);
  const needPick = pickWhat != null;

  // Чего не хватает (marketShort): строки цены красным — на плитке и в
  // «Передашь», — и кнопка гаснет. Предметная цена сверяется с рюкзаком.
  const shortOf = useMarketShort();
  // Потолок кнопки «Макс» — на ОБЕИХ витринах: в скупке по товару на руках,
  // в покупке по деньгам под цену.
  const maxFor = useMarketMax(items);

  const costList = cartCost(lines);
  // Город: та же сумма по кривой, что в итоге, — плитка делит её на штуки (средняя «/шт»).
  const cityTotals = cityCartTotals(lines);
  // Неприехавший баланс — НЕ «не хватает»: отказать всё равно есть кому — серверу.
  const short = shortOf(costList);
  const enough = short.size === 0;

  const checkout = useMarketCheckout({ q, r, side, lines, picks, reset: clearCart, onDone });

  const starvingNote = townStarving ? (
    <div className="mb-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-[11px] font-bold text-destructive">{t(items.some((i) => i.side !== "sell") ? 'town.shop_starving_portal' : 'town.shop_starving')}</div>
  ) : null;
  if (items.length === 0) {
    return (
      <div className="raid-market"><div className="raid-market-content"><div className="raid-market-empty">{starvingNote ?? t("market.empty")}</div></div>{secondaryAction&&<div className="raid-market-cart is-empty" style={{gridTemplateRows:"auto"}}><div className="raid-market-actions"><div className="raid-market-secondary">{secondaryAction}</div></div></div>}</div>
    );
  }

  return (
    <div className="raid-market">
      {starvingNote}
      <TrainingSalePanel />
      <MarketShopBanner races={shopRaces} specs={shopSpecs} heroFits={heroFits} />

      {/* Тумблер витрин. Показываем, только когда есть обе: одну сторону
          переключать не с чем. */}
      <div className="raid-market-sticky">
      {bothSides && <div className="raid-market-sides"><MarketSideTabs side={side} onSide={setSide} /></div>}

      <div className="raid-market-find">
      <div className="raid-market-search"><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={en?'Search by name':'Поиск по названию'} aria-label={en?'Search goods by name':'Поиск товаров по названию'}/>{search&&<button type="button" aria-label={en?'Clear search':'Очистить поиск'} onClick={()=>setSearch('')}>×</button>}</div>
      {side==='sell'&&<label className="raid-market-owned-filter"><input type="checkbox" checked={ownedOnly} onChange={e=>setOwnedOnly(e.target.checked)}/>{en?'I own':'У меня есть'}</label>}
      <GridViewToggle columns={columns} onClick={cycle} en={en}/><button type="button" className="raid-market-close" aria-label={t('common.close')} onClick={onDone}><X size={16}/></button>
      </div>
      {side==='sell'&&unknownStock.length>0&&<div className="raid-market-stock-status" role="status">{loadingStock?(en?'Checking your items…':'Проверяем твои товары…'):(en?'Could not check all your items.':'Не удалось проверить все твои товары.')}{!loadingStock&&retryStock&&<button type="button" onClick={inventory.retry}>{en?'Retry':'Повторить'}</button>}</div>}
      {hiddenSelected>0&&<div className="raid-market-hidden-selected">{en?`Selected outside this list: ${hiddenSelected}`:`Выбрано вне списка: ${hiddenSelected}`} <button type="button" onClick={()=>{setSearch('');setOwnedOnly(false);}}>{en?'Show':'Показать'}</button></div>}
      </div>
      <div className="raid-market-content"><div className="raid-market-grid" data-columns={columns}>
        {filtered.map((it) => (
          <MarketItemCard
            key={it.id}
            it={it}
            owned={side==='sell'?inventory.get(it):undefined}
            qty={cart[it.id] ?? 0}
            cityTotal={cityTotals.get(it.id)}
            onQty={(n) => setCart((c) => ({ ...c, [it.id]: n }))}
            pick={picks[it.id] ?? null}
            maxAffordable={maxFor(it, picks[it.id]?.count ?? null)}
            buyCap={side === "buy" ? maxFor(it, picks[it.id]?.count ?? null, false) : null}
            short={side === "buy" ? shortOf(cartCost([{ it, qty: Math.max(1, cart[it.id] ?? 0) }])) : undefined}
            onPick={(a) => {
              setPicks((p) => ({ ...p, [it.id]: a }));
              // Свободных у нового шаблона может быть меньше, чем уже набрано —
              // подрезаем корзину, иначе сделка ушла бы заведомо невыполнимой.
              // Считаем в ЕДИНИЦАХ сделки: позиция берёт по несколько штук за
              // единицу, и три свободных при двух за штуку — это одна единица.
              setCart((c) => ({ ...c, [it.id]: Math.min(c[it.id] ?? 0, artPickMax(it, a.count)) }));
            }}
          />
        ))}
      </div>

      {!filtered.length&&!(ownedOnly&&unknownStock.length>0)&&<p className="raid-market-empty" role="status">{side==='sell'&&ownedOnly&&!search.trim()?(en?'No matching items found in your backpack':'В рюкзаке не найдены подходящие товары'):(en?'No matching goods':'Ничего не найдено')}</p>}</div>
      <div className={`raid-market-cart ${lines.length>=2?'is-multiple':''}`}>
        <MarketTradeSummary lines={lines} costs={costList} side={side} short={short}/>
        <div className="raid-market-actions" data-secondary={secondaryAction || totalUnits>0 ? "" : undefined}>
        {totalUnits>0 ? <div className="raid-market-secondary"><button type="button" className="raid-market-cancel flex w-full items-center justify-center disabled:opacity-50" disabled={checkout.isPending} title={en?'Clear selected items':'Сбросить выбранные товары'} onClick={clearCart}>{en?'Cancel':'Отмена'}</button></div> : secondaryAction && <div className="raid-market-secondary">{secondaryAction}</div>}
        <button
          type="button"
          onClick={() => checkout.mutate()}
          disabled={totalUnits === 0 || !enough || needPick || checkout.isPending}
          className="raid-market-checkout"
        >
          {checkout.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="h-4 w-4" />
          )}
          {totalUnits === 0
            ? t("market.cart_pick")
            : needPick
              ? t(pickWhat === "hero" ? "market.hero_pick" : "market.art_pick")
              : !enough
                ? t("market.not_enough")
                : t(side === "sell" ? "market.cart_sell" : "market.cart_buy", {
                    n: numText(totalUnits),
                  })}
        </button>
        </div>
      </div>
    </div>
  );
}




