// Блок мира в окне «Метеостанция»: название, погода сейчас (значок, вид,
// температура), отсчёт до смены и шансы смены — уровень (ясно → шторм) и
// температура (уже с голосами шаманов), обряд. Нулевые шансы сервер уже убрал;
// проценты — целыми.
import { ArrowRight, Timer } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { WEATHER_KIND_NAMES } from "@/lib/raid/weather";
import { stationLeft, stationPct, stationTemp } from "@/lib/weatherStationView";
import type { StationWorld } from "@/server/api/weather-station/wstation-list";
import { WeatherBadge } from "@/components/beta-raid/weather/WeatherBadge";
import { useState } from "react";
import type { RitualTarget } from "@/lib/raid/weatherRitual";
import { WeatherRitual } from "./WeatherRitual";
import { WeatherWorldAdmin, WeatherWorldRename } from "./WeatherWorldAdmin";

type Chip = { key: string; label: string; p: number };

function Chances({ items }: { items: Chip[] }) {
  const t = useT();
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((c) => (
        <li
          key={c.key}
          className="rounded-md border border-border/70 px-1 py-0.5 text-[11px] leading-tight"
        >
          <span className="text-muted-foreground">{c.label}</span>{" "}
          <b className="tabular-nums">{t("wstation.pct", { n: stationPct(c.p) })}</b>
        </li>
      ))}
    </ul>
  );
}

export function WeatherStationWorld({ w, now, mine, shamans, admin = false }: {
  w: StationWorld;
  now: number;
  /** Свой обряд в этом мире в эту смену. */
  mine: RitualTarget | null;
  shamans: number;
  admin?: boolean;
}) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const [renaming, setRenaming] = useState(false);
  return (
    <section
      aria-label={w.name}
      className={`space-y-1.5 rounded-xl border border-border px-3 py-2 ${w.hidden ? "opacity-60" : ""}`}
    >
      {admin && renaming && <WeatherWorldRename w={w} onDone={() => setRenaming(false)} />}
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1 text-sm font-semibold">
          <span className="truncate">{w.name}</span>
          {admin && w.hidden && (
            <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{t("wstation.hidden")}</span>
          )}
          {admin && <WeatherWorldAdmin w={w} onRename={setRenaming} />}
        </h3>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
          <WeatherBadge kind={w.kind} />
          {WEATHER_KIND_NAMES[w.kind][lang]} {stationTemp(w.temperatureC)}
        </span>
      </div>
      <p className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-amber-300">
        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
        {stationLeft(w.nextAt - now)}
        <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </p>
      <Chances
        items={w.levels.map((c) => ({
          key: c.value,
          label: t(`wstation.level.${c.value}`),
          p: c.p,
        }))}
      />
      <Chances
        items={w.temps.map((c) => ({ key: String(c.value), label: stationTemp(c.value), p: c.p }))}
      />
      <WeatherRitual w={w} mine={mine} shamans={shamans} />
    </section>
  );
}
