// Ачивки острова на панели (§8.57): восемь занятий до обычной редкости — тогда
// портал пускает в мир. Строка — значок, имя, счёт до цели и полоска; тап —
// как этим заниматься и «Показать» на карте.
import { useState } from "react";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  ACH_TRACK_IDS,
  ISLAND_GATE_STEP,
  stepTarget,
  type AchCounts,
  type AchTrackId,
} from "@/lib/achievements/tracks";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import { AchTrackIcon } from "@/components/achievements/AchTrackIcon";
import { achTarget } from "./achTargets";

export function IslandAchList({
  counts,
  places,
  onShow,
}: {
  counts: AchCounts;
  places: IslandPlaces;
  onShow?: (q: number, r: number) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<AchTrackId | null>(null);
  const target = open ? achTarget(open, places) : null;
  return (
    <>
      <ul className="island-ach">
        {ACH_TRACK_IDS.map((id) => {
          const goal = stepTarget(id, ISLAND_GATE_STEP);
          const n = Math.min(counts[id] ?? 0, goal);
          const done = n >= goal;
          return (
            <li key={id}>
              <button
                type="button"
                className={`island-ach__row${done ? " is-done" : ""}${open === id ? " is-open" : ""}`}
                aria-expanded={open === id}
                onClick={() => setOpen(open === id ? null : id)}
              >
                <AchTrackIcon id={id} className="island-ach__icon" />
                <span className="island-ach__name">{t(`ach.track.${id}`)}</span>
                <span className="island-ach__count">
                  {done ? <Check aria-label={t("ach.done")} /> : `${n}/${goal}`}
                </span>
                <span className="island-ach__bar" aria-hidden="true">
                  <i style={{ width: `${Math.round((n / goal) * 100)}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <div className="island-ach__how">
          <p>{t(`island.ach.${open}`)}</p>
          {target && onShow && (
            <button
              type="button"
              data-game-button="secondary"
              className="island-quest__show"
              onClick={() => onShow(target.q, target.r)}
            >
              {t("island.show")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
