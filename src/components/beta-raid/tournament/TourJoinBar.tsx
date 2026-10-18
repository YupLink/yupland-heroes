// Строка статуса под заголовком плашки турнира: «Записаться · 5 золота» (цена —
// у турнира; бесплатная — просто «Записаться») или «✓ Вы участвуете · место 4 ·
// 1 830 очков» (без очков — «очков пока нет»). Что показать — решает
// statusLine (tourView.ts); нечего — ничего не рисуем.
import { CheckCircle2, Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { tourEntryPriceLabel } from "@/lib/tournament/entryPrice";
import type { TourPlate } from "@/lib/tournament/types";
import { formatScore, pointsKey, statusLine } from "./tourView";
import { useTourJoin } from "./useTourJoin";

export function TourJoinBar({
  q,
  r,
  plate,
  now,
}: {
  q: number;
  r: number;
  plate: TourPlate;
  now: number;
}) {
  const t = useT();
  const lang = useLang();
  const join = useTourJoin(q, r);
  const view = statusLine(plate, now);
  if (!view) return null;

  if (view.kind !== "join") {
    const tail =
      view.kind === "ranked"
        ? [
            t("tour.place_n", { n: view.place }),
            t(pointsKey(view.score, lang), { n: formatScore(view.score, lang) }),
          ]
        : view.kind === "unranked"
          ? [t("tour.no_points")]
          : [];
    return (
      <div className="flex items-start gap-1.5 border-t border-border/50 px-3 py-2 text-xs">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        <span className="min-w-0 leading-4">
          <span className="font-semibold text-emerald-400">{t("tour.joined")}</span>
          {tail.length > 0 && (
            <span className="tabular-nums text-foreground/90">{` · ${tail.join(" · ")}`}</span>
          )}
        </span>
      </div>
    );
  }

  const price = tourEntryPriceLabel(view.price, lang);
  return (
    <div className="border-t border-border/50 p-2.5">
      <button
        type="button"
        onClick={() => join.mutate({ id: plate.id, price: view.price })}
        disabled={join.isPending}
        className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-4 py-1.5 text-sm font-bold text-gold-foreground transition disabled:opacity-60"
      >
        {join.isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
        {/* Цена из нескольких строк на телефоне переносится, а не обрезается. */}
        <span className="min-w-0 text-center leading-tight">
          {price ? t("tour.join", { price }) : t("tour.join_free")}
        </span>
      </button>
    </div>
  );
}
