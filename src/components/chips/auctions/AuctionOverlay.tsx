// Полноэкранное окно аукциона в дизайне замка (Russo/Golos, золото). Открывается
// шиной (кружок в HUD замка или на карте), поверх всего. Монтируется один раз в
// корне ChipsPage и CastleGame, поэтому работает и из замка, и из мира.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { onAuctionToggle, closeAuction, type AuctionTab } from "@/lib/auctionBus";
import { AuctionScreen } from "./AuctionScreen";
import "./auction-screen.css";

export function AuctionOverlay() {
  const en = useLang() === "en";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AuctionTab>("game");

  useEffect(
    () =>
      onAuctionToggle((isOpen, t) => {
        setOpen(isOpen);
        if (isOpen) setTab(t);
      }),
    [],
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuction();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <section
      className="auction-window"
      role="dialog"
      aria-modal="true"
      aria-label={en ? "Auctions" : "Аукционы"}
    >
      <header className="auction-topbar">
        <button type="button" className="auction-back" onClick={() => closeAuction()}>
          <ArrowLeft aria-hidden="true" />
          {en ? "Back" : "Назад"}
        </button>
        <h1>{en ? "Auctions" : "Аукционы"}</h1>
      </header>
      <div className="auction-body">
        <div className="auction-stage">
          <AuctionScreen key={tab} initialTab={tab} />
        </div>
      </div>
    </section>
  );
}
