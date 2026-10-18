// Подписи админки турниров: числа, даты, «сколько осталось», приз строкой и
// текст ошибки. Перевод — снаружи (t из useT), здесь только сборка.
import type { Lang } from "@/lib/store";
import { rewardKindLabelKey } from "@/lib/rewardKinds";
import { TOUR_DARAI, type TourPrize } from "@/lib/tournament/types";
import type { LeftParts } from "./tourList";

export type TFn = (key: string, params?: Record<string, string | number>) => string;

const locale = (lang: Lang): string => (lang === "ru" ? "ru-RU" : "en-US");

export const fmtNum = (n: number, lang: Lang): string =>
  Number(n || 0).toLocaleString(locale(lang), { maximumFractionDigits: 2 });

export const fmtDate = (iso: string | null, lang: Lang): string =>
  iso
    ? new Date(iso).toLocaleString(locale(lang), {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Время по UTC для плашки (расписание турниров — по UTC, владелец 04.10):
 *  «05.10 00:00», «Oct 05 00:00». Подпись «UTC» — в переводе. */
export const fmtUtc = (iso: string | null, lang: Lang): string =>
  iso
    ? new Date(iso)
        .toLocaleString(locale(lang), {
          timeZone: "UTC",
          day: "2-digit",
          month: lang === "ru" ? "2-digit" : "short",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
        .replace(", ", " ")
    : "—";

/** «2 д 5 ч», «5 ч 12 мин», «7 мин». */
export function leftText(p: LeftParts, t: TFn): string {
  if (p.d > 0) return `${t("tour.adm.unit_d", { n: p.d })} ${t("tour.adm.unit_h", { n: p.h })}`;
  if (p.h > 0) return `${t("tour.adm.unit_h", { n: p.h })} ${t("tour.adm.unit_m", { n: p.m })}`;
  return t("tour.adm.unit_m", { n: p.m });
}

/** Приз одной строкой: «1 000 DARAI», «Золото 50 000», «Бокс X ×2». */
export function prizeText(p: TourPrize, t: TFn, lang: Lang): string {
  const n = fmtNum(p.amount, lang);
  if (p.kind === "token")
    return `${n} ${p.refId === TOUR_DARAI ? "DARAI" : (p.refId ?? "")}`.trim();
  if (p.kind === "pack" || p.kind === "art" || p.kind === "hero" || p.kind === "item") {
    const name = p.title || t(`tour.adm.kind.${p.kind}`);
    return p.amount > 1 ? `${name} ×${n}` : name;
  }
  // Количество после подписи: «Энергия 100» читается без склонений.
  const key = p.kind === "resource" ? rewardKindLabelKey("resource", p.refId) : null;
  const label = key
    ? t(key)
    : p.kind === "resource"
      ? (p.refId ?? "")
      : t(`tour.adm.kind.${p.kind}`);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${n}`;
}

// Текст ошибки — общий с окном постройки «Турнир».
export { errText } from "@/lib/tournament/errText";
