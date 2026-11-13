// Выход шахты в окне: «N {ресурс} в час», у режима — «стандарт × режим = N»,
// алмаз острова — «N в день». Шахта v2 — с погодой карты (коэффициент «шахты»,
// §8.83): число с учётом погоды и значок; в формуле режима — множитель погоды.
// Коэффициент 1, гриб, шахта старого образца — строка прежняя, без значка.
import { useT } from "@/lib/i18n";
import type { MineV2View } from "@/lib/mineExtra";
import { weatherShown } from "@/lib/raid/weatherYield";
import { useMyMapWeather } from "../weather/useWeatherByMap";
import { WeatherBadge } from "../weather/WeatherBadge";

/** В час — до сотых: окружение (§8.80) даёт дробные ставки (10 × 2/3). */
const perHour = (x: number): number => Math.round(x * 100) / 100;

export function MineYieldLine({
  v2,
  yieldAmount,
  resName,
}: {
  v2: MineV2View | null;
  yieldAmount: number;
  resName: string;
}) {
  const t = useT();
  const mw = useMyMapWeather(!!v2);
  const base = v2 ? v2.stdYield * v2.mult : yieldAmount;
  const shown = weatherShown(base, v2 ? mw?.coefs.mine : null, mw?.kind);
  const text =
    v2?.stepHours === 24
      ? t("mine2.diamonds_per_day", { n: Math.round(shown.value * 24) })
      : v2 && v2.mult > 1
        ? t(shown.kind ? "mine2.yield_mult_weather" : "mine2.yield_mult", {
            std: perHour(v2.stdYield),
            mult: v2.mult,
            w: mw?.coefs.mine ?? 1,
            n: perHour(shown.value),
            res: resName,
          })
        : t("mine.yield_per_hour", { n: perHour(v2 ? shown.value : yieldAmount), res: resName });
  return (
    <p className="text-center text-[11px] text-muted-foreground">
      {text}
      {shown.kind && <WeatherBadge kind={shown.kind} />}
    </p>
  );
}
