// Участники турнира прямо в плашке (вкладка «Участники»): места по 20 и «Ещё
// 20», за местами — записавшиеся без очков («—»). Моя строка выделена, а если
// я ниже загруженного — закреплена под таблицей. Запрос живёт, только пока
// вкладка открыта: живой турнир обновляется раз в TOUR_REFRESH_MS, прошлый —
// итог по местам, без обновления.
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { errText } from "@/lib/tournament/errText";
import { getTourTable } from "@/server/api/tournament/tour-read";
import { TOUR_PAGE, type TourPlate } from "@/lib/tournament/types";
import { TourRow } from "./TourRow";
import { mergeTourPages, nextTourOffset, TOUR_REFRESH_MS } from "./tourView";

export function TourTable({ q, r, plate }: { q: number; r: number; plate: TourPlate }) {
  const t = useT();
  const lang = useLang();
  const table = useInfiniteQuery({
    queryKey: ["tour-table", q, r, plate.id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getTourTable({ data: { q, r, id: plate.id, offset: pageParam } }),
    getNextPageParam: (_last, all) => nextTourOffset(all),
    // Завершённый турнир не меняется — перезапрашивать незачем.
    refetchInterval: plate.status === "done" ? false : TOUR_REFRESH_MS,
    retry: false,
  });

  const view = mergeTourPages(table.data?.pages ?? []);
  const you = t("tour.you");

  if (table.isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (table.error && !table.data) {
    return (
      <div className="space-y-2 py-2 text-center">
        <p className="text-xs text-destructive">{errText(table.error, t)}</p>
        <button
          type="button"
          onClick={() => void table.refetch()}
          className="min-h-11 rounded-xl border border-border px-4 text-xs"
        >
          {t("tour.retry")}
        </button>
      </div>
    );
  }
  if (view.rows.length === 0 && !view.mine) {
    return (
      <p className="py-3 text-center text-xs text-muted-foreground">{t("tour.table_empty")}</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {view.rows.length > 0 && (
        <div className="space-y-0.5">
          {view.rows.map((row, i) => (
            <TourRow key={i} row={row} youLabel={you} lang={lang} />
          ))}
        </div>
      )}
      {view.hasMore && (
        <button
          type="button"
          onClick={() => void table.fetchNextPage()}
          disabled={table.isFetchingNextPage}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gold/30 bg-gold/5 text-xs font-medium text-gold transition hover:bg-gold/10 disabled:opacity-60"
        >
          {table.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("tour.more", { n: Math.min(TOUR_PAGE, view.total - view.rows.length) })}
        </button>
      )}
      {view.mine && (
        <div className="border-t border-dashed border-border/60 pt-1.5">
          <TourRow row={view.mine} youLabel={you} lang={lang} />
        </div>
      )}
    </div>
  );
}
