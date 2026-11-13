// Порядок шахт в окне «Управление шахтами» держится, пока окно открыто:
// сортировку («Скоро сломаются», «Больше к сбору», «По уровню») считаем при
// открытии и при её смене. Починили или собрали — шахта остаётся на своём
// месте, а не уезжает в конец группы: иначе на её место вставала соседняя, и
// полоса «после починки» показывала чужой запас. Новая шахта — в конец,
// отнятая — пропадает.
import { useRef } from "react";
import { mineRowReady } from "@/lib/mineLost";
import type { OfficeMine } from "@/server/api/mine-office/mine-office-list";

export const officeMineKey = (m: Pick<OfficeMine, "mapId" | "q" | "r">): string =>
  `${m.mapId}:${m.q},${m.r}`;

/** Сравнение по выбранной сортировке (soon — по сроку поломки). */
export function compareMines(sort: string, now: number) {
  return (a: OfficeMine, b: OfficeMine): number =>
    sort === "ready"
      ? mineRowReady(b, now) - mineRowReady(a, now)
      : sort === "level"
        ? b.level - a.level
        : a.view.breakAt - b.view.breakAt;
}

type Order = { sort: string; keys: string[] };

/** Новый порядок: та же сортировка — прежние места, новые шахты следом. */
export function nextMineOrder(
  prev: Order | null,
  mines: OfficeMine[],
  sort: string,
  now: number,
): string[] {
  const sorted = [...mines].sort(compareMines(sort, now)).map(officeMineKey);
  if (!prev || prev.sort !== sort) return sorted;
  const have = new Set(sorted);
  const kept = prev.keys.filter((k) => have.has(k));
  const known = new Set(kept);
  return [...kept, ...sorted.filter((k) => !known.has(k))];
}

/** Место шахты в окне (ключ — officeMineKey). */
export function useStableMineOrder(
  mines: OfficeMine[],
  sort: string,
  now: number,
): Map<string, number> {
  const ref = useRef<Order | null>(null);
  const keys = nextMineOrder(ref.current, mines, sort, now);
  ref.current = { sort, keys };
  return new Map(keys.map((k, i) => [k, i]));
}
