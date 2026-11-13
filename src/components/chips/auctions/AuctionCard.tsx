import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpRight, Crown, Gavel, Loader2, Shield } from "lucide-react";
import { listAuctions, placeBid, cancelPlayerLot } from "@/server/api/game-auction";
import { isWholeOnlyCurrency } from "@/lib/auctionCurrency";
import { KIND_RU, KIND_EN, fmtNum, qtyText } from "./auctionFormat";
import { PrizeInfoLine, RarityChip } from "./PrizeInfoLine";
import { ARTPOP_TRIGGER, ArtifactInfoPop } from "./ArtifactInfoPop";
import { AuctionClock } from "./AuctionClock";
import { AuctionCurrency } from "./AuctionCurrency";
import { ART_LOW_PCT, shownArtPct } from "@/lib/hero/artWear";
import { EnchantMark } from "@/components/EnchantMark";

type Lot = Awaited<ReturnType<typeof listAuctions>>["auctions"][number];
export const AuctionCard = memo(function AuctionCard({
  lot,
  en,
  ended,
  onDone,
}: {
  lot: Lot;
  en: boolean;
  ended: boolean;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(lot.nextMin));
  const [expanded, setExpanded] = useState(false);
  const [pop, setPop] = useState(false);
  const [participated, setParticipated] = useState(lot.amIWinning);
  const input = useRef<HTMLInputElement>(null);
  const bidId = useId();
  const closePop = useCallback(() => setPop(false), []);
  const canPop = lot.prizeKind === "artifact" && !!lot.prizeInfo;
  const durability =
    lot.prizeKind === "artifact" ? Math.round(shownArtPct(lot.prizeDurability)) : null;
  const durabilityLabel =
    durability === null ? undefined : `${en ? "Durability" : "Прочность"}: ${durability}%`;
  const outbid = !lot.mine && participated && !lot.amIWinning;
  useEffect(() => {
    if (lot.amIWinning) setParticipated(true);
  }, [lot.amIWinning]);
  useEffect(() => {
    setAmount((v) => (Number(v) < lot.nextMin ? String(lot.nextMin) : v));
  }, [lot.nextMin]);
  useEffect(() => {
    if (expanded) input.current?.focus();
  }, [expanded]);
  const fail = (e: unknown) => {
    toast.error(e instanceof Error ? e.message : String(e));
    onDone();
  };
  const bid = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!(value > 0)) throw new Error(en ? "Enter a bid" : "Введи ставку");
      return placeBid({ data: { auctionId: lot.id, amount: value, opId: crypto.randomUUID() } });
    },
    onSuccess: (r) => {
      if (!r.duplicate) toast.success(en ? "You lead" : "Ты лидируешь");
      setExpanded(false);
      onDone();
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: () => cancelPlayerLot({ data: { auctionId: lot.id } }),
    onSuccess: () => {
      toast.success(en ? "Lot withdrawn" : "Лот снят");
      onDone();
    },
    onError: fail,
  });
  return (
    <article
      className="auction-lot"
      data-auction-seen-id={!ended && !lot.mine ? lot.id : undefined}
    >
      <button
        type="button"
        className="auction-lot__media relative"
        disabled={!canPop}
        {...(canPop ? { [ARTPOP_TRIGGER]: lot.id } : {})}
        aria-label={en ? `Details: ${lot.prizeName}` : `Подробнее: ${lot.prizeName}`}
        aria-expanded={canPop ? pop : undefined}
        onClick={() => setPop((v) => !v)}
      >
        {lot.prizeImage ? <img src={lot.prizeImage} alt="" /> : <Gavel aria-hidden="true" />}
        <EnchantMark pct={lot.prizeEnchantPct} corner />
        <span
          className="auction-lot__quantity"
          aria-label={`${en ? "Quantity" : "Количество"}: ${fmtNum(lot.prizeQty, en)}`}
        >
          {fmtNum(lot.prizeQty, en)}
        </span>
      </button>
      <div className="auction-lot__info">
        <div className="auction-lot__labels">
          <span className="auction-kind">
            {(en ? KIND_EN : KIND_RU)[lot.prizeKind] ?? lot.prizeKind}
          </span>
          {!lot.mine && (lot.amIWinning || outbid) && (
            <span className={`auction-lead${outbid ? " auction-lead--outbid" : ""}`} role="status">
              {outbid ? <ArrowUpRight aria-hidden="true" /> : <Crown aria-hidden="true" />}
              {outbid
                ? en
                  ? "You've been outbid"
                  : "Твою ставку перебили"
                : en
                  ? "You lead"
                  : "Ты лидируешь"}
            </span>
          )}
        </div>
        <div className="auction-lot__title-row">
          <h3 className="auction-lot__title" title={lot.prizeName + qtyText(lot.prizeQty, en)}>
            {lot.prizeName}
          </h3>
          <EnchantMark pct={lot.prizeEnchantPct} show="pct" />
          {durability !== null && (
            <span
              className={`auction-lot__durability${durability <= ART_LOW_PCT ? " auction-lot__durability--low" : ""}`}
              aria-label={durabilityLabel}
              title={durabilityLabel}
            >
              <Shield aria-hidden="true" />
              <span>{durability}%</span>
            </span>
          )}
        </div>
        <div className="auction-lot__details">
          <RarityChip info={lot.prizeInfo} en={en} />
          <PrizeInfoLine kind={lot.prizeKind} info={lot.prizeInfo} en={en} />
        </div>
      </div>
      <AuctionClock endAt={lot.endAt} en={en} mine={lot.mine} />
      <div className="auction-lot__bidrow">
        <div className="auction-lot__price">
          <small>{en ? "Current price" : "Текущая цена"}</small>
          <b>
            <AuctionCurrency currency={lot.currency} en={en} />
            {fmtNum(lot.current, en)}
          </b>
        </div>
        {lot.mine ? (
          lot.canCancel ? (
            <button
              type="button"
              className="auction-danger"
              disabled={ended || cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? <Loader2 className="animate-spin" /> : en ? "Withdraw" : "Снять"}
            </button>
          ) : (
            <small className="auction-lot__locked">{en ? "Bids placed" : "Уже есть ставки"}</small>
          )
        ) : (
          <button
            type="button"
            className="auction-primary"
            disabled={ended || bid.isPending}
            aria-expanded={expanded}
            aria-controls={bidId}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? en
                ? "Collapse"
                : "Свернуть"
              : outbid
                ? en
                  ? "Raise bid"
                  : "Повысить ставку"
                : en
                  ? "Place a bid"
                  : "Сделать ставку"}
          </button>
        )}
      </div>
      {expanded && !lot.mine && (
        <form
          id={bidId}
          className="auction-lot__bid"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ended && !bid.isPending) bid.mutate();
          }}
        >
          <label>
            {en ? "Your bid" : "Ваша ставка"}
            <input
              ref={input}
              type="number"
              className="auction-field"
              inputMode={isWholeOnlyCurrency(lot.currency) ? "numeric" : "decimal"}
              step={isWholeOnlyCurrency(lot.currency) ? 1 : "any"}
              min={lot.nextMin}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={ended || bid.isPending}
            />
          </label>
          <button type="submit" className="auction-primary" disabled={ended || bid.isPending}>
            {bid.isPending ? (
              <Loader2 className="animate-spin" />
            ) : en ? (
              "Confirm bid"
            ) : (
              "Подтвердить ставку"
            )}
          </button>
        </form>
      )}
      {pop && lot.prizeInfo && (
        <ArtifactInfoPop info={lot.prizeInfo} en={en} anchor={lot.id} onClose={closePop} />
      )}
    </article>
  );
});
