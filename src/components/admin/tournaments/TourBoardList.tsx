// Таблица турнира для админки: места по 20 с «Ещё 20», у каждой строки —
// аккаунт (adminTourTable), тап открывает очки участника.
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { TOUR_PAGE, type TourStatus } from "@/lib/tournament/types";
import { adminTourTable } from "@/server/api/tournament/tour-admin";
import { errText, fmtNum } from "./tourText";

export type BoardPick = { accountId: string; name: string };

export function TourBoardList({
  tourId,
  status,
  onPick,
}: {
  tourId: string;
  status: TourStatus;
  onPick: (p: BoardPick) => void;
}) {
  const t = useT();
  const lang = useLang();
  const q = useInfiniteQuery({
    queryKey: ["admin-tour-table", tourId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => adminTourTable({ data: { id: tourId, offset: pageParam } }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((s, p) => s + (Array.isArray(p.rows) ? p.rows.length : 0), 0);
      return loaded < (Number(last.total) || 0) && last.rows.length > 0 ? loaded : undefined;
    },
    // Итог завершённого не меняется; у идущего счёт живой.
    refetchInterval: status === "running" ? 30_000 : false,
    staleTime: 0,
  });
  const rows = (q.data?.pages ?? []).flatMap((p) => (Array.isArray(p.rows) ? p.rows : []));
  const total = Number(q.data?.pages[0]?.total) || 0;

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </div>
    );
  }
  if (q.isError && rows.length === 0) {
    return <p className="py-4 text-center text-xs text-destructive">{errText(q.error, t)}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t("tour.adm.board_empty")}</p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li key={r.accountId}>
            <button
              type="button"
              onClick={() => onPick({ accountId: r.accountId, name: r.name })}
              className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-secondary/40"
            >
              <span className="w-9 shrink-0 text-center font-semibold text-gold">{r.place}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="shrink-0 font-semibold">{fmtNum(r.score, lang)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <button
          type="button"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-secondary text-sm font-medium disabled:opacity-60"
        >
          {q.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("tour.adm.more", { n: Math.min(TOUR_PAGE, Math.max(0, total - rows.length)) })}
        </button>
      )}
    </div>
  );
}
