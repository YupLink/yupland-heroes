import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudSun, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import {
  adminGetWeatherEffects,
  adminSetWeatherEffects,
} from "@/server/api/beta-raid/weather/weather-admin";

const queryKey = ["admin-weather-effects"];

export function WeatherAdminCard() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<boolean | null>(null);
  const setting = useQuery({ queryKey, queryFn: () => adminGetWeatherEffects(), staleTime: 0 });
  const save = useMutation({
    mutationFn: (enabled: boolean) => adminSetWeatherEffects({ data: { enabled } }),
    onSuccess: (result) => {
      qc.setQueryData(queryKey, result);
      setDraft(null);
      void qc.invalidateQueries({ queryKey, refetchType: "all" });
      toast.success("Сохранено. Изменение действует со следующей смены погоды.");
    },
    onError: (error: Error) => toast.error(humanError(error)),
  });
  const enabled = draft ?? setting.data?.enabled ?? false;
  const ready = !!setting.data && !setting.isError && !setting.isFetching;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      aria-labelledby="weather-admin-title"
    >
      <h2
        id="weather-admin-title"
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <CloudSun className="h-4 w-4 shrink-0" aria-hidden="true" /> Влияние погоды и температуры
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Общая настройка для всех карт с погодой. Меняет рыбалку, добычу и стоимость передвижения.
      </p>
      {setting.isPending ? (
        <p role="status" className="text-sm">
          Загрузка настройки…
        </p>
      ) : setting.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{humanError(setting.error)}</p>
          <button
            type="button"
            disabled={setting.isFetching}
            onClick={() => void setting.refetch()}
            className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
          >
            Повторить
          </button>
        </div>
      ) : (
        <>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!ready || save.isPending}
              onChange={(event) => setDraft(event.target.checked)}
              className="h-5 w-5 accent-yellow-500"
            />
            Применять влияние погоды
          </label>
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            Сохранённая настройка: {setting.data.enabled ? "включено" : "выключено"}.
          </p>
          <button
            type="button"
            disabled={!ready || save.isPending || enabled === setting.data.enabled}
            onClick={() => save.mutate(enabled)}
            className="mt-3 flex min-h-11 items-center gap-2 rounded-xl gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </button>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Применится со следующей смены погоды (днём раз в 2 ч, ночью раз в 4 ч, Мск). Текущая погода
        и прошлые начисления останутся прежними. На островах новичков погоды нет.
      </p>
    </section>
  );
}
