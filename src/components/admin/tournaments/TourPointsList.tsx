// Очки участника — доказательство счёта: каждое засчитанное событие строкой
// (ref — за что, сколько, когда), последние 200 (adminTourPoints).
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import type { TourPointRow } from "@/lib/tournament/types";
import { adminTourPoints } from "@/server/api/tournament/tour-admin";
import { errText, fmtDate, fmtNum } from "./tourText";

export function TourPointsList({ tourId, accountId }: { tourId: string; accountId: string }) {
  const t = useT();
  const lang = useLang();
  const q = useQuery({
    queryKey: ["admin-tour-points", tourId, accountId],
    queryFn: async (): Promise<TourPointRow[]> =>
      adminTourPoints({ data: { id: tourId, accountId } }),
    staleTime: 0,
  });
  const rows = Array.isArray(q.data) ? q.data : [];
  const sum = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </div>
    );
  }
  if (q.isError)
    return <p className="py-4 text-center text-xs text-destructive">{errText(q.error, t)}</p>;
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t("tour.adm.pts_empty")}</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] text-muted-foreground">{accountId}</p>
      <p className="text-xs text-muted-foreground">
        {t("tour.adm.pts_total", { n: rows.length, sum: fmtNum(sum, lang) })}
      </p>
      <ul className="divide-y divide-border/60 text-xs">
        {rows.map((r) => (
          <li key={r.ref} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{r.ref}</span>
            <span className="shrink-0 font-semibold text-gold">+{fmtNum(r.qty, lang)}</span>
            <span className="w-[88px] shrink-0 text-right text-muted-foreground">
              {fmtDate(r.at, lang)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
