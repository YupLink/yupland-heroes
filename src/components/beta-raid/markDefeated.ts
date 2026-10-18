// Точечная отметка «объект на клетке опустошён» в кэше карты.
//
// Карта весит 274 КБ и разворачивается в 16 384 клетки — тянуть её заново
// после каждой подобранной монетки незачем: достаточно дописать индекс клетки
// в packed.defeated, и карта перерисуется из кэша.
import type { QueryClient } from "@tanstack/react-query";
import type { PackedCells } from "./unpackMap";
import { addLocalDefeated } from "./localDefeated";
import { attachCellIndex, cellIndex } from "./cellIndex";

type MapData = { packed: PackedCells | null } & Record<string, unknown>;

export function markCellDefeated(qc: QueryClient, q: number, r: number): void {
  // Локальная отметка: переживает рефетчи карты, пока сервер не подтвердит.
  addLocalDefeated(`${q},${r}`);
  qc.setQueryData(["beta-raid-map"], (old: MapData | undefined) => {
    const packed = old?.packed;
    if (!packed) return old;
    const at = cellIndex(packed);
    const index = at.get(`${q},${r}`) ?? -1;
    if (index < 0 || packed.defeated.includes(index)) return old;
    // Новые колонки — тот же набор клеток: индекс переносим, иначе его
    // пересобирали бы все, кто читает карту по «q,r» (берег рыбалки и др.).
    const next = { ...packed, defeated: [...packed.defeated, index] };
    attachCellIndex(next, at);
    return { ...old, packed: next };
  });
}
