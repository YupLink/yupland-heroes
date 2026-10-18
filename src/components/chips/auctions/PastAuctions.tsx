// Прошедшие лоты для игрока: грузятся, только когда блок раскрыли. Итог лота —
// плашкой (продан / не продан / отменён), цена продажи, «твой выигрыш»/«твой лот».
import { useQuery } from "@tanstack/react-query";
import { Gavel, Loader2 } from "lucide-react";
import { listPastAuctions } from "@/server/api/game-auction";
import { currencyLabel } from "@/lib/auctionCurrency";
import { KIND_EN, KIND_RU, fmtNum, qtyText } from "./auctionFormat";
import { RarityChip } from "./PrizeInfoLine";
import { PastSection } from "./PastSection";

const OUTCOME: Record<string, [string, string]> = {
  sold: ["Продан", "Sold"],
  unsold: ["Не продан", "Unsold"],
  cancelled: ["Отменён", "Cancelled"],
};

function PastList({ source, en }: { source: "game" | "player"; en: boolean }) {
  const q = useQuery({
    queryKey: ["auctions", "past", source],
    queryFn: () => listPastAuctions({ data: { source } }),
    staleTime: 30_000,
  });
  if (q.isLoading) {
    return (
      <div className="auction-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  const rows = q.data?.auctions ?? [];
  if (rows.length === 0) return <p className="auction-empty">{en ? "None yet" : "Пока нет"}</p>;
  return (
    <div className="auction-ledger auction-past__list">
      {rows.map((r) => (
        <div key={r.id} className="auction-past__row">
          <span className="auction-past__media">
            {r.prizeImage ? <img src={r.prizeImage} alt="" /> : <Gavel aria-hidden="true" />}
          </span>
          <div className="auction-past__info">
            <p className="auction-past__name">
              <span className="auction-kind">
                {(en ? KIND_EN : KIND_RU)[r.prizeKind] ?? r.prizeKind}
              </span>{" "}
              <RarityChip info={r.prizeInfo} en={en} />
              {r.prizeName}
              {qtyText(r.prizeQty, en)}
            </p>
            <p className="auction-past__meta">
              <span className={`auction-past__outcome auction-past__outcome--${r.outcome}`}>
                {OUTCOME[r.outcome][en ? 1 : 0]}
              </span>
              {r.price != null && (
                <b>
                  {fmtNum(r.price, en)} {currencyLabel(r.currency, en)}
                </b>
              )}
              {r.iWon && <span className="auction-lead">{en ? "You won" : "Твой выигрыш"}</span>}
              {r.mine && <span className="auction-lead">{en ? "Your lot" : "Твой лот"}</span>}
            </p>
          </div>
          <time className="auction-past__date">
            {new Date(r.endedAt).toLocaleDateString(en ? "en-GB" : "ru-RU", {
              day: "2-digit",
              month: "2-digit",
            })}
          </time>
        </div>
      ))}
    </div>
  );
}

export function PastAuctions({ source, en }: { source: "game" | "player"; en: boolean }) {
  return (
    <PastSection en={en}>{(open) => open && <PastList source={source} en={en} />}</PastSection>
  );
}
