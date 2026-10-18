// Окно «Письмо о турнирах»: своё название серии (необязательно, например
// «9 королей»), турниры галочками и «Сгенерировать».
//
// Вид — как форма письма: снизу листом на телефоне, у верха на ПК; шапка и
// кнопка закреплены, список прокручивается свой. Время — по UTC, как в
// расписании турниров.
import { Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { tourMetricKey } from "@/lib/tournament/types";
import type { TourLetterSourceRow } from "@/lib/tourLetter";
import { plannedEnd } from "@/components/admin/tournaments/tourSchedule";
import { errText, fmtUtc } from "@/components/admin/tournaments/tourText";
import { CAP, FIELD } from "./letterCls";

export function TourLetterPick({
  rows,
  loading,
  error,
  series,
  onSeries,
  picked,
  onToggle,
  onGenerate,
  onClose,
}: {
  rows: readonly TourLetterSourceRow[];
  loading: boolean;
  error: unknown;
  series: string;
  onSeries: (v: string) => void;
  picked: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const count = rows.filter((r) => picked.has(r.id)).length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-start sm:p-4 sm:pt-[6vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex-1 truncate font-display text-lg font-bold">Письмо о турнирах</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("letter.adm.close")}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <label className="block">
            <span className={CAP}>Название</span>
            <input
              value={series}
              maxLength={60}
              onChange={(e) => onSeries(e.target.value)}
              className={cn(FIELD, "h-10")}
            />
          </label>

          <div>
            <span className={CAP}>Турниры</span>
            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-gold" />
              </div>
            )}
            {!!error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {errText(error, t)}
              </p>
            )}
            {!loading && !error && rows.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Нет запланированных и идущих турниров
              </p>
            )}
            <div className="space-y-1.5">
              {rows.map((r) => {
                const on = picked.has(r.id);
                const end = plannedEnd(r.startAt, r.endAt, r.days);
                return (
                  <label
                    key={r.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition",
                      on ? "border-gold/50 bg-gold/10" : "border-border bg-background",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(r.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.name}</span>
                        {r.status === "running" && (
                          <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                            идёт
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t(tourMetricKey(r.metric))} · {fmtUtc(r.startAt, lang)} →{" "}
                        {fmtUtc(end, lang)} UTC
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={count === 0 || loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-gold font-semibold text-gold-foreground disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> Сгенерировать
            {count > 0 && <span className="tabular-nums opacity-80">· {count}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
