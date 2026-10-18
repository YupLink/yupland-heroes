// Окно «Таблица» турнира: места участников, тап по строке — его очки
// (доказательство счёта), «назад» — снова к таблице.
//
// Окно — листом снизу на телефоне и у верха на ПК; шапка закреплена,
// тело прокручивается своё (как у формы турнира).
import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { tourMetricKey, type TourAdminRow } from "@/lib/tournament/types";
import { TourBoardList, type BoardPick } from "./TourBoardList";
import { TourPointsList } from "./TourPointsList";

export function TourBoardModal({ tour, onClose }: { tour: TourAdminRow; onClose: () => void }) {
  const t = useT();
  const [pick, setPick] = useState<BoardPick | null>(null);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[6vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card pb-[calc(env(safe-area-inset-bottom)+12px)] sm:rounded-2xl sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          {pick && (
            <button
              type="button"
              onClick={() => setPick(null)}
              aria-label={t("tour.adm.back")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg font-bold">
              {pick ? t("tour.adm.pts_title", { name: pick.name }) : tour.name}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {t(tourMetricKey(tour.metric))} · {t("tour.adm.players", { n: tour.players })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("tour.adm.close")}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
          {pick ? (
            <TourPointsList tourId={tour.id} accountId={pick.accountId} />
          ) : (
            <TourBoardList tourId={tour.id} status={tour.status} onPick={setPick} />
          )}
        </div>
      </div>
    </div>
  );
}
