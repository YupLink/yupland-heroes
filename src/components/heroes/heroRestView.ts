// Отдых героя на экранах: серый вид и сколько осталось.
//
// Правило владельца (29.09.2026): снятый с грядки издалека герой отдыхает —
// серый, никуда не ставится и ничего не делает. Вид один на все списки (замок,
// выбор героя, грядка, таверна, карточка в инвентаре), подпись времени — та же,
// что у отдыха фишек («2 ч 59 мин»). Тик — один на экран: useNowTick у списка,
// карточки получают готовое «сейчас». Значок луны — HeroRestBadge.
import { heroResting } from "@/lib/fieldRecall";
import { fmtBusyLeft } from "@/components/chips/chipBusy";

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Серый вид отдыхающего — на всю плитку. */
export const RESTING_CLASS = "grayscale opacity-50";

export type HeroRestView = {
  resting: boolean;
  /** «отдых 2 ч 59 мин» — вместо уровня в списках. */
  label: string;
  /** «2 ч 59 мин» — таймер на плитке инвентаря. */
  left: string;
};

/** Отдыхает ли герой и что писать вместо уровня: «отдых 2 ч 59 мин». */
export function heroRestView(
  restUntil: string | null | undefined,
  now: number,
  t: TFn,
): HeroRestView {
  if (!heroResting(restUntil, now)) return { resting: false, label: "", left: "" };
  const left = fmtBusyLeft(restUntil, now, t);
  return { resting: true, label: t("braid.hero_rest_left", { time: left }), left };
}
