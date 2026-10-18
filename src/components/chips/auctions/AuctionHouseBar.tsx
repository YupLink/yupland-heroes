// Мой аукционный дом в окне аукционов: уровень, занято лотов из скольких,
// комиссия проекту, «Выставить». Строится и улучшается дом в Ратуше замка
// (TownHallAuctionHouse), здесь — только торговля. Не построен — строки нет.
// Правила — lib/auctionHouse.ts. Классы — auction-house.css.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Hourglass } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { getAuctionHouse } from "@/server/api/game-auction";
import { HOUSE_KEY } from "./auctionRefresh";
import { PlayerLotForm } from "./PlayerLotForm";
import { timeLeft } from "./auctionFormat";

export function AuctionHouseBar() {
  const en = useLang() === "en";
  const q = useQuery({ queryKey: HOUSE_KEY, queryFn: () => getAuctionHouse() });
  const [selling, setSelling] = useState(false);
  const h = q.data;
  if (!h || h.level < 1) return null;
  const full = h.busy >= h.slots;

  return (
    <div className="auction-ledger auction-house">
      <div className="auction-house__head">
        <h2 className="auction-house__title">{en ? "Auction house" : "Аукционный дом"}</h2>
        <span className="auction-kind">{en ? `Lv ${h.level}` : `ур. ${h.level}`}</span>
        {h.feePct != null && <span className="auction-house__fee">−{h.feePct}%</span>}
        <b className="auction-house__slots" aria-label={en ? "Lots" : "Лоты"}>
          {h.busy}/{h.slots}
        </b>
      </div>
      <div className="auction-house__row">
        <button
          type="button"
          className="auction-primary"
          disabled={full}
          onClick={() => setSelling((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          {en ? "Sell" : "Выставить"}
        </button>
        {full && h.freeAt && (
          <span className="auction-house__wait">
            <Hourglass className="h-3.5 w-3.5" />
            {timeLeft(new Date(h.freeAt).toISOString(), Date.now(), en)}
          </span>
        )}
      </div>
      {selling && !full && (
        <PlayerLotForm en={en} currencies={h.currencies} onDone={() => setSelling(false)} />
      )}
    </div>
  );
}
