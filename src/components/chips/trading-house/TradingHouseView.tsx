import { useEffect, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { useLang } from "@/lib/i18n";
import { goldForTicketPrice } from "@/lib/ticketGold";
import { TradingHouseSheet } from "./TradingHouseSheet";
import { houseContents, type HouseProduct } from "./model";
import yupikArt from "./assets/trading-house-yupik-pack-png-optimized.webp";
import marketArt from "./assets/trading-house-market-pack-png-optimized.webp";
import magicalArt from "./assets/trading-house-magical-pack-png-optimized.webp";
import vikingArt from "./assets/trading-house-viking-pack-png-optimized.webp";
import "./trading-house.css";

import { thumb } from "@/lib/image";
export type FeaturedArtifact = { id: string; name: string; imageUrl: string; subtitle?: string };
type Status = "loading" | "error" | "ready";
type HouseNotice = { kind: "message"; text: string } | { kind: "purchase"; count: number; requested: number; partial: boolean };
const plaque = "M15 3 H185 Q197 3 197 15 V125 Q197 137 185 137 H15 Q3 137 3 125 V15 Q3 3 15 3 Z";
const formatted = (value: number) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
// Билетов нет (ПРАВИЛА §8.61): цена пака хранится в билетах, платится золотом ×500.
export type HouseMethod = "gold" | "darai" | "stars";
const goldPrice = (product: HouseProduct) => product.priceTickets == null ? null : goldForTicketPrice(product.priceTickets);

function Sparkles() {
  return <>{(["one", "two", "three", "four"] as const).map(key => <span key={key} className={`trading-house__featured-spark trading-house__featured-spark--${key}`} aria-hidden="true" />)}</>;
}
function PlaqueGlow() {
  return <svg className="trading-house__plaque-glow" viewBox="0 0 200 140" preserveAspectRatio="none" aria-hidden="true"><path className="trading-house__plaque-glow-edge" d={plaque} />{(["far", "middle", "near", "head"] as const).map(part => <path key={part} className={`trading-house__gold-glint trading-house__gold-glint--${part}`} d={plaque} pathLength={700} />)}</svg>;
}
function ProductArt({ product }: { product: HouseProduct }) {
  return product.coverImageUrl
    ? <img className="trading-house__pack-image" src={product.coverImageUrl} alt="" />
    : <span className={`trading-house__pack-art trading-house__pack-art--${product.art ?? "unknown"}`} aria-hidden="true" />;
}
const campArt = { yupik: yupikArt, market: marketArt, magical: magicalArt, viking: vikingArt };
function CampProductArt({ product }: { product: HouseProduct }) {
  const key = product.art ?? (/yupik/i.test(product.name) ? "yupik" : /market/i.test(product.name) ? "market" : /magical/i.test(product.name) ? "magical" : /viking/i.test(product.name) ? "viking" : null);
  return <img className={key ? `camp-pack-store__pack-art--${key}` : undefined} src={product.coverImageUrl || (key ? campArt[key] : yupikArt)} alt="" />;
}

export function TradingHouseView({ onClose, onOpenPacks, onOpenMarket, initialPage = "packs", onPageChange, products, catalogStatus, onRetryCatalog, gold, goldStatus = "ready", onRetryGold, daraiBalance, daraiFromAccount = false, walletConnected, purchaseAllowed, accountPurchaseAllowed, maxDaraiQuantity, collectionNames, artifacts = [], onPurchase, onBuyGold, presentation = "house" }: {
  onClose: () => void;
  onOpenPacks: () => void;
  onOpenMarket?: () => void;
  initialPage?: "packs" | "artifacts";
  onPageChange?: (page: "packs" | "artifacts") => void;
  products: HouseProduct[];
  catalogStatus: Status;
  onRetryCatalog: () => void;
  gold: number | null;
  goldStatus?: Status;
  onRetryGold?: () => void;
  daraiBalance: number | null;
  daraiFromAccount?: boolean;
  walletConnected: boolean;
  purchaseAllowed: boolean;
  accountPurchaseAllowed: boolean;
  maxDaraiQuantity?: number;
  collectionNames: Map<string, string>;
  artifacts?: FeaturedArtifact[];
  onPurchase: (product: HouseProduct, count: number, method: HouseMethod) => Promise<{ count: number; partial?: boolean }>;
  /** «+» у баланса золота — окно покупки золота (§8.66), на месте прежнего «+» билетов. */
  onBuyGold?: () => void;
  presentation?: "house" | "camp";
}) {
  const ru = useLang() === "ru";
  const t = (a: string, b: string) => ru ? a : b;
  const [page, setPage] = useState<"packs" | "artifacts">(initialPage);
  const [selected, setSelected] = useState<HouseProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<HouseNotice | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const shelfRef = useRef<HTMLDivElement>(null);
  const purchasePending = useRef(false);
  const featured = products[0];
  const featuredArtifact = artifacts[0];
  const featuredName = featured?.name.replace(/\s*\(Premium\)\s*$/i, "");
  const catalog = featured ? [...products.slice(1), featured] : [];
  const campFeatured = products.find(product => product.art === "yupik" || /yupik/i.test(product.name)) ?? featured;
  const campCatalog = products.filter(product => product.id !== campFeatured?.id);
  const openProduct = (product: HouseProduct) => { purchasePending.current = false; setQuantity(1); setSelected(product); setNotice(null); };
  useEffect(() => {
    if (!selected || catalogStatus === "loading" || purchasePending.current) return;
    if (catalogStatus === "error") {
      setSelected(null);
      setNotice({ kind: "message", text: t("Не удалось проверить предложение. Повтори загрузку каталога.", "Could not verify this offer. Reload the catalog.") });
      return;
    }
    const current = products.find(product => product.id === selected.id);
    if (current && current.priceTickets === selected.priceTickets && current.priceDarai === selected.priceDarai && current.priceStars === selected.priceStars && current.soldCount === selected.soldCount && current.dailyUsedToday === selected.dailyUsedToday && current.startsAt === selected.startsAt && current.endsAt === selected.endsAt) return;
    setSelected(null);
    setNotice({ kind: "message", text: t("Предложение изменилось. Открой пак заново.", "This offer changed. Open the pack again.") });
  }, [catalogStatus, products, selected]);

  useEffect(() => {
    if (page !== "packs") return;
    const shelf = shelfRef.current;
    if (!shelf) return;
    const update = () => { setCanScroll(shelf.scrollLeft + shelf.clientWidth < shelf.scrollWidth - 2); setCanScrollBack(shelf.scrollLeft > 2); };
    const resize = new ResizeObserver(update);
    resize.observe(shelf);
    shelf.addEventListener("scroll", update);
    update();
    return () => { resize.disconnect(); shelf.removeEventListener("scroll", update); };
  }, [page, products, catalogStatus, presentation]);

  const buy = async (product: HouseProduct, count: number, method: HouseMethod) => {
    purchasePending.current = true;
    const result = await onPurchase(product, count, method);
    setNotice({ kind: "purchase", count: result.count, requested: count, partial: Boolean(result.partial) });
    return result;
  };

  if (presentation === "camp") return <main className="camp-pack-store" aria-label={t("Купить паки", "Buy packs")}>
    <div className="camp-pack-store__balance"><span>{t("Твоё золото", "Your gold")}</span><strong><ResourceGlyph kind="gold" /> {gold == null ? "…" : formatted(Math.floor(gold))}{onBuyGold && <button type="button" data-gold-topup aria-label={t("Купить золото", "Buy gold")} onClick={onBuyGold}><Plus size={18} aria-hidden="true" /></button>}</strong></div>
    {goldStatus === "error" && <div className="camp-pack-store__status" role="alert">{t("Баланс недоступен", "Balance unavailable")} <button onClick={onRetryGold}>{t("Повторить", "Retry")}</button></div>}
    {notice && <div className="camp-pack-store__notice" role={notice.kind === "purchase" && !notice.partial ? "status" : "alert"}>{notice.kind === "message" ? notice.text : <button onClick={onOpenPacks}>{notice.partial ? t(`Подтверждено ${notice.count} из ${notice.requested}. Проверь Мои паки и историю операции.`, `${notice.count} of ${notice.requested} confirmed. Check My packs and transaction history.`) : t("Пак куплен. Открыть Мои паки", "Pack bought. Open My packs")}</button>}</div>}
    {catalogStatus !== "ready" ? <div className="camp-pack-store__empty" role={catalogStatus === "error" ? "alert" : "status"}>{catalogStatus === "error" ? t("Не удалось загрузить паки", "Could not load packs") : t("Загружаем паки…", "Loading packs…")}{catalogStatus === "error" && <button onClick={onRetryCatalog}>{t("Повторить", "Retry")}</button>}</div> : !campFeatured ? <div className="camp-pack-store__empty">{t("Пока нет паков в продаже", "No packs for sale yet")}</div> : <>
      <button className="camp-pack-store__hero" type="button" onClick={() => openProduct(campFeatured)} aria-label={t(`Открыть ${campFeatured.name}`, `Open ${campFeatured.name}`)}><CampProductArt product={campFeatured} /><Sparkles /></button>
      <div className="camp-pack-store__offer"><PlaqueGlow /><strong>{campFeatured.name.replace(/\s*\(Premium\)$/i, "")}</strong>{campFeatured.kind === "premium" && <small>Premium</small>}<button type="button" onClick={() => openProduct(campFeatured)}>{campFeatured.priceStars != null ? <>{t("Купить", "Buy")} {formatted(campFeatured.priceStars)} ★</> : goldPrice(campFeatured) == null ? t("Подробнее", "Details") : <>{t("Купить", "Buy")} <ResourceGlyph kind="gold" /> {formatted(goldPrice(campFeatured) ?? 0)}</>}</button></div>
      <div ref={shelfRef} className="camp-pack-store__shelf" aria-label={t("Другие паки", "Other packs")}>{campCatalog.map(product => <button key={product.id} className="camp-pack-store__item" type="button" onClick={() => openProduct(product)} aria-label={t(`Открыть ${product.name}`, `Open ${product.name}`)}><CampProductArt product={product} /><span>{product.name}</span></button>)}</div>
      {canScrollBack && <button className="camp-pack-store__shelf-arrow camp-pack-store__shelf-arrow--back" type="button" aria-label={t("Предыдущие паки", "Previous packs")} onClick={() => shelfRef.current?.scrollBy({ left: -shelfRef.current.clientWidth / 3, behavior: "smooth" })}><ChevronRight size={22} aria-hidden="true" /></button>}
      {canScroll && <button className="camp-pack-store__shelf-arrow camp-pack-store__shelf-arrow--next" type="button" aria-label={t("Следующие паки", "Next packs")} onClick={() => shelfRef.current?.scrollBy({ left: shelfRef.current.clientWidth / 3, behavior: "smooth" })}><ChevronRight size={22} aria-hidden="true" /></button>}
    </>}
    {selected && <TradingHouseSheet key={selected.id} product={selected} contents={houseContents(selected, collectionNames)} gold={gold} daraiBalance={daraiBalance} daraiFromAccount={daraiFromAccount} walletConnected={walletConnected} purchaseAllowed={purchaseAllowed} accountPurchaseAllowed={accountPurchaseAllowed} catalogPending={catalogStatus !== "ready"} maxDaraiQuantity={maxDaraiQuantity} quantity={quantity} onQuantityChange={setQuantity} onClose={() => { purchasePending.current = false; setSelected(null); }} onPurchase={buy} onReturnFromTopUp={onRetryCatalog} />}
  </main>;

  return <main className="trading-house" aria-label={t("Торговый дом", "Trading House")}>
    <button className="trading-house__back" onClick={onClose}>{t("← Замок", "← Castle")}</button>
    <h1 id="castle-window-title" className="trading-house__title">{t("Торговый дом", "Trading House")}</h1>
    <div className="trading-house__balance"><span>{t("Твоё золото", "Your gold")}</span><strong><ResourceGlyph kind="gold" /> {gold == null ? "…" : formatted(Math.floor(gold))}{onBuyGold && <button className="trading-house__balance-add" type="button" data-gold-topup aria-label={t("Купить золото", "Buy gold")} onClick={onBuyGold}><Plus size={14} strokeWidth={2.5} aria-hidden="true" /></button>}</strong></div>
    {goldStatus === "error" && <p className="trading-house__notice" role="alert">{t("Баланс золота недоступен.", "Gold balance unavailable.")} <button type="button" onClick={onRetryGold}>{t("Повторить", "Retry")}</button></p>}
    <nav className="trading-house__tabs" aria-label={t("Разделы торгового дома", "Trading House sections")}>
      <button aria-pressed={page === "packs"} onClick={() => { setPage("packs"); onPageChange?.("packs"); }}>{t("Паки фишек", "Chip packs")}</button>
      <button aria-pressed={page === "artifacts"} onClick={() => { setPage("artifacts"); onPageChange?.("artifacts"); }}>{t("Артефакты", "Artifacts")}</button>
    </nav>
    {onOpenMarket && <button className="trading-house__market-door" type="button" onClick={onOpenMarket} aria-label={t("Войти в Рынок", "Enter Market")} />}
    {notice && (notice.kind === "purchase" ? <div className="trading-house__notice trading-house__notice--purchase" role={notice.partial ? "alert" : "status"}>
      <button type="button" className="trading-house__notice-action" onClick={onOpenPacks}>
        {notice.partial
          ? t(`Подтверждено ${notice.count} из ${notice.requested} паков. Проверь `, `Confirmed ${notice.count} of ${notice.requested} packs. Check `)
          : notice.count === 1 ? t("Пак куплен. Открой в ", "Pack bought. Open it in the ") : t(`Куплено паков: ${notice.count}. Открой в `, `${notice.count} packs bought. Open them in the `)}
        <strong>{notice.partial ? t("Казарму", "Barracks") : t("Казарме", "Barracks")}</strong>
        {notice.partial ? t(" и историю операции перед повтором.", " and transaction history before retrying.") : "."}
      </button>
    </div> : <p className="trading-house__notice" role="alert">{notice.text}</p>)}
    {page === "packs" && catalogStatus === "loading" && <div className="trading-house__featured-offer trading-house__featured-offer--empty" role="status"><strong>{t("Загружаем паки…", "Loading packs…")}</strong></div>}
    {page === "packs" && catalogStatus === "error" && <div className="trading-house__featured-offer trading-house__featured-offer--empty" role="alert"><strong>{t("Не удалось загрузить паки", "Could not load packs")}</strong><button onClick={onRetryCatalog}>{t("Повторить", "Retry")}</button></div>}
    {page === "packs" && catalogStatus === "ready" && !featured && <div className="trading-house__featured-offer trading-house__featured-offer--empty"><strong>{t("Паки фишек", "Chip packs")}</strong><small>{t("Пока нет в продаже", "None for sale yet")}</small></div>}
    {page === "packs" && catalogStatus === "ready" && featured && <>
      <button className={`trading-house__featured-art${selected?.id === featured.id ? " trading-house__featured-art--selected" : ""}`} aria-label={t(`Открыть ${featuredName}`, `Open ${featuredName}`)} onClick={() => openProduct(featured)}><ProductArt product={featured} /><Sparkles /></button>
      <div className="trading-house__featured-offer"><PlaqueGlow /><strong>{featuredName}</strong>{featured.kind === "premium" && <small>Premium</small>}<button onClick={() => openProduct(featured)}>{featured.priceStars != null ? <>{t("Купить", "Buy")} {formatted(featured.priceStars)} ★</> : goldPrice(featured) == null ? t("Подробнее", "Details") : <>{t("Купить", "Buy")} <ResourceGlyph kind="gold" /> {formatted(goldPrice(featured) ?? 0)}</>}</button></div>
      <div ref={shelfRef} className="trading-house__shelf" aria-label={t("Паки фишек", "Chip packs")}>
        {catalog.map(product => <button key={product.id} className={`trading-house__item${selected?.id === product.id ? " trading-house__item--selected" : ""}`} aria-label={t(`Открыть ${product.name}`, `Open ${product.name}`)} onClick={() => openProduct(product)}><ProductArt product={product} /><span>{product.name.includes(" (Premium)") ? <>{product.name.replace(" (Premium)", "")}<br />(Premium)</> : product.name}</span></button>)}
      </div>
      {canScroll && <button className="trading-house__next" aria-label={t("Следующие паки", "Next packs")} onClick={() => shelfRef.current?.scrollBy({ left: shelfRef.current.clientWidth * .68, behavior: "smooth" })}><ChevronRight size={23} /></button>}
    </>}
    {page === "artifacts" && (featuredArtifact ? <><div className="trading-house__featured-art trading-house__featured-art--artifact"><img src={thumb(featuredArtifact.imageUrl, 400)} alt={featuredArtifact.name} /><Sparkles /></div><div className="trading-house__featured-offer trading-house__featured-offer--artifact"><PlaqueGlow /><strong>{featuredArtifact.name}</strong>{featuredArtifact.subtitle && <small>{featuredArtifact.subtitle}</small>}</div></> : <div className="trading-house__featured-offer trading-house__featured-offer--empty"><strong>{t("Артефакты", "Artifacts")}</strong><small>{t("Пока нет в продаже", "None for sale yet")}</small></div>)}
    {selected && <TradingHouseSheet key={selected.id} product={selected} contents={houseContents(selected, collectionNames)} gold={gold} daraiBalance={daraiBalance} daraiFromAccount={daraiFromAccount} walletConnected={walletConnected} purchaseAllowed={purchaseAllowed} accountPurchaseAllowed={accountPurchaseAllowed} catalogPending={catalogStatus !== "ready"} maxDaraiQuantity={maxDaraiQuantity} quantity={quantity} onQuantityChange={setQuantity} onClose={() => { purchasePending.current = false; setSelected(null); }} onPurchase={buy} onReturnFromTopUp={onRetryCatalog} />}
  </main>;
}
