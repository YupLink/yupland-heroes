// Берег глазами кнопки (ПРАВИЛА §8.35): своя клетка — суша (местность есть и не
// вода), хотя бы одна соседняя — вода. Правило то же, что у сервера
// (fishing-sql shoreSql: WATER_SQL ≡ isWaterName). Решает сервер — здесь только
// показать «Забросить» там, где он согласится.
//
// Карта — из кэша экрана рейда (['beta-raid-map'], колонки packed): экран и
// канвас за лимитом строк, клетки сюда пропсами не везём. Клетку ищем числовой
// сеткой (cellGrid): строковый индекс «q,r» на 109 тыс. клеток строился при входе
// в игру ради семи клеток — ~75 мс на ×8, до 0,1 с на телефоне (замер 06.11.2026).
import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isWaterName } from "@/lib/shipRules";
import { neighborsOf } from "@/lib/raid/fishing";
import { cellAt } from "@/components/beta-raid/fishing/cellGrid";
import type { MapLike } from "@/components/beta-raid/patchMapCache";

const MAP_KEY = ["beta-raid-map"] as const;

/** Берег ли клетка (q, r) по карте из кэша; карты нет — нет. */
export function shoreAt(map: MapLike, q: number, r: number): boolean {
  const p = map?.packed;
  if (!p) return false;
  const terrains = (map?.terrains ?? {}) as Record<string, { name?: string } | undefined>;
  /** Вода ли клетка: true/false; клетки или местности нет — null. */
  const water = (cq: number, cr: number): boolean | null => {
    const i = cellAt(p, cq, cr);
    if (i < 0) return null;
    const t: number = p.t[i];
    const id = t >= 0 ? p.terrainIds[t] : undefined;
    return id ? isWaterName(terrains[id]?.name) : null;
  };
  if (water(q, r) !== false) return false;
  return neighborsOf(q, r).some((c) => water(c.q, c.r) === true);
}

/** Face an actual adjacent water tile. Missing map data leaves facing undecided. */
export function waterFacingAt(
  map: MapLike,
  q: number,
  r: number,
): { up: boolean; left: boolean } | null {
  const p = map?.packed;
  if (!p) return null;
  const terrains = (map?.terrains ?? {}) as Record<string, { name?: string } | undefined>;
  for (const n of neighborsOf(q, r)) {
    const i = cellAt(p, n.q, n.r);
    if (i < 0) continue;
    const t: number = p.t[i];
    const id = t >= 0 ? p.terrainIds[t] : undefined;
    if (!id || !isWaterName(terrains[id]?.name)) continue;
    const dq = n.q - q;
    const dr = n.r - r;
    return { up: dr < 0, left: dq + dr / 2 < 0 };
  }
  return null;
}

/**
 * Карта рейда из кэша — без второго запроса и без своего наблюдателя карты.
 * Снимок «сервера» тот же (как у shovelOffer): на сервере карты в кэше нет.
 */
export function useRaidMapCache(): MapLike {
  const qc = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) =>
      qc.getQueryCache().subscribe((e) => {
        if (e.query.queryKey[0] === MAP_KEY[0]) onChange();
      }),
    [qc],
  );
  const read = () => qc.getQueryData(MAP_KEY) as MapLike;
  return useSyncExternalStore(subscribe, read, read);
}
