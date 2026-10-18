import { useEffect, type Ref } from "react";
import { MapPinned, Shield, Star } from "lucide-react";
import interior from "@/assets/town-hall/interior.webp";
import { TownHallAuctionHouse } from "./TownHallAuctionHouse";
import { TownHallCasino } from "./TownHallCasino";
import { TownHallBank } from "./TownHallBank";
import "./town-hall.css";

export function TownHallScreen({
  ru,
  onBack,
  backRef,
  onMakeMainCastle,
  isMainCastle = false,
}: {
  ru: boolean;
  onBack: () => void;
  backRef?: Ref<HTMLButtonElement>;
  onMakeMainCastle?: () => void;
  isMainCastle?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  // «Постройки замка» уже здесь — аукционный дом (TownHallAuctionHouse), казино (TownHallCasino) и банк — только админам (TownHallBank).
  const future = ru
    ? ["Расширение территории", "Дополнительные бонусы"]
    : ["Expand territory", "Additional bonuses"];

  return (
    <div className="town-hall-screen">
      <div className="town-hall-stage">
        <img className="town-hall-art" src={interior} alt="" />
        <header className="town-hall-header">
          <button ref={backRef} type="button" className="town-hall-back" onClick={onBack}>
            <span aria-hidden="true">←</span> {ru ? "Замок" : "Castle"}
          </button>
          <h1 id="castle-window-title">{ru ? "Ратуша" : "Town Hall"}</h1>
        </header>

        {onMakeMainCastle ? (
          <button type="button" className="town-hall-status town-hall-status--action" onClick={onMakeMainCastle}>
            {ru ? "Сделать основным замком" : "Make this my main castle"}
          </button>
        ) : (
          <p className="town-hall-status">
            {isMainCastle ? (ru ? "Основной замок" : "Main castle") : (ru ? "Скоро откроется" : "Coming soon")}
          </p>
        )}

        <div className="town-hall-dock">
        <TownHallAuctionHouse ru={ru} />
        <TownHallCasino ru={ru} />
        <TownHallBank ru={ru} />
        <section className="town-hall-future" aria-labelledby="town-hall-future-title">
          <h2 id="town-hall-future-title">{ru ? "Здесь появятся" : "Coming here"}</h2>
          <ul>
            <li>
              <MapPinned aria-hidden="true" />
              <span>{future[0]}</span>
            </li>
            <li>
              <span className="town-hall-shield" aria-hidden="true">
                <Shield />
                <Star />
              </span>
              <span>{future[1]}</span>
            </li>
          </ul>
        </section>
        </div>
      </div>
    </div>
  );
}
