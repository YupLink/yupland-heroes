// Плашка турнира в админке: что за турнир, сколько идёт, сколько людей и
// фонд DARAI, места → призы; внизу — действия по статусу. «Остановить» и
// «Удалить» переспрашивают прямо на плашке: окно поверх ради одного «да»
// на телефоне только мешает.
//
// Время — по UTC (владелец, 04.10). Черновик с началом стартует сам
// («Автостарт …»), кнопки «Запустить» у него нет; не вышло (пула не хватило) —
// причина красным (last_error), тикер пробует снова.
//
// Цена записи — в строке сводки коротко, той же строкой, что видит игрок у
// Арены: «запись 5 золота», пусто — «запись бесплатная».
import { useState } from "react";
import { ListOrdered, Loader2, Pencil, Play, Square, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { TOUR_LIVE, tourMetricKey, type TourAdminRow } from "@/lib/tournament/types";
import { tourEntryPriceLabel } from "@/lib/tournament/entryPrice";
import { timeLeft } from "./tourList";
import { plannedEnd } from "./tourSchedule";
import { errText, fmtNum, fmtUtc, leftText, prizeText } from "./tourText";

const STATUS_CLS: Record<TourAdminRow["status"], string> = {
  draft: "bg-secondary text-muted-foreground",
  running: "bg-emerald-500/15 text-emerald-400",
  paying: "bg-gold/15 text-gold",
  done: "bg-secondary text-muted-foreground",
};

const BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium disabled:opacity-50";

export function TourPlate({
  row,
  now,
  busy,
  onStart,
  onStop,
  onDelete,
  onEdit,
  onBoard,
}: {
  row: TourAdminRow;
  now: number;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onBoard: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [ask, setAsk] = useState<"stop" | "delete" | null>(null);
  const left = timeLeft(row.endsAt, now);
  const planEnd = plannedEnd(row.startAt, row.endAt, row.days);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold">{row.name}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                STATUS_CLS[row.status],
              )}
            >
              {t(`tour.adm.status_${row.status}`)}
            </span>
            {/* Проверка: очки копятся, пул и призы не трогаются, игрокам не виден. */}
            {(row.status === "draft" ? !TOUR_LIVE : row.dry) && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                {t("tour.adm.dry")}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t(tourMetricKey(row.metric))} · {t("tour.adm.days", { n: row.days })} ·{" "}
            {t("tour.adm.players", { n: row.players })} ·{" "}
            {t("tour.adm.fund", { n: fmtNum(row.fundDarai, lang) })} ·{" "}
            {row.entryPrice.length > 0
              ? t("tour.adm.entry", { v: tourEntryPriceLabel(row.entryPrice, lang) })
              : t("tour.adm.entry_free")}
          </div>
          {row.status === "running" && (
            <div className="text-[11px] text-emerald-400">
              {left ? t("tour.adm.left", { v: leftText(left, t) }) : t("tour.adm.left_over")}
              {row.startedAt
                ? ` · ${t("tour.adm.started_at", { v: fmtUtc(row.startedAt, lang) })}`
                : ""}
              {row.endsAt ? ` · ${t("tour.adm.ends_at", { v: fmtUtc(row.endsAt, lang) })}` : ""}
            </div>
          )}
          {row.status === "draft" && row.startAt && (
            <div className="text-[11px] text-gold">
              {t("tour.adm.auto_start", { v: fmtUtc(row.startAt, lang) })}
              {planEnd ? ` · ${t("tour.adm.ends_at", { v: fmtUtc(planEnd, lang) })}` : ""}
            </div>
          )}
          {row.status === "draft" && row.lastError && (
            <div className="text-[11px] text-destructive">{errText(row.lastError, t)}</div>
          )}
          {(row.status === "done" || row.status === "paying") && row.finishedAt && (
            <div className="text-[11px] text-muted-foreground">
              {t("tour.adm.finished_at", { v: fmtUtc(row.finishedAt, lang) })}
            </div>
          )}
        </div>
      </div>

      {row.bands.length > 0 && (
        <ul className="space-y-0.5 rounded-lg bg-secondary/30 px-2.5 py-1.5 text-[11px]">
          {row.bands.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-10 shrink-0 font-semibold text-gold">{b.places}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">
                {b.prizes.map((p) => prizeText(p, t, lang)).join(" + ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {ask ? (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5">
          <p className="text-xs">{t(ask === "stop" ? "tour.adm.stop_q" : "tour.adm.delete_q")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (ask === "stop") onStop();
                else onDelete();
                setAsk(null);
              }}
              className={cn(BTN, "bg-destructive text-destructive-foreground")}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t(ask === "stop" ? "tour.adm.stop_yes" : "tour.adm.delete_yes")}
            </button>
            <button type="button" onClick={() => setAsk(null)} className={cn(BTN, "bg-secondary")}>
              {t("tour.adm.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {row.status === "draft" && (
            <>
              {!row.startAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onStart}
                  className={cn(BTN, "gradient-gold text-gold-foreground shadow-gold")}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {t(TOUR_LIVE ? "tour.adm.start" : "tour.adm.start_dry")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={onEdit}
                className={cn(BTN, "bg-secondary")}
              >
                <Pencil className="h-4 w-4" /> {t("tour.adm.edit")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAsk("delete")}
                className={cn(BTN, "bg-secondary text-destructive")}
              >
                <Trash2 className="h-4 w-4" /> {t("tour.adm.delete")}
              </button>
            </>
          )}
          {row.status === "running" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsk("stop")}
              className={cn(BTN, "bg-destructive/15 text-destructive")}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              {t("tour.adm.stop")}
            </button>
          )}
          {row.status !== "draft" && (
            <button type="button" onClick={onBoard} className={cn(BTN, "bg-secondary")}>
              <ListOrdered className="h-4 w-4" /> {t("tour.adm.board")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
