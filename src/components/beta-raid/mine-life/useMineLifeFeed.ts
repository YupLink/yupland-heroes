// Кормит хранилище полос службы шахт из запроса — без подписки экрана, как
// usePlayerDotsFeed: наблюдатель react-query держит данные, кадр берёт их из
// mineLifeStore. Ставится один раз — вместе с флажками карты (useMapFlags).
//
// Когда перечитывать:
//  • флажки перечитали (починка, режим, захват, постановка, перенос в режиме
//    бога, поток со сменой владельца) — полосы вслед: свои действия поток нам
//    не возвращает, а все окна шахт уже гасят флажки (useMineInvalidate и др.);
//  • поток задел шахту с полосой без смены владельца (mineLifeTouched);
//  • смена этажа — общий сброс «beta-raid*».
// Полоса тает за сутки–неделю: раз в минуту будим один кадр, без своего rAF.
//
// Чужие полосы сервер отдаёт только во «втором обзоре» героя (mine-life-see.ts,
// 04.11.2026), поэтому ещё: герой отошёл на SIGHT_STEP клеток от места прошлого
// чтения — перечитать (после шагов, useStepRefetch). Не на каждый шаг: запрос
// проходит все постройки карты (~5 мс базы), край круга живёт с запасом в пару клеток.
// Админ видит все полосы только в режиме бога (05.11.2026): god — в ключе запроса,
// включил/выключил — свой запрос, чужой ответ на карту не ляжет.
import { useCallback, useEffect, useRef } from "react";
import { QueryObserver, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { hexDistance } from "@/lib/raid/hex";
import { useStepRefetch, type StepAt } from "../useStepRefetch";
import { getMineLifeBars } from "@/server/api/beta-raid/mine-life-bars";
import { decodeMineLife, mineBarsAlive, type MineLifeWire } from "@/lib/mineLifeBars";
import {
  getMineBars,
  MINE_LIFE_KEY,
  mineBarsNow,
  pokeMineBars,
  setMineBars,
} from "./mineLifeStore";

const FLAGS_KEY = "beta-raid-mine-flags";
const TICK_MS = 60_000;
/** На столько клеток герой отошёл от места прошлого чтения — полосы перечитываются. */
export const SIGHT_STEP = 3;

/** Ответ с нашей меткой получения (середина запроса) — по ней сдвиг часов. */
type Stamped = MineLifeWire & { clientAt: number };

async function fetchBars(god: boolean): Promise<Stamped> {
  const sent = Date.now();
  const wire = await getMineLifeBars({ data: { god } });
  return { ...wire, clientAt: Math.round((sent + Date.now()) / 2) };
}

/** Запустить подачу полос на клиенте запросов; god — режим бога; вернёт «остановить». */
export function startMineLifeFeed(qc: QueryClient, god = false): () => void {
  const observer = new QueryObserver<Stamped>(qc, {
    queryKey: [...MINE_LIFE_KEY, god],
    queryFn: () => fetchBars(god),
    staleTime: 30_000,
  });
  let seen: Stamped | undefined;
  const push = (data: Stamped | undefined) => {
    if (!data || data === seen) return;
    seen = data;
    const next = decodeMineLife(data, data.clientAt);
    setMineBars(next.bars, next.skew);
  };
  push(observer.getCurrentResult().data);
  const stopObserver = observer.subscribe((res) => push(res.data));

  // Флажки погасили — полосы следом. Не в самом уведомлении кэша (оно идёт
  // внутри чужого invalidate), и не рвём уже идущий запрос полос.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopCache = qc.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" || e.action.type !== "invalidate") return;
    if (e.query.queryKey[0] !== FLAGS_KEY || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void qc.invalidateQueries({ queryKey: MINE_LIFE_KEY }, { cancelRefetch: false });
    }, 0);
  });

  const tick = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (mineBarsAlive(getMineBars(), mineBarsNow())) pokeMineBars();
  }, TICK_MS);

  return () => {
    stopObserver();
    stopCache();
    clearInterval(tick);
    if (timer) clearTimeout(timer);
  };
}

/** Отошёл ли герой от места прошлого чтения на SIGHT_STEP клеток (нет места — да). */
export function sightMoved(last: StepAt | null, now: StepAt): boolean {
  return !last || hexDistance(last.q, last.r, now.q, now.r) >= SIGHT_STEP;
}

/** heroAt — позиция героя; полосы перечитываются, когда он отошёл от места прошлого чтения. */
export function useMineLifeFeed(heroAt: StepAt | null = null, god = false): void {
  const qc = useQueryClient();
  useEffect(() => startMineLifeFeed(qc, god), [qc, god]);
  const at = useRef(heroAt);
  at.current = heroAt;
  const last = useRef<StepAt | null>(null);
  const refetch = useCallback(() => {
    const p = at.current;
    if (!p || !sightMoved(last.current, p)) return;
    last.current = { q: p.q, r: p.r };
    void qc.invalidateQueries({ queryKey: MINE_LIFE_KEY });
  }, [qc]);
  useStepRefetch(heroAt, refetch);
}
