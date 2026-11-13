// Погода спавна — несколько сразу (04.11.2026, Ярослав: «тут нужна возможность
// выбирать несколько»). Кнопка с выбранным («дождь, туман» / «любая погода»),
// тап — под ней список с галочками; «любая погода» снимает все. Общий для строки
// «Возрождение» и точки спавна.
import { useState } from "react";
import { Check } from "lucide-react";
import {
  SPAWN_WEATHER,
  spawnWeatherName,
  spawnWeathersText,
  type SpawnWeather,
} from "@/lib/raid/mobSpawn";

const field = "rounded-lg border border-border bg-background px-1.5 py-1 text-[11px]";
const item = "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px]";

export function WeatherPick({
  value,
  onChange,
  en,
}: {
  value: SpawnWeather[];
  onChange: (next: SpawnWeather[]) => void;
  en: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (w: SpawnWeather) =>
    onChange(SPAWN_WEATHER.filter((x) => (x === w ? !value.includes(w) : value.includes(x))));
  const mark = (on: boolean) => (on ? <Check className="h-3.5 w-3.5 text-gold" /> : null);

  return (
    <div className="w-full">
      <button
        type="button"
        className={`${field} max-w-full truncate text-left`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {spawnWeathersText(value, en)}
      </button>
      {open && (
        <div className="mt-1 divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-background">
          <button type="button" className={item} onClick={() => onChange([])}>
            {en ? "any weather" : "любая погода"}
            {mark(value.length === 0)}
          </button>
          {SPAWN_WEATHER.map((w) => (
            <button key={w} type="button" className={item} onClick={() => toggle(w)}>
              {spawnWeatherName(w, en)}
              {mark(value.includes(w))}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
