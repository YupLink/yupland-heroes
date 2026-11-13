import { usePurchaseMusic } from "@/hooks/usePurchaseMusic";
// Окно «Купить золото» (владелец, 22.10.2026, ПРАВИЛА §8.66; дизайн Ангелины):
// каталог → (все способы) → подтверждение → (пополнить звёзды) → готово.
// Открывается «+» у золота в шапке замка и у баланса в Торговом доме. Оболочка —
// та же, что у окна энергии (energy-buy.css), своё — карточки и картинки золота.
// Пока идёт оплата, закрыть окно и нажать второй раз нельзя; ключ нажатия один
// на экран подтверждения — «Повторить» после обрыва не спишет дважды.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { useGoldBuy } from "./useGoldBuy";
import { GoldAmount, GoldCatalog } from "./GoldCatalog";
import { GoldConfirm, GoldDone, GoldMethods, GoldTopUp } from "./GoldConfirm";
import { CardPayRow } from "../card-pay/CardPayRow";
import { useCardPayOn } from "../card-pay/useCardPayOn";
import { goldArtSrc } from "@/lib/goldShop";
import { type GoldCard, type GoldOpt } from "./goldBuyModel";
import "../energy-buy/energy-buy.css";
import "./gold-buy.css";

type Stage = "catalog" | "methods" | "confirm" | "top-up" | "success";

export function GoldBuyDialog({ open, ru, onClose, returnFocus, aboveMarket = false }: {
  open: boolean;
  ru: boolean;
  onClose: () => void;
  returnFocus: () => void;
  aboveMarket?: boolean;
}) {
  usePurchaseMusic(open);
  const data = useGoldBuy(open);
  const cardOn = useCardPayOn();
  const [stage, setStage] = useState<Stage>("catalog");
  const [offerId, setOfferId] = useState<string | null>(null);
  const [pick, setPick] = useState<{ key: string; opId: string } | null>(null);
  const [origin, setOrigin] = useState<"catalog" | "methods">("catalog");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [credited, setCredited] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const catalogScroll = useRef(0);
  // Защита от двойного нажатия до перерисовки: кнопка ещё не успела погаснуть.
  const inFlight = useRef(false);

  useLayoutEffect(() => {
    if (!open) return;
    catalogScroll.current = 0;
    setStage("catalog");
    setOfferId(null);
    setPick(null);
    setError("");
  }, [open]);
  useLayoutEffect(() => {
    if (dialogRef.current) dialogRef.current.scrollTop = stage === "catalog" ? catalogScroll.current : 0;
  }, [stage]);

  // Всё — из свежих данных: курс сменился — на подтверждении уже новая цена.
  const card: GoldCard | null = offerId ? (data.cards.find((c) => c.offer.id === offerId) ?? null) : null;
  const opt: GoldOpt | null = card && pick ? (card.opts.find((o) => o.key === pick.key) ?? null) : null;

  useEffect(() => {
    if (pending || data.status !== "ready") return;
    const lost = (stage === "confirm" || stage === "top-up") && !opt;
    if (lost || (stage === "methods" && !card)) {
      setStage("catalog");
      setError(ru ? "Предложение изменилось. Выбери его заново." : "This offer changed. Select it again.");
    }
  }, [stage, opt, card, pending, data.status, ru]);

  const leaveCatalog = () => {
    if (stage === "catalog") catalogScroll.current = dialogRef.current?.scrollTop ?? 0;
    setError("");
  };
  const choose = (c: GoldCard, o: GoldOpt, from: "catalog" | "methods") => {
    leaveCatalog();
    setOfferId(c.offer.id);
    setPick({ key: o.key, opId: newOpId() });
    setOrigin(from);
    setStage("confirm");
  };
  const back = () => {
    setError("");
    setStage(stage === "top-up" ? "confirm" : stage === "confirm" ? origin : "catalog");
  };
  const close = () => {
    if (!pending) onClose();
  };

  const pay = async () => {
    if (!card || !opt || !pick || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const r = await data.pay(card, opt, pick.opId);
      setCredited(r.gold);
      setPick(null);
      setStage("success");
    } catch (e) {
      setError(humanError(e));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const title =
    stage === "top-up" ? (ru ? "Пополнить Stars" : "Top up Stars")
    : stage === "confirm" ? (ru ? "Подтверждение" : "Confirmation")
    : stage === "success" ? (ru ? "Покупка завершена" : "Purchase complete")
    : ru ? "Купить золото" : "Buy gold";
  const cls = [
    "energy-buy energy-buy--bundle-study energy-buy--energy-flow gold-buy",
    stage === "catalog" && "gold-buy--catalog",
    stage === "methods" && "gold-buy--methods",
    stage === "confirm" && "energy-buy--purchase-confirm",
  ].filter(Boolean).join(" ");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent
        ref={dialogRef}
        className={aboveMarket ? `${cls} z-[151]` : cls}
        overlayClassName={aboveMarket ? "z-[150]" : undefined}
        closeLabel={ru ? "Закрыть" : "Close"}
        tabIndex={-1}
        onOpenAutoFocus={(e) => { e.preventDefault(); dialogRef.current?.focus(); }}
        onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus(); }}
        onEscapeKeyDown={(e) => { if (pending) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (pending) e.preventDefault(); }}
      >
        <header className="energy-buy__header">
          {stage !== "catalog" && stage !== "success" && (
            <button type="button" className="energy-buy__back" disabled={pending} onClick={back} aria-label={ru ? "Назад" : "Back"}>
              <ArrowLeft aria-hidden="true" />
            </button>
          )}
          <img className="gold-buy__head-icon" src="/design-assets/purchase/gold/bag-one.webp" alt="" aria-hidden="true" />
          <DialogTitle>{title}</DialogTitle>
          <button type="button" className="energy-buy__close" disabled={pending} onClick={close} aria-label={ru ? "Закрыть" : "Close"}>
            <X aria-hidden="true" />
          </button>
        </header>
        <DialogDescription className={stage === "methods" && card ? "energy-buy__description" : "sr-only"}>
          {stage === "methods" && card ? (
            <>
              <img src={goldArtSrc(card.offer.gold)} alt="" aria-hidden="true" />
              <strong><GoldAmount gold={card.offer.gold} ru={ru} /></strong>
              <span>{ru ? "Выбери способ оплаты" : "Choose a payment method"}</span>
            </>
          ) : data.rules.googleOnly ? (ru ? "Пакеты золота: картой в долларах или за DarAi со счёта Казны" : "Gold packs: by card in dollars or for DarAi from your Treasury")
          : ru ? `Пакеты золота за ${data.rules.stars ? "Stars, " : ""}USDT и DarAi со счёта Казны` : `Gold packs for ${data.rules.stars ? "Stars, " : ""}USDT and DarAi from your Treasury balance`}
        </DialogDescription>

        <div className={`energy-buy__content${stage === "top-up" ? " energy-buy__top-up" : stage === "success" ? " energy-buy__success" : ""}`} role={stage === "success" ? "status" : undefined}>
          {stage === "catalog" && (
            <>
              {error && <p className="energy-buy__error" role="alert">{error}</p>}
              {data.status === "loading" && <p className="energy-buy__status" role="status">{ru ? "Загружаем предложения…" : "Loading offers…"}</p>}
              {data.status === "error" && (
                <div className="energy-buy__status" role="alert">
                  {ru ? "Не удалось загрузить предложения." : "Could not load offers."}
                  <button type="button" onClick={data.retry}>{ru ? "Повторить" : "Retry"}</button>
                </div>
              )}
              {data.status === "ready" && data.cards.length === 0 && (
                <p className="energy-buy__status">{ru ? "Сейчас нет доступных предложений." : "No offers are available right now."}</p>
              )}
              {data.status === "ready" && data.cards.length > 0 && (
                <GoldCatalog
                  cardOn={cardOn || data.rules.googleOnly}
                  ru={ru}
                  cards={data.cards}
                  busy={pending}
                  onPick={(c, o) => choose(c, o, "catalog")}
                  onAll={(c) => { leaveCatalog(); setOfferId(c.offer.id); setStage("methods"); }}
                />
              )}
            </>
          )}
          {stage === "methods" && card && (
            <>
              {/* Картой — только «только Google» (§8.127), сервер решает. */}
              <CardPayRow sku={card.offer.id} usd={card.offer.priceUsd} ru={ru} offText={data.rules.googleOnly} />
              <GoldMethods ru={ru} card={card} balanceOf={data.balanceOf} onPick={(o) => choose(card, o, "methods")} />
            </>
          )}
          {stage === "confirm" && card && opt && (
            <GoldConfirm
              ru={ru}
              card={card}
              opt={opt}
              balance={data.balanceOf(opt.token)}
              starOnly={data.starOnly}
              rules={data.rules}
              error={error}
              pending={pending}
              onPay={() => void pay()}
              onTopUp={() => setStage("top-up")}
              onRetryBalance={data.retryBalance}
            />
          )}
          {stage === "top-up" && opt && <GoldTopUp ru={ru} opt={opt} balance={data.balanceOf(opt.token)} onBack={() => setStage("confirm")} />}
          {stage === "success" && <GoldDone ru={ru} gold={credited} onBack={() => { setOfferId(null); setStage("catalog"); }} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

