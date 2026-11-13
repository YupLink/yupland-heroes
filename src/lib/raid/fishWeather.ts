// Погода и рыбалка (владелец, 26.10.2026): шанс поклёвки × коэффициент «рыба» погоды
// карты, где идёт заброс. Ноль — «не клюёт»: попытки идут и тратят удочку, рыбы нет.
//
// Шанс — вероятность в процентах, поэтому сверху он обрезается на 100 % (×4 к 30 % —
// не 120 %, а каждый раз), до сотых — как fishChanceWith. Множитель ложится последним:
// на шанс заброса с бонусом героя и на каждую его ступень (истёк бафф удачи,
// fishChanceSteps). Коэффициент берётся в миг заброса и, как сам шанс, фиксируется в
// строке заброса (§8.35 п. 6б): сменилась погода посреди часа — заброс доживает с ним.
// Коэффициент 1 (влияние выключено, остров, нет погоды) — план ровно прежний.
import type { ChanceStep } from "@/lib/raid/fishChanceSteps";

export type ChancePlan = { chancePct: number; steps: ChanceStep[] };

/** Шанс × коэффициент: не ниже 0, не выше 100 %, до сотых. */
export function weatherFishPct(pct: number, coef: number): number {
  const v = Math.max(0, Number(pct) || 0) * Math.max(0, Number(coef) || 0);
  return Math.min(100, Math.round(v * 100) / 100);
}

/** План заброса с погодой; ступень, не меняющая шанса, не пишется (как chancePlanOf). */
export function weatherChancePlan(plan: ChancePlan, coef: number): ChancePlan {
  if (coef === 1 || !Number.isFinite(coef)) return plan;
  const chancePct = weatherFishPct(plan.chancePct, coef);
  const steps: ChanceStep[] = [];
  let last = chancePct;
  for (const s of plan.steps) {
    const pct = weatherFishPct(s.pct, coef);
    if (pct === last) continue;
    steps.push({ at: s.at, pct });
    last = pct;
  }
  return { chancePct, steps };
}
