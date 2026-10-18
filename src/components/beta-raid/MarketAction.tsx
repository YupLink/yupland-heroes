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
import { useMemo, useState } from "react";
import { starsForDarai } from "@/lib/starsForDarai";
import { Loader2, ShoppingCart } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { MarketItemView } from "@/lib/buildingEffect";
import type { MarketSide } from "@/lib/marketItem";
import { MarketItemCard } from "./market/MarketItemCard";
import { MarketSideTabs } from "./market/MarketSideTabs";
import { MarketShopBanner } from "./market/MarketShopBanner";
import { cartCost, costKey, type CostEntry } from "./market/cartCost";
import { MarketCartGive } from "./market/MarketCartGive";
import { usePlayerFunds } from "./market/usePlayerFunds";
import { useMarketCheckout } from "./market/useMarketCheckout";
import { artPayNeed, artPickMax } from "./market/artPay";
import type { ArtChoice } from "./market/MarketArtPick";
import { resPriceText } from "./market/priceLabel";
import { numText } from "./market/num";
import { sortMarketItems } from "./market/marketSort";
import { useMarketMax } from "./market/useMarketMax";
import { cityCartTotals } from "./market/townQuote";

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
  /** Лавка голодающего города: только приём еды (town-shop). */
  townStarving?: boolean;
  onDone: () => void;
}) {
  const t = useT();
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
  const shown = side === "sell" ? sellItems : buyItems;
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
    setSideRaw(s);
  };

  const lines = shown.map((it) => ({ it, qty: cart[it.id] ?? 0 })).filter((l) => l.qty > 0);
  // Количества целые — складываются без дробных хвостов.
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  // Позиция «любой арт редкости X» без выбранного артефакта — сделку не пускаем:
  // сервер иначе взял бы самый старый свободный, а это лотерея, а не сделка.
  // Проверяем ОБЕ витрины: в скупке такой артефакт — товар, в покупке — цена.
  const needPick = lines.some((l) => artPayNeed(l.it) != null && !picks[l.it.id]);

  // Чем игрок располагает — подсветить нехватку и не пустить пустую сделку.
  const have = usePlayerFunds();
  // Потолок кнопки «Макс» — на ОБЕИХ витринах: в скупке по товару на руках,
  // в покупке по деньгам под цену.
  const maxFor = useMarketMax(items);

  const costList = cartCost(lines);
  // Баланс, который ещё не приехал (null), — это НЕ «не хватает»: пока кэш
  // прогревается, витрина молчит, а отказать всё равно есть кому — серверу.
  const short = (c: CostEntry): boolean => {
    // DARAI звездочника, которой не хватает, списывается звёздами — их и сверяем.
    const stars = c.resource === "token" && c.token === "Darai" ? starsForDarai(c.need) : null;
    const n = stars != null ? have("token", "STARS") : have(c.resource, c.token);
    return n != null && n < (stars ?? c.need);
  };
  const enough = !costList.some(short);

  const checkout = useMarketCheckout({ q, r, side, lines, picks, reset: clearCart, onDone });

  // Продажа лавке города: сколько золота придёт по кривой ратуши за всю корзину.
  const cityTotals = cityCartTotals(lines);
  const cityGets = lines.reduce(
    (s, l) => s + (l.it.side === "sell" ? (cityTotals.get(l.it.id) ?? 0) : 0),
    0,
  );
  const starvingNote = townStarving ? (
    <div className="mb-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-[11px] font-bold text-destructive">
      {t("town.shop_starving")}
    </div>
  ) : null;

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-secondary/20 p-3 text-center text-[12px] text-muted-foreground">
        {starvingNote ?? t("market.empty")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-secondary/20 p-2.5">
      {starvingNote}
      <MarketShopBanner races={shopRaces} specs={shopSpecs} heroFits={heroFits} />

      {/* Тумблер витрин. Показываем, только когда есть обе: одну сторону
          переключать не с чем. */}
      {bothSides && <MarketSideTabs side={side} onSide={setSide} />}

      <div className="grid grid-cols-3 gap-2">
        {shown.map((it) => (
          <MarketItemCard
            key={it.id}
            it={it}
            qty={cart[it.id] ?? 0}
            onQty={(n) => setCart((c) => ({ ...c, [it.id]: n }))}
            pick={picks[it.id] ?? null}
            maxAffordable={maxFor(it, picks[it.id]?.count ?? null)}
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

      {/* Корзина: одна кнопка ПОД витриной проводит всё выбранное. Не липкая —
          раньше `sticky bottom-0` держал её поверх, и товары проезжали под
          полупрозрачной кнопкой: и криво, и мешало. Теперь она просто в конце
          списка, ничего под ней не скроллится. */}
      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
        {/* Что спишется. Не хватает — красным, кнопка блокируется. */}
        {side === "sell" && <MarketCartGive lines={lines} />}
        {side === "sell" && cityGets > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase text-muted-foreground">
              {t("market.will_get")}
            </span>
            <span className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-gold">
              {resPriceText(t, cityGets, "gold", null)}
            </span>
          </div>
        )}
        {costList.length > 0 && side !== "sell" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase text-muted-foreground">
              {t("market.will_spend")}
            </span>
            {costList.map((c) => (
              <span
                key={costKey(c.resource, c.token)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  short(c)
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-border bg-background/60 text-foreground"
                }`}
              >
                {resPriceText(t, c.need, c.resource, c.token, c.name)}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => checkout.mutate()}
          disabled={totalUnits === 0 || !enough || needPick || checkout.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {checkout.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="h-4 w-4" />
          )}
          {totalUnits === 0
            ? t("market.cart_pick")
            : needPick
              ? t("market.art_pick")
              : !enough
                ? t("market.not_enough")
                : t(side === "sell" ? "market.cart_sell" : "market.cart_buy", {
                    n: numText(totalUnits),
                  })}
        </button>
      </div>
    </div>
  );
}
