// Форма турнира: название, дни, начало и конец (UTC), категория (у «Зелий
// скорости» — ещё и какие зелья), цена записи, строки «места → призы». Заданы
// начало и конец — дни считаются из них, поле «Дней» показывает итог и не правится.
//
// Цена записи — тем же редактором строк, что у портала (берутся все разом),
// со списком токенов из того же справочника, что в редакторе карт; ресурсы —
// только те, которыми запись можно оплатить.
//
// Окно — как у редактора заклинаний: снизу листом на телефоне; на ПК — у
// верха, а не по центру: форма растёт с каждым призом, и центрированное окно
// уезжало бы из-под курсора. Шапка и «Сохранить» закреплены, тело
// прокручивается своё.
// Ошибку (tour.err.*) показываем после первой попытки сохранить — пустая
// новая форма не должна сразу кричать «нужно название».
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { fundDarai, prizePlaces } from "@/lib/tournament/places";
import { TOUR_MAX_DAYS, TOUR_METRICS, tourMetricKey } from "@/lib/tournament/types";
import { TOUR_ENTRY_RESOURCES } from "@/lib/tournament/entryPrice";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { PortalPricesEditor } from "@/components/admin/hex-editor/PortalPricesEditor";
import { TourBandRow } from "./TourBandRow";
import { TourScheduleFields } from "./TourScheduleFields";
import { TourPotionPick } from "@/components/admin/tournaments/TourPotionPick";
import { CAP, FIELD } from "./tourCls";
import { spanDays } from "./tourSchedule";
import {
  bandsOfDraft,
  draftError,
  nextBandPlaces,
  prizeOfUiKind,
  type TourDraft,
} from "./tourDraft";
import { fmtNum } from "./tourText";

export function TourEditor({
  value,
  onChange,
  onSave,
  saving,
  onClose,
}: {
  value: TourDraft;
  onChange: (next: TourDraft) => void;
  onSave: () => void;
  saving: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [tried, setTried] = useState(false);
  const patch = (p: Partial<TourDraft>) => onChange({ ...value, ...p });
  const err = draftError(value, Date.now());
  const span = spanDays(value.startAt, value.endAt);
  const bands = bandsOfDraft(value);
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x) => x.symbol);
  // Переход на «Зелья скорости» без выбранных зелий — «не выбирали» (undefined):
  // выбор зелий подставит «Дурман зелье», когда справочник догрузится.
  const pickMetric = (m: TourDraft["metric"]) =>
    patch(
      m === "potion_drink" && value.metric !== m && !value.items?.length
        ? { metric: m, items: undefined }
        : { metric: m },
    );

  const submit = () => {
    setTried(true);
    if (!err) onSave();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[6vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex-1 truncate font-display text-lg font-bold">
            {value.id ? t("tour.adm.edit_title") : t("tour.adm.new")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("tour.adm.close")}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <label className="min-w-0">
              <span className={CAP}>{t("tour.adm.f_name")}</span>
              <input
                value={value.name}
                maxLength={80}
                onChange={(e) => patch({ name: e.target.value })}
                className={FIELD}
              />
            </label>
            <label>
              <span className={CAP}>{t("tour.adm.f_days")}</span>
              <input
                type="number"
                min={1}
                max={TOUR_MAX_DAYS}
                inputMode="numeric"
                value={span !== null ? String(span) : value.days}
                disabled={span !== null}
                onChange={(e) => patch({ days: e.target.value })}
                className={cn(FIELD, "disabled:opacity-60")}
              />
            </label>
          </div>

          <TourScheduleFields value={value} onPatch={patch} />

          <div>
            <span className={CAP}>{t("tour.adm.f_metric")}</span>
            <div className="flex flex-wrap gap-1">
              {TOUR_METRICS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMetric(m)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-sm font-medium transition",
                    value.metric === m
                      ? "border-gold/50 bg-gold/15 text-gold"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(tourMetricKey(m))}
                </button>
              ))}
            </div>
          </div>

          {value.metric === "potion_drink" && (
            <TourPotionPick value={value.items} onChange={(items) => patch({ items })} />
          )}

          <PortalPricesEditor
            prices={value.entryPrice}
            tokens={tokens}
            onChange={(entryPrice) => patch({ entryPrice })}
            title="Цена записи"
            resources={TOUR_ENTRY_RESOURCES}
            emptyText="Запись бесплатная"
          />

          <div className="space-y-2">
            {value.bands.map((b, i) => (
              <TourBandRow
                key={i}
                band={b}
                onChange={(next) =>
                  patch({ bands: value.bands.map((x, j) => (j === i ? next : x)) })
                }
                onRemove={() => patch({ bands: value.bands.filter((_, j) => j !== i) })}
              />
            ))}
            <button
              type="button"
              onClick={() =>
                patch({
                  bands: [
                    ...value.bands,
                    { places: nextBandPlaces(value.bands), prizes: [prizeOfUiKind("darai")] },
                  ],
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-gold"
            >
              <Plus className="h-3.5 w-3.5" /> {t("tour.adm.add_band")}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("tour.adm.sum", {
              fund: fmtNum(fundDarai(bands), lang),
              places: prizePlaces(bands),
            })}
          </p>
        </div>

        <div className="space-y-2 border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          {tried && err && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {t(err)}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-gold font-semibold text-gold-foreground shadow-gold disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("tour.adm.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
