// Маленький значок погоды рядом с выходом «в час» (тот же атлас, что у панели
// погоды Ангелины). Без подписи: название — во всплывающей подсказке и для
// чтения с экрана, на языке игрока.
import atlas from "./weather-atlas-hud.webp";
import { useLang } from "@/lib/i18n";
import { WEATHER_KINDS, WEATHER_KIND_NAMES, type WeatherKind } from "@/lib/raid/weather";

export function WeatherBadge({ kind }: { kind: WeatherKind }) {
  const lang = useLang();
  const i = WEATHER_KINDS.indexOf(kind);
  if (i < 0) return null;
  const name = WEATHER_KIND_NAMES[kind][lang === "en" ? "en" : "ru"];
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      data-weather-badge={kind}
      className="ml-1 inline-block h-4 w-4 shrink-0 bg-no-repeat align-[-3px]"
      style={{
        backgroundImage: `url(${atlas})`,
        backgroundSize: "300% 300%",
        backgroundPosition: `${(i % 3) * 50}% ${Math.floor(i / 3) * 50}%`,
      }}
    />
  );
}

/** Значки погоды карт группы (уже не больше двух, lib/raid/weatherYield). */
export function WeatherBadges({ kinds }: { kinds: readonly WeatherKind[] }) {
  return (
    <>
      {kinds.map((kind) => (
        <WeatherBadge key={kind} kind={kind} />
      ))}
    </>
  );
}
