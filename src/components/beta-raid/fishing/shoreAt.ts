// Берег глазами кнопки (ПРАВИЛА §8.35): своя клетка — суша (местность есть и не
// вода), хотя бы одна соседняя — вода. Правило то же, что у сервера
// (fishing-sql shoreSql: WATER_SQL ≡ isWaterName). Решает сервер — здесь только
// показать «Забросить» там, где он согласится.
//
// Карта — из кэша экрана рейда (['beta-raid-map'], колонки packed): экран и
// канвас за лимитом строк, клетки сюда пропсами не везём. Читаем по индексу
// «q,r» → номер (cellIndex, общий с остальными), семь клеток на вопрос.
import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isWaterName } from "@/lib/shipRules";
import { neighborsOf } from "@/lib/raid/fishing";
import { cellIndex } from "@/components/beta-raid/cellIndex";
import type { MapLike } from "@/components/beta-raid/patchMapCache";

const MAP_KEY = ["beta-raid-map"] as const;

/** Берег ли клетка (q, r) по карте из кэша; карты нет — нет. */
export function shoreAt(map: MapLike, q: number, r: number): boolean {
  const p = map?.packed;
  if (!p) return false;
  const at = cellIndex(p);
  const terrains = (map?.terrains ?? {}) as Record<string, { name?: string } | undefined>;
  /** Вода ли клетка: true/false; клетки или местности нет — null. */
  const water = (cq: number, cr: number): boolean | null => {
    const i = at.get(`${cq},${cr}`);
    if (i === undefined) return null;
    const t = p.t[i];
    const id = t >= 0 ? p.terrainIds[t] : undefined;
    return id ? isWaterName(terrains[id]?.name) : null;
  };
  if (water(q, r) !== false) return false;
  return neighborsOf(q, r).some((c) => water(c.q, c.r) === true);
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
