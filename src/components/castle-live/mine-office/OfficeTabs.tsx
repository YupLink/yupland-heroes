// «Управление шахтами»: свои шахты и «Отбитые» за 7 дней (владелец 04.11.2026, §8.106).
import { useState } from "react";
import { tr, type Lang } from "../mine-buildings/presentation";
import { Office } from "./MineOfficeContent";
import { OfficeLost, type MapSpot } from "./OfficeLost";

export function OfficeTabs({ l, onMap }: { l: Lang; onMap: (s: MapSpot) => void }) {
  const [tab, setTab] = useState<"mines" | "lost">("mines");
  return (
    <>
      <div className="mb-office-switch" role="tablist">
        {(["mines", "lost"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {id === "mines" ? tr(l, "Шахты", "Mines") : tr(l, "Отбитые", "Lost")}
          </button>
        ))}
      </div>
      {tab === "mines" ? <Office l={l} onMap={onMap} /> : <OfficeLost l={l} onMap={onMap} />}
    </>
  );
}
