import { useVisibleAuctions } from "@/components/trade/useVisibleAuctions";
// Витрина аукционов в дизайне замка: живые лоты, ставка списывается со счёта,
// перебили — вернулась. source: лоты игры или лоты игроков (аукционный дом).
// Свой лот — без поля ставки; снять можно, пока ставок нет. Минимум данных.
// Классы — auction-screen.css.
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { listAuctions } from "@/server/api/game-auction";
import { getSession } from "@/server/api/user-auth";
import { PastAuctions } from "./PastAuctions";
import { LIVE_KEY, refreshAuctionData } from "./auctionRefresh";

import { AuctionTime } from "./AuctionClock";
import { AuctionCard } from "./AuctionCard";

export function AuctionsPlayerPanel({ source }: { source: "game" | "player" }) {
  const seenRoot = useVisibleAuctions();
  const en = useLang() === "en";
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const viewer = session.data?.wallet ?? "guest";
  const q = useQuery({
    queryKey: [...LIVE_KEY, viewer],
    enabled: session.isSuccess,
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
  ).sort((a, b) => Number(b.mine) - Number(a.mine));

  if (q.isLoading || session.isPending) {
    return (
      <div className="auction-loading">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (q.isError || session.isError) return <p role="alert" className="auction-empty">{en ? "Could not load auctions" : "Не удалось загрузить аукционы"}<button type="button" className="auction-secondary" onClick={() => { void session.refetch(); void q.refetch(); }}>{en ? "Retry" : "Повторить"}</button></p>;
  return (
    <>
      <AuctionTime.Provider value={now}>
      <div ref={seenRoot} className="auction-ledger auction-live-lots">
        {lots.length === 0 ? (
          <p className="auction-empty">{en ? "No auctions" : "Аукционов нет"}</p>
        ) : (
          lots.map((lot) => (
            <AuctionCard
              key={`${viewer}:${lot.id}`}
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
