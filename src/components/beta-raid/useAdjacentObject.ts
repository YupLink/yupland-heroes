// Объект на соседней клетке — то, с чем можно взаимодействовать не сходя с места.
//
// Вынесено из BetaRaidScreen: экран остаётся оркестратором (§13.6), а поиск
// соседа — обычный расчёт по клеткам.
import { useMemo } from "react";
import { DIRS, isVoidCell } from "./usePathfinding";
import type { Cell } from "./unpackMap";

type ObjectInfo = {
  id: string;
  name: string;
  imageUrl: string | null;
  meta: unknown;
  kind: string | null;
};

/**
 * Словари карты одним аргументом: сюда приезжает весь ответ карты, а нужен из
 * него ровно список объектов — одной ссылкой в зависимостях memo.
 */
type MapDicts = {
  objects?: Record<string, ObjectInfo>;
};

export type AdjacentObject = ObjectInfo & { q: number; r: number };

export function useAdjacentObject(
  cells: Record<string, Cell>,
  playerPos: { q: number; r: number } | null,
  map: MapDicts | undefined,
): AdjacentObject | null {
  // Админу купола в клетках нет вовсе (unpackMap.unpackCells): карточка соседа
  // в зоне у него остаётся — бить и осматривать её он должен уметь.
  return useMemo(() => {
    const objects = map?.objects;
    if (!playerPos || !objects) return null;
    for (const d of DIRS) {
      const cell = cells[`${playerPos.q + d.q},${playerPos.r + d.r}`] as Cell | undefined;
      // Сосед под куполом для игрока не существует: карточка показывала имя,
      // картинку и кнопку «атаковать» внутри зоны, куда хода нет, — то есть
      // разведку местности через стену и заведомо мёртвую кнопку.
      if (isVoidCell(cell)) continue;
      if (cell?.objectId && !cell.objectDefeated) {
        const obj = objects[cell.objectId];
        if (obj)
          return {
            id: obj.id,
            name: obj.name,
            imageUrl: obj.imageUrl,
            meta: obj.meta,
            kind: obj.kind ?? null,
            q: playerPos.q + d.q,
            r: playerPos.r + d.r,
          };
      }
    }
    return null;
  }, [playerPos, cells, map]);
}
