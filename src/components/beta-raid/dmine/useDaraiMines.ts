// Таймер ячейки грибов DARAI (lib/daraiMine): грибы лежат одной стопкой, в
// ячейке — отсчёт до самого раннего выпадения (час в рюкзаке или конец жизни).
// Таймеры — по каждому герою аккаунта: ячейка берёт таймер своего героя
// (рюкзак в замке — любой свой герой), без героя — выбранного.
// Пока грибы есть — перечитывается раз в минуту. Срок вышел — через минуту с
// запасом (проход обхода сервера, dmine-sweep) перечитываем рюкзак, таймер,
// «Добычу» и флажки: гриб встал у героя или исчез — без F5. Стопка есть, а
// таймера к ней нет (гриб пришёл мимо «Забрать»: смена героя, рынок героев) —
// перечитываем таймеры один раз, а не ждём минуту.
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getMyDaraiMines } from "@/server/api/beta-raid/dmine/dmine-read";
import { invalidateBackpack } from "@/lib/query";
import { dminePlacedLate, pickDmineTimer } from "@/lib/daraiMine";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { MINE_PENDINGS_KEY } from "@/lib/hooks/useMinePendings";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { HARVEST_KEY } from "@/components/beta-raid/hud/useHarvest";

/** Ключ таймеров; префикс «beta-raid» — общий сброс при смене этажа. */
export const DMINE_TIMERS_KEY = ["beta-raid-dmine-timers"] as const;

/** Сколько ждать после конца часа: обход сервера ходит раз в минуту. */
const AFTER_DROP_MS = 75_000;

/** Таймера к стопке нет — перечитать, если ответ старше этого. */
const MISSING_REFETCH_MS = 5_000;

/** Всё, что меняет «Забрать» / «Посадить» / автопостановка / конец жизни гриба. */
export function invalidateDaraiMines(qc: QueryClient): void {
  invalidateBackpack(qc);
  invalidateBags(qc);
  void qc.invalidateQueries({ queryKey: DMINE_TIMERS_KEY });
  // Посадка стоит энергии — шкала сразу.
  void qc.invalidateQueries({ queryKey: ENERGY_KEY });
  // Гриб встал и работает у меня: «Добыча», плашка сбора и флажки — сразу.
  void qc.invalidateQueries({ queryKey: MINE_PENDINGS_KEY });
  void qc.invalidateQueries({ queryKey: HARVEST_KEY });
  void qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
}

export function useDaraiMineTimers() {
  return useQuery({
    queryKey: DMINE_TIMERS_KEY,
    queryFn: () => getMyDaraiMines(),
    staleTime: 30_000,
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 60_000 : false),
  });
}

/**
 * Ближайшее выпадение гриба этой стопки (мс) у героя heroId (нет — у
 * выбранного); null — грибов нет или таймер не пришёл.
 */
export function useDaraiMineExpiry(stackKey: string, heroId?: string | null): number | null {
  const qc = useQueryClient();
  const timers = useDaraiMineTimers();
  const at = pickDmineTimer(timers.data, stackKey, heroId)?.expiresAt ?? null;
  const seen = useRef<number | null>(null);
  const { isSuccess, dataUpdatedAt, refetch } = timers;
  useEffect(() => {
    // Ячейка грибов есть, а таймера нет: ответ старый — перечитать (один раз:
    // свежий ответ сдвигает dataUpdatedAt, и повтор не нужен).
    if (at !== null || !isSuccess || Date.now() - dataUpdatedAt < MISSING_REFETCH_MS) return;
    void refetch({ cancelRefetch: false });
  }, [at, isSuccess, dataUpdatedAt, refetch]);
  useEffect(() => {
    // Ближайшее выпадение сменилось после своего срока (гриб встал или исчез
    // позже перечитывания по таймеру): рюкзак, «Добыча» и флажки — сразу.
    if (dminePlacedLate(seen.current, at)) invalidateDaraiMines(qc);
    seen.current = at;
    if (at === null) return;
    const wait = Math.max(0, at - Date.now()) + AFTER_DROP_MS;
    const id = setTimeout(() => invalidateDaraiMines(qc), wait);
    return () => clearTimeout(id);
  }, [at, qc]);
  return at;
}
