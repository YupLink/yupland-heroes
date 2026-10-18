// Плашка турнира — весь турнир одним блоком (владелец, 05.10.2026).
// Заголовок целиком — кнопка раскрытия: название, категория, сколько осталось
// (у прошлого — дата, у запланированного — старт и конец по UTC), участники
// (записавшиеся); справа — моё место и шеврон. Под заголовком всегда строка
// статуса: запись или «Вы участвуете · место · очки» (TourJoinBar). Раскрытая —
// вкладки «Участники | Условия | Призы» (TourCardTabs).
import { useLayoutEffect, useRef } from "react";
import { CalendarClock, ChevronDown, Clock, Flag, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { tourMetricKey, type TourPlate } from "@/lib/tournament/types";
import { TourCardTabs } from "./TourCardTabs";
import { TourJoinBar } from "./TourJoinBar";
import { plateLeftLabel } from "./tourView";
import { utcStamp } from "./tourJoin";

export function TourPlateCard({
  q,
  r,
  plate,
  now,
  open,
  onToggle,
}: {
  q: number;
  r: number;
  plate: TourPlate;
  now: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const done = plate.status === "done";
  const left = plateLeftLabel(plate, now);
  const ended =
    done && plate.finishedAt
      ? t("tour.ended", {
          date: new Date(plate.finishedAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
            day: "numeric",
            month: "short",
          }),
        })
      : null;
  const soon = plate.status === "draft";
  const startAt = soon ? utcStamp(plate.startAt, lang) : null;
  const endAt = soon ? utcStamp(plate.endAt, lang) : null;
  // Раскрыли эту — свернулась раскрытая выше, и заголовок уехал за верх окна
  // (в WKWebView привязки прокрутки нет вовсе): возвращаем его в вид.
  // Заголовок и так виден — «nearest» ничего не двигает.
  const headRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (open) headRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div
      className={cn("rounded-2xl border bg-card/60", done ? "border-border/60" : "border-gold/30")}
    >
      <button
        ref={headRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full scroll-mt-3 items-center gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{plate.name}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {t(tourMetricKey(plate.metric))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {left && (
              <span className={cn("inline-flex items-center gap-1", !done && "text-gold/90")}>
                <Clock className="h-3 w-3" />
                {t(left.key, left.params)}
              </span>
            )}
            {startAt && (
              <span className="inline-flex items-center gap-1 text-gold/90">
                <CalendarClock className="h-3 w-3" />
                {t("tour.starts", { at: startAt })}
              </span>
            )}
            {endAt && (
              <span className="inline-flex items-center gap-1">
                <Flag className="h-3 w-3" />
                {t("tour.ends", { at: endAt })}
              </span>
            )}
            {ended && (
              <span className="inline-flex items-center gap-1">
                <Flag className="h-3 w-3" />
                {ended}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              aria-label={t("tour.players", { n: plate.players })}
            >
              <Users className="h-3 w-3" />
              {plate.players}
            </span>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {plate.myPlace != null && (
            <span
              className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-display text-xs font-bold tabular-nums text-gold"
              aria-label={t("tour.my_place", { n: plate.myPlace })}
            >
              #{plate.myPlace}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground transition-transform",
              open && "rotate-180 text-gold",
            )}
          />
        </span>
      </button>
      <TourJoinBar q={q} r={r} plate={plate} now={now} />
      {open && <TourCardTabs q={q} r={r} plate={plate} />}
    </div>
  );
}
