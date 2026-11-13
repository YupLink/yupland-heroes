// Ратуша замка → «Банк». С 21.10.2026 (владелец) банк у всех построен сразу — тут
// только «Открыть»: обмен, стейкинг, лицензии. Здание стоит на площади (useWithBank),
// кнопка «Банк» есть и рядом с аукционом — в замке и на карте.
import { Landmark } from "lucide-react";
import { openBank } from "@/lib/bankBus";
import { BANK_LOOK } from "./modularBank";

export function TownHallBank({ ru }: { ru: boolean }) {
  return (
    <section className="town-hall-build" aria-label={ru ? "Банк" : "Bank"}>
      <div className="town-hall-build__looks">
        <img src={BANK_LOOK} alt="" />
      </div>
      <div className="town-hall-build__info">
        <h2>{ru ? "Банк" : "Bank"}</h2>
      </div>
      <button type="button" className="town-hall-build__go" onClick={() => openBank()}>
        <Landmark aria-hidden="true" />
        {ru ? "Открыть" : "Open"}
      </button>
    </section>
  );
}
