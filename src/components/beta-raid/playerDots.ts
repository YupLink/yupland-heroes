// Чужие игроки на карте — мимо React (владелец, 14.10.2026: «оптимизация
// перерисовки карты»).
//
// Чужой шаг приходит живым потоком ~35 раз в минуту. Раньше раскладка игроков
// жила в состоянии экрана рейда, и каждый такой шаг пересобирал ВЕСЬ экран:
// холст со всеми пропсами, HUD, окна. Теперь она в маленьком хранилище:
// кадр карты берёт точки прямо отсюда и перерисовывается сам (useMapRenderer),
// «Раскрыть карту» подписана отдельно, экран не трогается вовсе.
//
// «Игроки на карте» выключены в профиле — хранилище пустое и молчит: чужих
// не рисуем и кадры ради них не будим. Данные при этом идут как прежде —
// запрос и живой поток обновляют кэш, смена на карте учитывается, и при
// включении показа точки сразу на своих местах.
import { useEffect, useSyncExternalStore } from "react";
import { QueryObserver, useQueryClient } from "@tanstack/react-query";
import { getBetaRaidPlayers } from "@/server/api/beta-raid/players";
import { useAccountView } from "@/lib/hooks/useAccountView";

export type PlayerDots = Map<string, number>;
type Players = Awaited<ReturnType<typeof getBetaRaidPlayers>>;

export const PLAYERS_KEY = ["beta-raid-players"] as const;
const EMPTY: PlayerDots = new Map();

let dots: PlayerDots = EMPTY;
const listeners = new Set<() => void>();

/** Точки чужих игроков «q,r» → сколько их на клетке. */
export const getPlayerDots = (): PlayerDots => dots;

export function subscribePlayerDots(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setDots(next: PlayerDots): void {
  if (next === dots) return;
  dots = next;
  for (const fn of listeners) fn();
}

/**
 * Проталкиватель ответов запроса в хранилище. Тот же список клеток (повтор
 * опроса) — молчим; показ выключен — пусто и тоже молчим, пока пусто.
 */
export function playersPusher(hide: boolean): (data: Players | undefined) => void {
  let seen: Players["cells"] | null = null;
  return (data) => {
    if (hide) return setDots(EMPTY);
    if (!data || data.cells === seen) return;
    seen = data.cells;
    const next = new Map<string, number>();
    for (const cell of data.cells) next.set(`${cell.q},${cell.r}`, cell.count);
    setDots(next);
  };
}

/** Для окон, которым точки нужны в разметке («Раскрыть карту»). */
export function usePlayerDots(): PlayerDots {
  return useSyncExternalStore(subscribePlayerDots, getPlayerDots, () => EMPTY);
}

/**
 * Кормит хранилище из кэша запроса — без подписки экрана: наблюдатель
 * react-query держит опрос и получает правки живого потока, а React экрана
 * про них не знает. Ставится один раз, на экране рейда.
 */
export function usePlayerDotsFeed(): void {
  const qc = useQueryClient();
  const { hidePlayers } = useAccountView();
  useEffect(() => {
    const observer = new QueryObserver<Players>(qc, {
      queryKey: PLAYERS_KEY,
      queryFn: () => getBetaRaidPlayers(),
      staleTime: 10_000,
      // Живой поток — основной канал, опрос — страховка от оборванного.
      refetchInterval: 60_000,
    });
    const push = playersPusher(hidePlayers);
    push(observer.getCurrentResult().data);
    return observer.subscribe((result) => push(result.data));
  }, [qc, hidePlayers]);
}
