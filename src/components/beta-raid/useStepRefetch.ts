// Шаги героя → одно чтение слоя «второго обзора»: когда герой постоял
// STEP_MS, а в долгом пути — не реже раза в MAX_WAIT_MS. Общий для слоёв,
// которые сервер режет кругом вокруг героя: мешочки (useLootBags) и полосы
// службы чужих шахт (useMineLifeFeed). Вынесено из useLootBags без изменений.
import { useEffect, useRef } from "react";

/** Герой постоял столько — слой перечитывается; в пути — не реже MAX_WAIT_MS. */
const STEP_MS = 600;
const MAX_WAIT_MS = 4000;

export type StepAt = { q: number; r: number };

export function useStepRefetch(pos: StepAt | null, refetch: () => void): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(0);
  // Первая позиция — не шаг: слой и так читается при появлении героя.
  const mounted = useRef(false);
  const [pq, pr] = [pos?.q, pos?.r];
  useEffect(() => {
    if (pq == null || pr == null) return;
    if (!mounted.current) return void (mounted.current = true);
    const now = Date.now();
    if (!timer.current) first.current = now;
    else clearTimeout(timer.current);
    const wait = Math.max(0, Math.min(STEP_MS, first.current + MAX_WAIT_MS - now));
    timer.current = setTimeout(() => {
      timer.current = null;
      refetch();
    }, wait);
  }, [pq, pr, refetch]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
}
