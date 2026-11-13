// Шансы смены погоды (владелец, 28.10.2026): из какой погоды в какую и куда пойдёт
// температура на следующую смену. Остаток до 100 % — «останется той же», считается сам.
// Действует со следующей смены погоды; уже выпавшая погода не меняется.
// Мир (31.10.2026, «погоду по мирам настраивать»): у мира свои шансы поверх общих;
// «Как у всех» — мир снова на общих. Климат мира (05.11.2026) — диапазоны температуры и
// погоды, аномалии — тут же, одной кнопкой «Сохранить» (WeatherClimateFields).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { WEATHER_LEVELS } from "@/lib/raid/weather";
import { weatherOddsError, type WeatherOdds } from "@/lib/raid/weatherOdds";
import {
  WEATHER_CLIMATE_DEFAULT,
  isDefaultClimate,
  weatherClimateError,
  type WeatherClimate,
} from "@/lib/raid/weatherClimate";
import { weatherClimateStats } from "@/lib/raid/weatherClimateStats";
import {
  adminGetWeatherOdds,
  adminResetWorldWeatherOdds,
  adminSetWeatherOdds,
} from "@/server/api/beta-raid/weather/weather-odds-admin";
import { adminSetWeatherClimate } from "@/server/api/beta-raid/weather/weather-climate-admin";
import { WeatherOddsFields } from "./WeatherOddsFields";
import { WeatherClimateFields } from "./WeatherClimateFields";

const ODDS_KEY = "admin-weather-odds";
type Key = keyof WeatherOdds;

const sameClimate = (a: WeatherClimate, b: WeatherClimate) =>
  a.tempMin === b.tempMin &&
  a.tempMax === b.tempMax &&
  a.anomaly === b.anomaly &&
  a.levels.join() === b.levels.join();

const LEVEL_RU = { clear: "ясно", overcast: "пасмурно", storm: "шторм" } as const;
const fmt = (n: number) =>
  Number.isFinite(n) ? String(Math.round(n * 10) / 10).replace(".", ",") : "∞";

export function WeatherOddsCard() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<WeatherOdds | null>(null);
  const [climateDraft, setClimateDraft] = useState<WeatherClimate | null>(null);
  const [mapId, setMapId] = useState("");
  const queryKey = [ODDS_KEY, mapId];
  const q = useQuery({
    queryKey,
    queryFn: () => adminGetWeatherOdds({ data: { mapId: mapId || null } }),
    staleTime: 0,
    // Список миров не мигает, пока читаются шансы другого мира.
    placeholderData: (prev) => prev,
  });
  const done = () => {
    setDraft(null);
    setClimateDraft(null);
    void qc.invalidateQueries({ queryKey: [ODDS_KEY], refetchType: "all" });
    toast.success("Сохранено. Действует со следующей смены погоды.");
  };
  const save = useMutation({
    mutationFn: async () => {
      if (draft && oddsChanged)
        await adminSetWeatherOdds({ data: { ...draft, mapId: mapId || null } });
      if (climateDraft && climateChanged && mapId)
        await adminSetWeatherClimate({
          data: { mapId, ...climateDraft, levels: [...climateDraft.levels] },
        });
    },
    onSuccess: done,
    onError: (error: Error) => toast.error(humanError(error)),
  });
  const reset = useMutation({
    mutationFn: () => adminResetWorldWeatherOdds({ data: { mapId } }),
    onSuccess: done,
    onError: (error: Error) => toast.error(humanError(error)),
  });

  const saved = q.data?.odds;
  const odds = draft ?? saved;
  const set = (k: Key, v: number) => odds && setDraft({ ...odds, [k]: v });
  const savedClimate = mapId ? (q.data?.climate ?? null) : null;
  const climate = climateDraft ?? savedClimate;
  const error =
    (odds ? weatherOddsError(odds) : null) ?? (climate ? weatherClimateError(climate) : null);
  const busy = !saved || q.isFetching || save.isPending || reset.isPending;
  const oddsChanged =
    !!draft && !!saved && (Object.keys(saved) as Key[]).some((k) => draft[k] !== saved[k]);
  const climateChanged =
    !!climateDraft && !!savedClimate && !sameClimate(climateDraft, savedClimate);
  const changed = oddsChanged || climateChanged;
  const stats =
    odds && !error ? weatherClimateStats(odds, climate ?? WEATHER_CLIMATE_DEFAULT) : null;
  // Климат мира урезал уровни — в сводке только те, что бывают.
  const shown = WEATHER_LEVELS.filter(
    (l) => !stats || !climate || isDefaultClimate(climate) || stats.share[l] > 0.05,
  );

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      aria-labelledby="weather-odds-title"
    >
      <h2
        id="weather-odds-title"
        className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Shuffle className="h-4 w-4 shrink-0" aria-hidden="true" /> Смена погоды: шансы на следующую
        смену
      </h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Мир"
          value={mapId}
          onChange={(e) => {
            setDraft(null);
            setClimateDraft(null);
            setMapId(e.target.value);
          }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">Все миры (общие)</option>
          {(q.data?.worlds ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        {mapId && q.data && (
          <span className="text-xs text-muted-foreground">
            {q.data.own ? "свои" : "как у всех"}
          </span>
        )}
      </div>
      {q.isPending ? (
        <p role="status" className="text-sm">
          Загрузка…
        </p>
      ) : q.isError || !odds ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{humanError(q.error)}</p>
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="rounded-lg border border-border px-3 py-2"
          >
            Повторить
          </button>
        </div>
      ) : (
        <>
          {climate && (
            <WeatherClimateFields climate={climate} set={setClimateDraft} disabled={busy} />
          )}
          <WeatherOddsFields odds={odds} set={set} disabled={busy} />
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : (
            stats && (
              <p className="mt-3 text-xs text-muted-foreground" role="status">
                Доля времени:{" "}
                {shown.map((l) => `${LEVEL_RU[l]} ${fmt(stats.share[l])} %`).join(" · ")}
                {stats.anomaly > 0 ? ` · аномалия ${fmt(stats.anomaly)} %` : ""}. Держится в
                среднем: {shown.map((l) => `${LEVEL_RU[l]} ${fmt(stats.hours[l])} ч`).join(" · ")}.
              </p>
            )
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !changed || !!error}
              onClick={() => save.mutate()}
              className="flex min-h-11 items-center gap-2 rounded-xl gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {save.isPending ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (q.data) setDraft({ ...q.data.defaults });
                if (savedClimate) setClimateDraft({ ...WEATHER_CLIMATE_DEFAULT });
              }}
              className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              По умолчанию
            </button>
            {mapId && q.data?.own && (
              <button
                type="button"
                disabled={busy}
                onClick={() => reset.mutate()}
                className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
              >
                Как у всех
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
