// pendingAction-проп канваса мемоизируем по значениям: голый объект-литерал в
// JSX пересоздавался каждый рендер экрана → канвас пересчитывал цель и
// перерисовывался (requestRedraw + placeBadge) на каждый ре-рендер, пока выбран
// маршрут. Вынесено из BetaRaidScreen (лимит строк).
import { useMemo } from "react";
import type { PendingAction } from "./useBetaMovement";

export function usePendingActionProp(a: PendingAction | null): PendingAction | null {
  return useMemo(
    () => (a ? { kind: a.kind, q: a.q, r: a.r, extraCost: a.extraCost } : null),
    // Завязка на ПРИМИТИВЫ, не на объект: он и есть источник churn'а (новая
    // ссылка каждый рендер), включать его в deps бессмысленно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a?.kind, a?.q, a?.r, a?.extraCost],
  );
}
