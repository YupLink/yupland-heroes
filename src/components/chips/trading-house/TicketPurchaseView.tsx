import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Wallet, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { TreasuryWalletConnection } from "@/components/castle-live/TreasuryWalletConnection";
import { StarsTopUp } from "@/components/account/StarsTopUp";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { useLang } from "@/lib/i18n";
import "./ticket-approved.css";
import { ticketDiscountPercent } from "./ticketDiscounts";
import ticketStackOne from "./assets/ticket-stack-one.webp";
import ticketStackTwo from "./assets/ticket-stack-two.webp";
import ticketStackThree from "./assets/ticket-stack-three.webp";
import ticketStackPile from "./assets/ticket-stack-pile.webp";

export type TicketMethod = {
  key: string;
  offerId: string;
  kind: "energy" | "token" | "stars";
  label: string;
  price: number;
  basePrice?: number | null;
  discountPct?: number;
  unit: string;
  discount?: string;
  ftContract?: string | null;
  decimals?: number | null;
  /** Тариф в $: валюта счёта, цена посчитана от $ по курсу (lib/usdTariff.ts). */
  usdToken?: "USDT" | "Darai" | "STARS";
};
export type TicketOffer = { tickets: number; methods: TicketMethod[] };

export function TicketPurchaseView({ open, offers, status, onRetry, walletConnected, linkedEnergy, energyBalance, energyStatus = "ready", onRetryEnergy, recovery, walletConnection, onClose, returnFocus, onPay }: {
  open: boolean;
  offers: TicketOffer[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
  walletConnected: boolean;
  linkedEnergy: boolean;
  energyBalance: number | null;
  energyStatus?: "loading" | "error" | "ready";
  onRetryEnergy?: () => void;
  recovery?: ReactNode;
  walletConnection?: ReactNode;
  onClose: () => void;
  returnFocus: () => void;
  onPay: (method: TicketMethod, quantity: number, totalPrice: number) => Promise<number>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const catalogScroll = useRef(0);
  const ru = useLang() === "ru";
  const t = (a: string, b: string) => ru ? a : b;
  const ticketLabel = (count: number) => ru
    ? `${count} ${count % 100 >= 11 && count % 100 <= 14 ? "билетов" : count % 10 === 1 ? "билет" : count % 10 >= 2 && count % 10 <= 4 ? "билета" : "билетов"}`
    : `${count} ${count === 1 ? "ticket" : "tickets"}`;
  const ticketArt = (count: number) => count >= 100 ? ticketStackPile : count >= 21 ? ticketStackThree : count === 2 || count === 10 ? ticketStackTwo : ticketStackOne;
  const [stage, setStage] = useState<"catalog" | "methods" | "confirm" | "top-up" | "done" | "profile">("catalog");
  const [origin, setOrigin] = useState<"catalog" | "methods">("catalog");
  const [offer, setOffer] = useState<TicketOffer | null>(null);
  const [method, setMethod] = useState<TicketMethod | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(0);
  const [reviewRequired, setReviewRequired] = useState(false);
  const starsBalance = useAccountBalances();
  const starsAvailable = starsBalance.isFetching || starsBalance.isError ? null : starsBalance.data?.balances.find(item => item.token.toUpperCase() === "STARS")?.balance ?? null;
  const totalFor = (choice: TicketMethod, count: number) => choice.usdToken === "USDT" ? Math.round(choice.price * count * 100) / 100 : choice.usdToken || choice.kind === "stars" ? choice.price * count : choice.basePrice != null && choice.discountPct != null ? Math.max(1, Math.ceil(choice.basePrice * count * (100 - choice.discountPct) / 100)) : choice.price * count;
  const totalPrice = method ? totalFor(method, quantity) : 0;
  const starsShortage = method?.kind === "stars" && starsAvailable != null ? Math.max(0, totalPrice - starsAvailable) : null;
  useEffect(() => { if (open) { catalogScroll.current = 0; setStage("catalog"); setOffer(null); setMethod(null); setQuantity(1); setError(""); setAdded(0); setReviewRequired(false); setOrigin("catalog"); } }, [open]);
  useEffect(() => { if (walletConnected && stage === "profile") setStage(offer ? "methods" : "catalog"); }, [walletConnected, stage, offer]);
  useEffect(() => {
    if (!offer || status === "loading" || pending || reviewRequired || (stage !== "methods" && stage !== "confirm")) return;
    const current = status === "ready" ? offers.find(item => item.tickets === offer.tickets) : null;
    if (current && JSON.stringify(current) === JSON.stringify(offer)) return;
    setOffer(null);
    setMethod(null);
    setStage("catalog");
    setError(ru ? "Предложение изменилось. Выбери его заново." : "This offer changed. Select it again.");
  }, [offers, offer, pending, reviewRequired, ru, stage, status]);
  useEffect(() => { if (stage === "catalog" && dialogRef.current) dialogRef.current.scrollTop = catalogScroll.current; }, [stage]);
  const back = () => { setError(""); setStage(stage === "top-up" ? "confirm" : stage === "profile" ? offer ? "methods" : "catalog" : stage === "confirm" ? origin : "catalog"); };
  const methodDisabled = (item: TicketMethod) => item.kind === "energy" && (energyStatus !== "ready" || !linkedEnergy || energyBalance == null || energyBalance < totalFor(item, quantity));
  const pay = async () => {
    if (!method || !offer || pending || reviewRequired || status !== "ready" || methodDisabled(method)) return;
    if (method.kind === "stars") {
      if (starsAvailable == null || starsBalance.isError) return;
      if (starsAvailable < totalPrice) { setStage("top-up"); return; }
    }
    setPending(true); setError("");
    try {
      const received = await onPay(method, quantity, totalPrice);
      if (!Number.isFinite(received) || received !== offer.tickets * quantity) {
        throw new Error(t("Зачисление билетов не совпало с предложением. Проверь баланс и историю операции перед повтором.", "Ticket credit does not match the offer. Check your balance and transaction history before retrying."));
      }
      setAdded(received); setStage("done");
    }
    catch (cause) {
      const reason = cause instanceof Error ? cause.message : t("Не удалось подтвердить покупку.", "Could not confirm purchase.");
      setError(`${reason} ${t("Сначала проверь баланс и историю операции.", "First check your balance and transaction history.")}`);
      setReviewRequired(true);
    }
    finally { setPending(false); }
  };
  const price = (item: TicketMethod) => `${item.price.toLocaleString(ru ? "ru-RU" : "en-US")} ${item.kind === "energy" ? t("Энергия Yupland", "Yupland energy") : item.unit}`;

  const methodName = (choice: TicketMethod) => choice.kind === "energy" ? t("Энергия Yupland", "Yupland energy") : choice.kind === "stars" ? "Stars" : choice.usdToken ?? choice.unit;
  const methodChoices = offer ? [...offer.methods].sort((a, b) => Number(b.kind === "stars") - Number(a.kind === "stars")).map(choice => {
    const percent = ticketDiscountPercent(offers, offer.tickets, choice);
    return { ...choice, discount: percent == null ? undefined : `−${percent}%` };
  }) : [];
  const renderCard = (item: TicketOffer) => {
    const stars = item.methods.find(choice => choice.kind === "stars");
    const alternatives = item.methods.filter(choice => choice.kind !== "stars").sort((a, b) => Number(a.kind === "energy") - Number(b.kind === "energy")).map(choice => {
      const percent = ticketDiscountPercent(offers, item.tickets, choice);
      return { ...choice, discount: percent == null ? undefined : `−${percent}%` };
    });
    const select = (choice: TicketMethod) => { catalogScroll.current = dialogRef.current?.scrollTop ?? 0; setError(""); setQuantity(1); setOffer(item); setOrigin("catalog"); setMethod(choice); setStage("confirm"); };
    return <article key={item.tickets} className={`castle-ticket-dialog__ticket-catalog-card${item.tickets === 5 && stars && alternatives.length === 1 ? " castle-ticket-dialog__ticket-catalog-card--first" : ""}`}>
      <div className="castle-ticket-dialog__ticket-catalog-top">
        <span className={`castle-ticket-dialog__ticket-bundle${item.tickets >= 100 ? " castle-ticket-dialog__ticket-bundle--pile" : ""}`} aria-hidden="true"><img src={ticketArt(item.tickets)} alt="" /></span>
        <strong>+{ticketLabel(item.tickets)}</strong>
        {stars && <button type="button" className="castle-ticket-dialog__ticket-stars-button" aria-label={`${t("Купить", "Buy")} ${ticketLabel(item.tickets)} ${t("за", "for")} ${price(stars)}`} onClick={() => select(stars)}><b>{stars.price.toLocaleString(ru ? "ru-RU" : "en-US")} ★</b><ArrowRight aria-hidden="true" /></button>}
      </div>
      {alternatives.length > 0 && <div className={`castle-ticket-dialog__ticket-catalog-alternatives${alternatives.length === 1 ? " castle-ticket-dialog__ticket-catalog-alternatives--single" : alternatives.length > 2 ? " castle-ticket-dialog__ticket-catalog-alternatives--overflow" : ""}`}>
        {alternatives.slice(0, 2).map(choice => <button key={choice.key} type="button" className="castle-ticket-dialog__ticket-alternative-button" aria-label={`${t("Купить", "Buy")} ${ticketLabel(item.tickets)} ${t("за", "for")} ${price(choice)}`} onClick={() => select(choice)}>
          <span className="castle-ticket-dialog__ticket-alternative-main"><b>{choice.price.toLocaleString(ru ? "ru-RU" : "en-US")}</b><small>{methodName(choice)}</small></span>
          {choice.discount && <em title={t("Скидка за билет относительно базового пакета в этой валюте", "Per-ticket saving compared with the base bundle in this currency")}>{choice.discount}</em>}<ArrowRight aria-hidden="true" />
        </button>)}
        {alternatives.length > 2 && <button type="button" className="castle-ticket-dialog__more-methods" aria-label={t(`Все варианты оплаты ${ticketLabel(item.tickets)}`, `All payment options for ${ticketLabel(item.tickets)}`)} onClick={() => { catalogScroll.current = dialogRef.current?.scrollTop ?? 0; setError(""); setOffer(item); setMethod(null); setStage("methods"); }}>+{alternatives.length - 2}</button>}
      </div>}
    </article>;
  };
  const sortedOffers = [...offers].sort((a, b) => a.tickets - b.tickets);
  const primaryOffers = sortedOffers.filter(item => item.methods.some(choice => choice.kind === "stars"));
  const otherOffers = sortedOffers.filter(item => !item.methods.some(choice => choice.kind === "stars"));

  return <Dialog open={open} onOpenChange={value => { if (!value && !pending) onClose(); }}>
    <DialogContent ref={dialogRef} tabIndex={-1} onOpenAutoFocus={event => { event.preventDefault(); dialogRef.current?.focus(); }} className={`castle-ticket-dialog castle-ticket-dialog--bundle-study${stage === "catalog" ? " castle-ticket-dialog--ticket-catalog" : ""}${stage === "methods" ? " castle-ticket-dialog--ticket-methods" : ""}${["methods", "confirm", "done"].includes(stage) ? " castle-ticket-dialog--energy-flow" : ""}${stage === "confirm" ? " castle-ticket-dialog--purchase-confirm" : ""}`} closeLabel={t("Закрыть", "Close")}
      onCloseAutoFocus={event => { event.preventDefault(); returnFocus(); }}>
      <header className="castle-ticket-dialog__header">
        {stage !== "catalog" && stage !== "done" && !reviewRequired && <button type="button" className="castle-ticket-dialog__back" aria-label={t("Назад", "Back")} disabled={pending} onClick={back}><ArrowLeft aria-hidden="true" /></button>}
        <ResourceGlyph kind="tickets" />
        <DialogTitle>{stage === "done" ? t("Покупка завершена", "Purchase complete") : stage === "confirm" ? t("Подтверждение", "Confirmation") : t("Купить билеты", "Buy tickets")}</DialogTitle>
        <button type="button" className="castle-ticket-dialog__close" aria-label={t("Закрыть", "Close")} disabled={pending} onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <DialogDescription className={stage === "catalog" || stage === "confirm" || stage === "done" ? "sr-only" : "castle-ticket-dialog__description"}>
        {stage === "catalog" ? t("Предложения для покупки", "Purchase offers") : stage === "methods" ? `+${ticketLabel(offer?.tickets ?? 0)} · ${t("Выбери способ оплаты.", "Choose a payment method.")}` : stage === "confirm" ? t("Проверь покупку перед подтверждением.", "Review your purchase.") : stage === "top-up" ? t("Пополнить счёт Казны и вернуться к покупке.", "Add Stars to Treasury and return to purchase.") : stage === "profile" ? t("Подключи кошелёк для дополнительных способов оплаты.", "Connect a wallet for more payment methods.") : t("Покупка завершена.", "Purchase complete.")}
      </DialogDescription>
      <div className={`castle-ticket-dialog__content${!walletConnected && stage === "catalog" ? " castle-ticket-dialog__content--wallet-disconnected" : ""}`}>
        {stage === "catalog" && <>
          {error && <p className="castle-ticket-dialog__error" role="alert">{error}</p>}
          {recovery}
          {walletConnected && energyStatus === "error" && <p className="castle-ticket-dialog__error" role="alert">{t("Не удалось проверить связь с Yupland. Цены за его энергию скрыты.", "Could not check the Yupland connection. Its energy prices are hidden.")} <button type="button" onClick={onRetryEnergy}>{t("Повторить", "Retry")}</button></p>}
          {status === "loading" && <p className="castle-ticket-dialog__status" role="status">{t("Загружаем предложения…", "Loading offers…")}</p>}
          {status === "error" && <div className="castle-ticket-dialog__status" role="alert">{t("Не удалось загрузить предложения.", "Could not load offers.")}<button type="button" onClick={onRetry}>{t("Повторить", "Retry")}</button></div>}
          {status === "ready" && offers.length === 0 && <p className="castle-ticket-dialog__empty">{t("Сейчас нет доступных предложений.", "No offers are available right now.")}</p>}
          {status === "ready" && offers.length > 0 && <>
            <div className="castle-ticket-dialog__ticket-feature"><div className="castle-ticket-dialog__ticket-feature-copy"><h3>{t("Больше возможностей", "More possibilities")} <span>{t("в игре", "in the game")}</span></h3><p>{t("Покупай билеты", "Buy tickets")} <span>{t("и открывай новый контент", "and unlock new content")}</span></p></div></div>
            <section className="castle-ticket-dialog__one-time"><div className="castle-ticket-dialog__offers">{primaryOffers.map(renderCard)}</div>
              {otherOffers.length > 0 && <><h3 className="castle-ticket-dialog__ticket-other-title">{t("Другие пакеты", "Other bundles")}</h3><div className="castle-ticket-dialog__ticket-other-grid">{otherOffers.map(renderCard)}</div></>}
            </section>
          </>}
          {!walletConnected && <button type="button" className="castle-ticket-dialog__more-payments" onClick={() => setStage("profile")}>{t("Увидеть больше вариантов оплаты", "See more payment options")}<ArrowRight aria-hidden="true" /></button>}
        </>}
        {stage === "methods" && offer && <>
          {energyStatus === "error" && <p className="castle-ticket-dialog__error" role="alert">{t("Не удалось проверить энергию.", "Could not check energy.")} <button type="button" onClick={onRetryEnergy}>{t("Повторить", "Retry")}</button></p>}
          <div className="castle-ticket-dialog__methods">{methodChoices.map(choice => <button type="button" key={choice.key} className={`castle-ticket-dialog__method${choice.kind === "energy" ? " castle-ticket-dialog__method--no-glyph" : ""}`} disabled={methodDisabled(choice)} onClick={() => { setOrigin("methods"); setMethod(choice); setStage("confirm"); }}>{choice.kind !== "energy" && <span className="castle-ticket-dialog__payment-glyph" aria-hidden="true">{choice.kind === "stars" ? "★" : <Wallet />}</span>}<span><strong>{methodName(choice)}</strong>{choice.discount && <small>{choice.discount}</small>}{choice.kind === "energy" && !linkedEnergy && <small>{t("Нужна связь с Yupland", "Connect Yupland first")}</small>}{choice.kind === "energy" && linkedEnergy && energyBalance != null && energyBalance < totalFor(choice, quantity) && <small>{t("Не хватает энергии", "Not enough energy")}</small>}</span><b>{totalFor(choice, quantity).toLocaleString(ru ? "ru-RU" : "en-US")}</b><ArrowRight aria-hidden="true" /></button>)}</div>
          {!walletConnected && <div className="castle-ticket-dialog__connect"><p>{t("Подключи кошелёк, чтобы увидеть дополнительные способы оплаты.", "Connect a wallet to see more payment options.")}</p><button type="button" onClick={() => setStage("profile")}>{t("Подключить кошелёк →", "Connect wallet →")}</button></div>}
        </>}
        {stage === "profile" && (walletConnection ?? <TreasuryWalletConnection wallet={null} status="disconnected" />)}
        {stage === "confirm" && offer && method && <><div className="castle-ticket-dialog__confirm-hero"><div className="castle-ticket-dialog__confirm-art" aria-hidden="true"><ResourceGlyph kind="tickets" /></div><div className="castle-ticket-dialog__confirm-reward"><strong>+{ticketLabel(offer.tickets * quantity)}</strong></div></div>
          <div className="castle-ticket-dialog__quantity" role="group" aria-label={t("Количество паков", "Number of packs")}><span>{t("Количество паков", "Number of packs")}</span><div><button type="button" aria-label={t("Уменьшить количество", "Decrease quantity")} disabled={quantity <= 1 || pending} onClick={() => setQuantity(value => value - 1)}>−</button><output aria-live="polite">{quantity}</output><button type="button" aria-label={t("Увеличить количество", "Increase quantity")} disabled={quantity >= 50 || pending} onClick={() => setQuantity(value => value + 1)}>+</button></div></div>
          <div className={`castle-ticket-dialog__confirm-payment${method.kind === "energy" ? " castle-ticket-dialog__confirm-payment--no-glyph" : ""}`}>
            {method.kind !== "energy" && <span className="castle-ticket-dialog__payment-glyph" aria-hidden="true">{method.kind === "stars" ? "★" : <Wallet />}</span>}
            <span><small>{t("Способ оплаты", "Payment method")}</small><strong>{methodName(method)}</strong></span><b>{totalPrice.toLocaleString(ru ? "ru-RU" : "en-US")} {method.kind === "stars" ? "★" : method.unit}</b>
          </div>
          {method.kind === "energy" && energyBalance != null && <p className="castle-ticket-dialog__payment-balance">{t("На Yupland", "On Yupland")}: <strong>{energyBalance.toLocaleString(ru ? "ru-RU" : "en-US")}</strong></p>}
          {method.kind === "stars" && <p className="castle-ticket-dialog__stars-balance" role="status">{starsBalance.isFetching ? t("Проверяем баланс Казны…", "Checking Treasury balance…") : starsAvailable == null ? t("Баланс Stars недоступен.", "Stars balance is unavailable.") : <>{t("В Казне", "In Treasury")}: <strong>{starsAvailable.toLocaleString(ru ? "ru-RU" : "en-US")} ★</strong>{starsShortage != null && starsShortage > 0 && <span>{t("Не хватает", "Need")} {starsShortage.toLocaleString(ru ? "ru-RU" : "en-US")} ★</span>}</>}</p>}{method.kind === "stars" && starsBalance.isError && <button type="button" onClick={() => void starsBalance.refetch()}>{t("Повторить", "Retry")}</button>}{error && <p role="alert" className="castle-ticket-dialog__error">{error}</p>}{!reviewRequired && methodDisabled(method) && <p role="alert" className="castle-ticket-dialog__error">{energyStatus === "error" ? t("Не удалось проверить энергию. Вернись и повтори проверку.", "Could not check energy. Go back and retry.") : t("Энергии для покупки сейчас недостаточно или её баланс ещё проверяется.", "There is not enough energy, or its balance is still being checked.")}</p>}<button type="button" data-game-button="primary" className="castle-ticket-dialog__primary" disabled={pending || (!reviewRequired && (status !== "ready" || methodDisabled(method) || method.kind === "stars" && starsAvailable == null))} onClick={reviewRequired ? onClose : () => void pay()}>{reviewRequired ? t("Закрыть и проверить баланс", "Close and check balance") : pending ? t("Покупаем…", "Buying…") : method.kind === "stars" ? starsShortage != null && starsShortage > 0 ? t("Пополнить Stars", "Top up Stars") : t("Оплатить Stars", "Pay with Stars") : t("Подтвердить покупку", "Confirm purchase")}</button></>}
        {stage === "top-up" && method?.kind === "stars" && <div className="castle-ticket-dialog__top-up"><p>{t("Для покупки нужно", "This purchase needs")} {totalPrice.toLocaleString(ru ? "ru-RU" : "en-US")} ★. {t("В Казне сейчас", "Treasury currently has")} {starsAvailable?.toLocaleString(ru ? "ru-RU" : "en-US") ?? "—"} ★.</p><StarsTopUp neededAmount={starsShortage ?? undefined} /><button type="button" data-game-button="primary" className="castle-ticket-dialog__primary" onClick={() => { onRetry(); void starsBalance.refetch(); setStage("confirm"); }}>{t("Вернуться к покупке", "Return to purchase")}</button></div>}
        {stage === "done" && <><div className="castle-ticket-dialog__summary" role="status"><span>+{ticketLabel(added)}</span><small>{t("Билеты зачислены.", "Tickets added.")}</small></div><button type="button" data-game-button="primary" className="castle-ticket-dialog__primary" onClick={() => { setQuantity(1); setOffer(null); setMethod(null); setStage("catalog"); }}>{t("К пакетам", "Back to packs")}</button></>}
      </div>
    </DialogContent>
  </Dialog>;
}
