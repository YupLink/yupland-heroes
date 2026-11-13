import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { StarsTopUp } from "@/components/account/StarsTopUp";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { useLang } from "@/lib/i18n";
import { goldForTicketPrice } from "@/lib/ticketGold";
import type { HouseContents, HouseProduct } from "./model";
import type { HouseMethod } from "./TradingHouseView";
import { maxHouseQuantity } from "./model";
import marketCutout from "./assets/market-pack-cutout-preview.webp";
import yupikCutout from "./assets/yupik-pack-cutout-preview.webp";

const formatted = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function TradingHouseSheet({ product, contents, gold, daraiBalance, daraiFromAccount = false, walletConnected, purchaseAllowed, accountPurchaseAllowed, catalogPending, maxDaraiQuantity, quantity, onQuantityChange, onClose, onPurchase, onReturnFromTopUp }: {
  product: HouseProduct;
  contents: HouseContents | null;
  gold: number | null;
  daraiBalance: number | null;
  daraiFromAccount?: boolean;
  walletConnected: boolean;
  purchaseAllowed: boolean;
  accountPurchaseAllowed: boolean;
  catalogPending: boolean;
  maxDaraiQuantity?: number;
  quantity: number;
  onQuantityChange: (value: number) => void;
  onClose: () => void;
  onPurchase: (product: HouseProduct, count: number, method: HouseMethod) => Promise<{ count: number; partial?: boolean }>;
  onReturnFromTopUp: () => void;
}) {
  const ru = useLang() === "ru";
  const t = (a: string, b: string) => ru ? a : b;
  // Звёзды — первыми (владелец, 07.10.2026): у пака с ценой в DARAI они считаются от неё по курсу.
  // Цена в билетах платится золотом ×500 (ПРАВИЛА §8.61); золото не докупается.
  const [method, setMethod] = useState<HouseMethod>(product.priceStars != null ? "stars" : product.priceTickets != null ? "gold" : "darai");
  const [topUp, setTopUp] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const starsBalance = useAccountBalances();
  const starsAvailable = starsBalance.isFetching || starsBalance.isError ? null : starsBalance.data?.balances.find(item => item.token.toUpperCase() === "STARS")?.balance ?? null;
  const max = Math.min(maxHouseQuantity(product, method), method === "darai" ? maxDaraiQuantity ?? 50 : 50);
  const selectedPrice = method === "gold" ? (product.priceTickets == null ? null : goldForTicketPrice(product.priceTickets)) : method === "stars" ? product.priceStars : product.priceDarai;
  const total = selectedPrice == null ? null : selectedPrice * quantity;
  const shortage = method === "gold" && gold != null && total != null ? Math.max(0, Math.ceil(total - gold)) : 0;
  const daraiShortage = method === "darai" && daraiFromAccount && total != null && daraiBalance != null && total > daraiBalance;
  const daraiUnknown = method === "darai" && daraiFromAccount && daraiBalance == null;
  const starsShortage = method === "stars" && total != null && starsAvailable != null ? Math.max(0, total - starsAvailable) : 0;
  const selectedPurchaseAllowed = method === "stars" ? accountPurchaseAllowed : purchaseAllowed;
  const cutout = product.art === "market" ? marketCutout : product.art === "yupik" ? yupikCutout : null;

  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    sheetRef.current?.focus();
    return () => { document.documentElement.style.overflow = overflow; if (prior?.isConnected) prior.focus(); };
  }, []);
  useEffect(() => { if (quantity > max && max > 0) onQuantityChange(max); }, [max, onQuantityChange, quantity]);

  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !pending) { event.preventDefault(); topUp ? setTopUp(false) : onClose(); }
    if (event.key !== "Tab") return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)")];
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const buy = async () => {
    if (shortage > 0) return;
    if (starsShortage > 0) { setTopUp(true); return; }
    if (!selectedPurchaseAllowed || catalogPending || max < quantity || total == null || pending || reviewRequired || daraiShortage || daraiUnknown || method === "stars" && starsAvailable == null) return;
    setPending(true);
    setError("");
    try { await onPurchase(product, quantity, method); onClose(); }
    catch (cause) {
      const reason = cause instanceof Error ? cause.message : t("Не удалось подтвердить покупку пака.", "Could not confirm the pack purchase.");
      setError(`${reason} ${t("Сначала проверь баланс и паки в Казарме.", "First check your balance and packs in the Barracks.")}`);
      setReviewRequired(true);
    }
    finally { setPending(false); }
  };
  const button = <button className={`trading-house__sheet-buy${walletConnected || product.priceStars != null ? "" : " trading-house__sheet-buy--inline"}`}
    disabled={pending || !reviewRequired && (catalogPending || max < 1 || total == null || method === "gold" && (gold == null || shortage > 0) || method === "stars" && starsAvailable == null || daraiShortage || daraiUnknown || !selectedPurchaseAllowed)}
    onClick={reviewRequired ? onClose : () => void buy()}>
    {reviewRequired ? t("Закрыть и проверить Казарму", "Close and check Barracks") : pending ? t("Покупаем…", "Buying…") : <>{t("Купить", "Buy")} · {method === "gold" ? <><ResourceGlyph kind="gold" /> {total == null ? "—" : formatted(total)}</> : <>{total == null ? "—" : formatted(total)} {method === "stars" ? "★" : "$DARAI"}</>}</>}
  </button>;

  return createPortal(<div className="trading-house__veil" onClick={event => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section ref={sheetRef} tabIndex={-1} className={`trading-house__sheet${walletConnected || product.priceStars != null ? "" : " trading-house__sheet--tickets-only"}${shortage > 0 ? " trading-house__sheet--shortfall" : ""}`}
      role="dialog" aria-modal="true" aria-labelledby="trading-house-product-title" onKeyDown={keyDown}>
      {!topUp && <div className="trading-house__sheet-hero-art" aria-hidden="true">{cutout ? <img src={cutout} alt="" /> : product.coverImageUrl ? <img src={product.coverImageUrl} alt="" /> : <span className={`trading-house__pack-art trading-house__pack-art--${product.art ?? "unknown"}`} />}</div>}
      <button className="trading-house__sheet-close" aria-label={t("Закрыть", "Close")} disabled={pending} onClick={onClose}><X size={20} /></button>
      <div className="trading-house__sheet-scroll">
        {topUp ? <div className="trading-house__stars-top-up"><h2 id="trading-house-product-title">{t("Пополнить Stars", "Top up Stars")}</h2><p>{t("Для покупки нужно", "This purchase needs")} {total == null ? "—" : formatted(total)} ★. {t("В Казне сейчас", "Treasury currently has")} {starsAvailable == null ? "—" : formatted(starsAvailable)} ★.</p><StarsTopUp neededAmount={starsShortage} /><button type="button" className="trading-house__sheet-buy" onClick={() => { onReturnFromTopUp(); setTopUp(false); }}>{t("Вернуться к покупке", "Return to purchase")}</button></div> : <>
        <div className="trading-house__sheet-header"><div className="trading-house__sheet-info"><h2 id="trading-house-product-title">{product.name}</h2>{product.totalSupply != null && <p>{t("Продано", "Sold")} {formatted(product.soldCount)} / {formatted(product.totalSupply)}</p>}</div></div>
        <details className="trading-house__contents">
          <summary>{t("Что внутри", "What's inside")}</summary>
          {contents ? <><p>{ru ? `В одном паке: ${contents.slots} фишек` : `${contents.slots} chips per pack`}</p>
            {contents.entries.map(entry => <p className="trading-house__odds-row" key={entry.key}><span>{entry.label}</span><strong>{formatted(entry.chance)} %</strong></p>)}
            {contents.guarantees.map((item, index) => <p key={index}>{ru ? `Гарантия: минимум ${item.slotsAtLeast} из ${contents.slots} — от ${item.minLevel}★` : `Guaranteed: at least ${item.slotsAtLeast} of ${contents.slots} at ${item.minLevel}★ or higher`}</p>)}
            <p className="trading-house__odds-note">{t("Шанс одной фишки до гарантий.", "Chance for one chip before guarantees.")}</p>
          </> : <p>{t("Состав и шансы не указаны.", "Contents and drop chances are not listed.")}</p>}
        </details>
        <div className="trading-house__sheet-controls">
          <div className="trading-house__quantity"><span>{t("Количество", "Quantity")}</span><div><button aria-label={t("Уменьшить количество", "Decrease quantity")} disabled={quantity <= 1 || pending} onClick={() => onQuantityChange(quantity - 1)}><span>−</span></button><strong>{quantity}</strong><button aria-label={t("Увеличить количество", "Increase quantity")} disabled={quantity >= max || pending} onClick={() => onQuantityChange(quantity + 1)}><span>+</span></button></div></div>
          {walletConnected || product.priceStars != null ? <div className="trading-house__payment" role="group" aria-label={t("Валюта покупки", "Purchase currency")}>
            <span className="trading-house__payment-balance" aria-live="polite">{method === "darai" && daraiBalance != null ? `${t("На счёте", "Balance")}: ${formatted(daraiBalance)} $DARAI` : method === "gold" && gold != null ? `${t("Золото", "Gold")}: ${formatted(Math.floor(gold))}` : method === "stars" && starsAvailable != null ? `${t("В Казне", "In Treasury")}: ${formatted(starsAvailable)} ★` : "\u00a0"}</span>
            <div className="trading-house__payment-options">{product.priceStars != null && <button type="button" aria-pressed={method === "stars"} disabled={pending} onClick={() => setMethod("stars")}>★ Stars</button>}{product.priceTickets != null && <button type="button" aria-pressed={method === "gold"} disabled={pending} onClick={() => setMethod("gold")}>{t("Золото", "Gold")}</button>}{walletConnected && product.priceDarai != null && <button type="button" aria-pressed={method === "darai"} disabled={pending} onClick={() => setMethod("darai")}>$DARAI</button>}</div>
          </div> : <div className="trading-house__buy-slot">{button}</div>}
        </div>
        {(walletConnected || product.priceStars != null) && button}
        {method === "gold" && shortage > 0 && <div className="trading-house__shortfall" role="status"><span>{ru ? `Не хватает ${formatted(shortage)} золота` : `Need ${formatted(shortage)} more gold`}</span></div>}
        {daraiShortage && <p className="trading-house__error" role="status">{t("Недостаточно $DARAI на счёте.", "Not enough $DARAI on the account.")}</p>}
        {daraiUnknown && <p className="trading-house__error" role={starsBalance.isError ? "alert" : "status"}>{starsBalance.isFetching ? t("Проверяем баланс $DARAI…", "Checking $DARAI balance…") : t("Не удалось проверить баланс $DARAI.", "Could not check the $DARAI balance.")}{starsBalance.isError && <> <button type="button" onClick={() => void starsBalance.refetch()}>{t("Повторить", "Retry")}</button></>}</p>}
        {method === "stars" && starsShortage > 0 && <p className="trading-house__error" role="status">{t("Не хватает", "Need")} {formatted(starsShortage)} ★. {t("Оплата откроет пополнение Казны.", "Payment will open Treasury top-up.")}</p>}
        {method === "stars" && starsBalance.isFetching && <p className="trading-house__error" role="status">{t("Проверяем баланс Stars…", "Checking Stars balance…")}</p>}
        {method === "stars" && starsBalance.isError && <p className="trading-house__error" role="alert">{t("Баланс Stars недоступен.", "Stars balance is unavailable.")} <button type="button" onClick={() => void starsBalance.refetch()}>{t("Повторить", "Retry")}</button></p>}
        {catalogPending && <p className="trading-house__error" role="status">{t("Проверяем актуальную цену…", "Checking the current price…")}</p>}
        {!selectedPurchaseAllowed && <p className="trading-house__error">{method === "stars" ? t("Оплата Stars со счёта Казны сейчас недоступна.", "Paying with Treasury Stars is unavailable right now.") : t("Подключи кошелёк для покупки пака.", "Connect a wallet to buy this pack.")}</p>}
        {error && <p role="alert" className="trading-house__error">{error}</p>}
        </>}
      </div>
    </section>
  </div>, document.body);
}
