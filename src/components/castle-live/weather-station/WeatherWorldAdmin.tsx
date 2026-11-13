// Админ в метеостанции (владелец, 29.10.2026): переименовать мир (имя меняется везде в
// игре) и скрыть мир из станции (тестовые миры). Игроки этих кнопок не видят.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { adminRenameWorld, adminSetWorldHidden } from "@/server/api/weather-station/wstation-admin";
import type { StationWorld } from "@/server/api/weather-station/wstation-list";
import { WEATHER_STATION_WORLDS_KEY } from "./useWeatherStation";

export function WeatherWorldAdmin({ w, onRename }: { w: StationWorld; onRename: (on: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: WEATHER_STATION_WORLDS_KEY });
  const hide = useMutation({
    mutationFn: (hidden: boolean) => adminSetWorldHidden({ data: { mapId: w.mapId, hidden } }),
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: refresh,
  });
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label={t("wstation.rename")}
        onClick={() => onRename(true)}
        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t(w.hidden ? "wstation.show" : "wstation.hide")}
        disabled={hide.isPending}
        onClick={() => hide.mutate(!w.hidden)}
        className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {hide.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : w.hidden ? (
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}

/** Поле нового имени мира: Enter или «Сохранить», Esc или «Отмена». */
export function WeatherWorldRename({ w, onDone }: { w: StationWorld; onDone: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(w.name);
  const save = useMutation({
    mutationFn: () => adminRenameWorld({ data: { mapId: w.mapId, name: name.trim() } }),
    onSuccess: () => {
      toast.success(t("wstation.renamed"));
      onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: WEATHER_STATION_WORLDS_KEY }),
  });
  const ok = name.trim().length > 0 && name.trim().length <= 60 && name.trim() !== w.name;
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !save.isPending) save.mutate();
      }}
    >
      <input
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        aria-label={t("wstation.rename")}
        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
      />
      <button
        type="submit"
        data-game-button="primary"
        disabled={!ok || save.isPending}
        className="h-8 rounded-md px-2 text-xs font-semibold disabled:opacity-50"
      >
        {t("wstation.save")}
      </button>
      <button type="button" onClick={onDone} className="h-8 rounded-md px-1.5 text-xs">
        {t("wstation.cancel")}
      </button>
    </form>
  );
}
