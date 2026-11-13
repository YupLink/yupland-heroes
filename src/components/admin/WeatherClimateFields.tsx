// Климат мира в карточке «Смена погоды» (владелец, 05.11.2026): температура — один ползунок
// с двумя концами на сетке 10°, погода — один ползунок ясно … шторм, галка аномалий и
// выбор холод / жара. Только выбор, без ввода с клавиатуры (правило владельца).
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { WEATHER_LEVELS, type WeatherAnomaly } from "@/lib/raid/weather";
import { WEATHER_CLIMATE_DEFAULT, type WeatherClimate } from "@/lib/raid/weatherClimate";
import { stationTemp } from "@/lib/weatherStationView";

const LEVEL_NAMES = { clear: "ясно", overcast: "пасмурно", storm: "шторм" } as const;
const ANOMALY_NAMES: Record<WeatherAnomaly, string> = { cold: "Холод", heat: "Жара" };

const span = (a: string, b: string) => (a === b ? a : `${a} … ${b}`);

export function WeatherClimateFields({
  climate,
  set,
  disabled,
}: {
  climate: WeatherClimate;
  set: (c: WeatherClimate) => void;
  disabled: boolean;
}) {
  const lo = WEATHER_LEVELS.indexOf(climate.levels[0]);
  const hi = WEATHER_LEVELS.indexOf(climate.levels[climate.levels.length - 1]);
  const row = "grid grid-cols-[5rem_minmax(0,1fr)_7rem] items-center gap-3";
  return (
    <div className="space-y-3 border-b border-border pb-3">
      <div className={row}>
        <span className="text-sm font-semibold">Темп.</span>
        <Slider
          aria-label="Температура"
          min={WEATHER_CLIMATE_DEFAULT.tempMin}
          max={WEATHER_CLIMATE_DEFAULT.tempMax}
          step={10}
          minStepsBetweenThumbs={0}
          value={[climate.tempMin, climate.tempMax]}
          disabled={disabled}
          onValueChange={([tempMin, tempMax]) => set({ ...climate, tempMin, tempMax })}
        />
        <span className="text-sm tabular-nums">
          {span(stationTemp(climate.tempMin), stationTemp(climate.tempMax))}
        </span>
      </div>
      <div className={row}>
        <span className="text-sm font-semibold">Погода</span>
        <Slider
          aria-label="Погода"
          min={0}
          max={WEATHER_LEVELS.length - 1}
          step={1}
          minStepsBetweenThumbs={0}
          value={[lo, hi]}
          disabled={disabled}
          onValueChange={([a, b]) => set({ ...climate, levels: WEATHER_LEVELS.slice(a, b + 1) })}
        />
        <span className="text-sm">
          {span(LEVEL_NAMES[WEATHER_LEVELS[lo]], LEVEL_NAMES[WEATHER_LEVELS[hi]])}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-9 items-center gap-2 text-sm font-semibold">
          <Checkbox
            checked={climate.anomaly !== null}
            disabled={disabled}
            onCheckedChange={(on) => set({ ...climate, anomaly: on === true ? "cold" : null })}
          />
          Аномалии
        </label>
        {climate.anomaly && (
          <div className="flex gap-1" role="radiogroup" aria-label="Аномалия">
            {(Object.keys(ANOMALY_NAMES) as WeatherAnomaly[]).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={climate.anomaly === a}
                disabled={disabled}
                onClick={() => set({ ...climate, anomaly: a })}
                className={`min-h-9 rounded-lg border px-3 text-sm disabled:opacity-50 ${
                  climate.anomaly === a ? "border-primary text-primary" : "border-border"
                }`}
              >
                {ANOMALY_NAMES[a]} {a === "cold" ? "−50/−60°" : "+50/+60°"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
