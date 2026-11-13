// Обряд шамана в блоке мира (владелец, 28.10.2026): выбрать, за что (уровень из тех,
// что могут выпасть, или теплее / холоднее), и провести — шаман из хижины тратится,
// выбранному +3 % на ближайшую смену. Один обряд с аккаунта за смену в каждом мире.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { RITUAL_PCT, type RitualTarget } from "@/lib/raid/weatherRitual";
import { castWeatherRitual } from "@/server/api/weather-station/wstation-ritual";
import type { StationWorld } from "@/server/api/weather-station/wstation-list";
import { WEATHER_STATION_WORLDS_KEY } from "./useWeatherStation";

const targetKey = (t: RitualTarget) => `wstation.target.${t}`;

export function WeatherRitual({ w, mine, shamans }: {
  w: StationWorld;
  /** Свой обряд в этом мире в эту смену. */
  mine: RitualTarget | null;
  shamans: number;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<RitualTarget | null>(null);
  const [opId, setOpId] = useState(newOpId);
  const cast = useMutation({
    mutationFn: (target: RitualTarget) => castWeatherRitual({ data: { mapId: w.mapId, target, opId } }),
    onSuccess: () => {
      toast.success(t("wstation.ritual_ok", { n: RITUAL_PCT }));
      setOpen(false);
      setPick(null);
      setOpId(newOpId());
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: WEATHER_STATION_WORLDS_KEY }),
  });
  // Ответ из кэша прежней версии (до обряда) — без votes/targets: не падаем.
  const targets = w.targets ?? [];
  const voted = Object.entries(w.votes ?? {}).filter(([, n]) => (n ?? 0) > 0) as [RitualTarget, number][];

  return (
    <div className="space-y-1">
      {voted.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t("wstation.votes")}{" "}
          {voted.map(([k, n]) => `${t(targetKey(k))} ${n}`).join(" · ")}
        </p>
      )}
      {mine ? (
        <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-300">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t("wstation.ritual_mine", { what: t(targetKey(mine)), n: RITUAL_PCT })}
        </p>
      ) : !open ? (
        <button
          type="button"
          data-game-button="secondary"
          disabled={shamans <= 0 || targets.length === 0}
          onClick={() => setOpen(true)}
          className="flex min-h-9 items-center gap-1 rounded-lg border px-2 text-xs disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t("wstation.ritual")}
        </button>
      ) : (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("wstation.ritual")}>
            {targets.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={pick === k}
                onClick={() => setPick(k)}
                className={`min-h-9 rounded-lg border px-2 text-xs ${pick === k ? "border-amber-300 text-amber-300" : ""}`}
              >
                {t(targetKey(k))}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              data-game-button="primary"
              disabled={!pick || cast.isPending}
              onClick={() => pick && cast.mutate(pick)}
              className="flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold disabled:opacity-50"
            >
              {cast.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t("wstation.ritual_go", { n: RITUAL_PCT })}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-lg px-2 text-xs">
              {t("wstation.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
