// Подписи графика курса игрокам: время свечи по шагу и длина показанного промежутка
// для заголовка («Курс · 2 дня»). Числа курса — общий fmtRate (bankStatsFmt).
import { RATE_STEPS, type Candle, type RateStep } from "@/lib/bankRate";
import { ruPlural } from "@/lib/tourLetterText";
import { fmtWhen } from "./bankStatsFmt";

const DAY = 86_400_000;

/** Начало свечи: у дневной — только дата, у часовых — дата и час. */
export function fmtBucket(t: number, step: RateStep, ru: boolean): string {
  if (step !== "1d") return fmtWhen(t, ru);
  return new Date(t).toLocaleDateString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "short" });
}

/**
 * Сколько времени на графике — по числу свечей, а не по шагу: истории меньше окна
 * (пул открыт 17.10) — пишем, сколько есть. Часовые шаги до двух суток — в часах.
 */
export function fmtSpan(candles: Candle[], step: RateStep, ru: boolean): string {
  const ms = candles.length * RATE_STEPS[step].ms;
  if (step !== "1d" && ms < 2 * DAY) {
    const h = Math.round(ms / 3_600_000);
    return ru ? `${h} ч` : `${h} h`;
  }
  const d = Math.round(ms / DAY);
  return ru ? `${d} ${ruPlural(d, "день", "дня", "дней")}` : `${d} ${d === 1 ? "day" : "days"}`;
}

/** Подписи кнопок шага: как в биржевом графике. */
export const stepLabel = (step: RateStep, ru: boolean): string =>
  ru ? { "1h": "1ч", "4h": "4ч", "1d": "1д" }[step] : step;
