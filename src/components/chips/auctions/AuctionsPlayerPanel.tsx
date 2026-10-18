// Витрина аукционов в дизайне замка: живые лоты, ставка списывается со счёта,
// перебили — вернулась. source: лоты игры или лоты игроков (аукционный дом).
// Свой лот — без поля ставки; снять можно, пока ставок нет. Минимум данных.
// Классы — auction-screen.css.
import { createContext, memo, useCallback, useContext, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gavel, Loader2, Crown } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { listAuctions, placeBid, cancelPlayerLot } from "@/server/api/game-auction";
import { timeLeft, KIND_RU, KIND_EN, fmtNum, qtyText } from "./auctionFormat";
import { PrizeInfoLine, RarityChip } from "./PrizeInfoLine";
import { ARTPOP_TRIGGER, ArtifactInfoPop } from "./ArtifactInfoPop";
import { PastAuctions } from "./PastAuctions";
import { LIVE_KEY, refreshAuctionData } from "./auctionRefresh";
import { currencyLabel, isWholeOnlyCurrency } from "@/lib/auctionCurrency";

type Lot = Awaited<ReturnType<typeof listAuctions>>["auctions"][number];

const AuctionTime = createContext(0);

function AuctionClock({ endAt, en }: { endAt: string; en: boolean }) {
  const now = useContext(AuctionTime);
  return <b className="auction-lot__clock">{timeLeft(endAt, now, en)}</b>;
}

export function AuctionsPlayerPanel({ source }: { source: "game" | "player" }) {
  const en = useLang() === "en";
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: LIVE_KEY,
    queryFn: () => listAuctions(),
    refetchInterval: 15_000,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (id !== undefined) clearInterval(id);
      id = undefined;
      if (!document.hidden) {
        setNow(Date.now());
        id = setInterval(() => setNow(Date.now()), 1000);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (id !== undefined) clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const onDone = useCallback(() => refreshAuctionData(qc), [qc]);
  // Вверху — только идущие: время вышло — лот уходит в «Прошедшие» (закроется обходом).
  const lots = (q.data?.auctions ?? []).filter(
    (l) => l.fromPlayer === (source === "player") && Date.parse(l.endAt) > now,
  );

  if (q.isLoading) {
    return (
      <div className="auction-loading">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  return (
    <>
      <AuctionTime.Provider value={now}>
      <div className="auction-ledger">
        {lots.length === 0 ? (
          <p className="auction-empty">{en ? "No auctions" : "Аукционов нет"}</p>
        ) : (
          lots.map((lot) => (
            <AuctionCard
              key={lot.id}
              lot={lot}
              en={en}
              ended={Date.parse(lot.endAt) <= now}
              onDone={onDone}
            />
          ))
        )}
      </div>
      </AuctionTime.Provider>
      <PastAuctions source={source} en={en} />
    </>
  );
}

const AuctionCard = memo(function AuctionCard({
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
  const [amount, setAmount] = useState<string>(String(lot.nextMin));
  // Артефакт: нажатие на лот — «что даёт» (ArtifactInfoPop); повторное — закрыть.
  const [pop, setPop] = useState(false);
  const closePop = useCallback(() => setPop(false), []);
  const canPop = lot.prizeKind === "artifact" && !!lot.prizeInfo;
  // Перебили, пока смотрел, — подтянуть поле к новому минимуму (своё большее не трогаем).
  useEffect(() => {
    setAmount((v) => (Number(v) < lot.nextMin ? String(lot.nextMin) : v));
  }, [lot.nextMin]);
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
    <div className="auction-lot">
      <div
        className={`auction-lot__top${canPop ? " auction-lot__top--tap" : ""}`}
        role={canPop ? "button" : undefined}
        {...(canPop ? { [ARTPOP_TRIGGER]: lot.id } : {})}
        tabIndex={canPop ? 0 : undefined}
        aria-expanded={canPop ? pop : undefined}
        onClick={canPop ? () => setPop((v) => !v) : undefined}
        onKeyDown={
          canPop
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPop((v) => !v);
                }
              }
            : undefined
        }
      >
        <span className="auction-lot__media">
          {lot.prizeImage ? <img src={lot.prizeImage} alt="" /> : <Gavel aria-hidden="true" />}
        </span>
        <div className="auction-lot__info">
          <h3 className="auction-lot__title">
            <span className="auction-kind">
              {(en ? KIND_EN : KIND_RU)[lot.prizeKind] ?? lot.prizeKind}
            </span>{" "}
            <RarityChip info={lot.prizeInfo} en={en} />
            {lot.prizeName}
            {qtyText(lot.prizeQty, en)}
          </h3>
          <PrizeInfoLine kind={lot.prizeKind} info={lot.prizeInfo} en={en} />
          {lot.mine ? (
            <span className="auction-lead">{en ? "Your lot" : "Твой лот"}</span>
          ) : (
            lot.amIWinning && (
              <span className="auction-lead">
                <Crown className="h-3 w-3" />
                {en ? "You lead" : "Ты лидер"}
              </span>
            )
          )}
        </div>
        <AuctionClock endAt={lot.endAt} en={en} />
      </div>
      {pop && lot.prizeInfo && (
        <ArtifactInfoPop info={lot.prizeInfo} en={en} anchor={lot.id} onClose={closePop} />
      )}

      <div className="auction-lot__bidrow">
        <b className="auction-lot__price">
          {fmtNum(lot.current, en)} <i>{currencyLabel(lot.currency, en)}</i>
        </b>
        {lot.mine ? (
          lot.canCancel && (
            <button
              type="button"
              className="auction-danger"
              disabled={ended || cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : en ? (
                "Withdraw"
              ) : (
                "Снять"
              )}
            </button>
          )
        ) : (
          <div className="auction-lot__bid">
            <input
              type="number"
              inputMode={isWholeOnlyCurrency(lot.currency) ? "numeric" : "decimal"}
              step={isWholeOnlyCurrency(lot.currency) ? 1 : "any"}
              min={lot.nextMin}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={ended || bid.isPending}
              className="auction-field"
            />
            <button
              type="button"
              className="auction-primary"
              disabled={ended || bid.isPending}
              onClick={() => bid.mutate()}
            >
              {bid.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : en ? "Bid" : "Ставка"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
