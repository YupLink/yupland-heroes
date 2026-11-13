import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Hourglass } from "lucide-react";
import crates from "@/assets/castle-decor/city/crates.webp";
import { useLang } from "@/lib/i18n";
import { getAuctionHouse } from "@/server/api/game-auction";
import { HOUSE_KEY } from "./auctionRefresh";
import { PlayerLotForm } from "./PlayerLotForm";
import { timeLeft } from "./auctionFormat";
import { AuctionDialog } from "./AuctionDialog";
import { AuctionHouseUpgrade } from "./AuctionHouseUpgrade";

export function AuctionHouseBar() {
  const en = useLang() === "en";
  const q = useQuery({ queryKey: HOUSE_KEY, queryFn: () => getAuctionHouse() });
  const [selling, setSelling] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const h = q.data;
  if (q.isPending && !h) return <p className="auction-house-notice" role="status">{en ? "Loading auction house…" : "Загружаем Аукционный дом…"}</p>;
  if (!h) return <section className="auction-house-notice" role="alert">
    <p>{en ? "Could not load your auction house" : "Не удалось загрузить Аукционный дом"}</p>
    <button type="button" className="auction-secondary" onClick={() => void q.refetch()}>{en ? "Retry" : "Повторить"}</button>
  </section>;
  if (h.level < 1) return <section className="auction-house-notice auction-house-notice--intro" aria-label={en ? "How to list your item" : "Как выставить свой лот"}>
    <img className="auction-house-notice__art" src="/resources/trade-auction.webp" alt="" />
    <h2 className="auction-house-notice__title">{en ? "Want to list your own item?" : "Хочешь выставить свой лот?"}</h2>
    <div className="auction-house-notice__copy">
      <p>{en ? <>Build an <strong>Auction House</strong> in the Town Hall of your castle.</> : <>Построй <strong>Аукционный дом</strong> в Ратуше своего замка.</>}</p>
      <p>{en ? 'Once it is built, you can list items here in the “From players” tab.' : 'После постройки выставлять вещи можно здесь, во вкладке «От игроков».'}</p>
    </div>
  </section>;
  const full = h.busy >= h.slots;
  return <>
    <section className="auction-house" aria-label={en ? "Auction house" : "Аукционный дом"}>
      <img className="auction-house__art" src="/auction/house.webp" alt="" />
      <div className="auction-house__info">
        <div className="auction-house__head">
          <div className="auction-house__identity"><h2>{en ? "Auction house" : "Аукционный дом"}</h2>
            <span>{en ? `Lv ${h.level}` : `ур. ${h.level}`}</span></div>
          <button type="button" className="auction-house__upgrade" disabled={!h.cost}
            onClick={() => setUpgrading(true)} aria-label={en ? "Upgrade auction house" : "Улучшить аукционный дом"}>
            <ArrowUp aria-hidden="true" />{h.cost ? en ? "Upgrade" : "Улучшить" : en ? "Max level" : "Макс. уровень"}
          </button>
        </div>
        <div className="auction-house__stats">
          <div className="auction-house__slots"><small>{en ? "Lots occupied" : "Занято лотов"}</small>
            <b><img src={crates} alt="" />{h.busy}/{h.slots}</b></div>
          {h.feePct != null && <div className="auction-house__fee"><span>{en ? "Commission" : "Комиссия"}</span><b>{h.feePct}%</b></div>}
          <button type="button" className="auction-house__sell" disabled={full} onClick={() => setSelling(true)}>
            {en ? "List your item" : "Выставить свой лот"}
          </button>
        </div>
        {full && <p className="auction-house__wait">{en ? "All slots occupied" : "Все лоты заняты"}
          {h.freeAt && <><Hourglass aria-hidden="true" />{timeLeft(new Date(h.freeAt).toISOString(), Date.now(), en)}</>}
        </p>}
      </div>
    </section>
    {selling && !full && <AuctionDialog title={en ? "List your item" : "Выставить свой лот"} closeLabel={en ? "Close" : "Закрыть"} onClose={() => setSelling(false)}>
      <PlayerLotForm en={en} currencies={h.currencies} onDone={() => setSelling(false)} />
    </AuctionDialog>}
    {upgrading && h.cost && <AuctionHouseUpgrade house={h} en={en} onClose={() => setUpgrading(false)} />}
  </>;
}
