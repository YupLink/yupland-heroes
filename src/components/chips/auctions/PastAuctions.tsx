// History is fetched only after expanding PastSection. No trading actions here.
import { useQuery } from "@tanstack/react-query";
import { Check, Gavel, Loader2 } from "lucide-react";
import { listPastAuctions } from "@/server/api/game-auction";
import { KIND_EN, KIND_RU, fmtNum, qtyText } from "./auctionFormat";
import { RarityChip } from "./PrizeInfoLine";
import { AuctionCurrency } from "./AuctionCurrency";
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
  if (q.isLoading) return <div className="auction-loading" role="status" aria-label={en ? "Loading history" : "Загрузка истории"}><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (q.isError) return <div className="auction-empty"><p>{en ? "Couldn't load history" : "Не удалось загрузить историю"}</p><button type="button" className="auction-primary" onClick={() => void q.refetch()}>{en ? "Try again" : "Повторить"}</button></div>;
  const rows = q.data?.auctions ?? [];
  if (!rows.length) return <p className="auction-empty">{en ? "None yet" : "Пока нет"}</p>;
  return <div className="auction-ledger auction-history">
    {rows.map((r) => {
      const sold = r.outcome === "sold";
      const outcome = OUTCOME[r.outcome]?.[en ? 1 : 0] ?? r.outcome;
      return <article key={r.id} className="auction-history__row">
        <span className="auction-history__media">
          {r.prizeImage ? <img src={r.prizeImage} alt="" loading="lazy" /> : <Gavel aria-hidden="true" />}
          <span className="auction-history__quantity" aria-label={`${en ? "Quantity" : "Количество"}: ${fmtNum(r.prizeQty, en)}`}>{fmtNum(r.prizeQty, en)}</span>
        </span>
        <div className="auction-history__info">
          <div className="auction-history__labels"><span>{(en ? KIND_EN : KIND_RU)[r.prizeKind] ?? r.prizeKind}</span><RarityChip info={r.prizeInfo} en={en} /></div>
          <h3 className="auction-history__name" title={`${r.prizeName}${qtyText(r.prizeQty, en)}`}>{r.prizeName}</h3>
          <div className="auction-history__meta">
            <span className={`auction-history__outcome${sold ? " auction-history__outcome--sold" : ""}`}>
              {sold && <Check aria-hidden="true" />}{outcome}
            </span>
            {sold && r.price != null && <b className="auction-history__price"><AuctionCurrency currency={r.currency} en={en} />{fmtNum(r.price, en)}</b>}
          </div>
        </div>
        <div className="auction-history__date">
          <time dateTime={new Date(r.endedAt).toISOString()} title={new Date(r.endedAt).toLocaleString(en ? "en-GB" : "ru-RU")}>
            {new Date(r.endedAt).toLocaleDateString(en ? "en-GB" : "ru-RU", { day: "2-digit", month: "2-digit" })}
          </time>
          {r.mine && <span>{en ? "Your lot" : "Твой лот"}</span>}
          {r.iWon && <span className="auction-history__won">{en ? "You won" : "Твой выигрыш"}</span>}
        </div>
      </article>;
    })}
  </div>;
}

export function PastAuctions({ source, en }: { source: "game" | "player"; en: boolean }) {
  return <PastSection en={en}>{(open) => open && <PastList source={source} en={en} />}</PastSection>;
}
