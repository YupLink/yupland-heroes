// Точечная отметка «объект на клетке опустошён» в кэше карты.
//
// Карта весит 274 КБ и разворачивается в 16 384 клетки — тянуть её заново
// после каждой подобранной монетки незачем: достаточно дописать индекс клетки
// в packed.defeated, и карта перерисуется из кэша.
//
// Слоёв на клетке два: её объект и спрятавшийся под ним беглец (server
// runners.ts). Отметка гасит тот, что добит, и только его. Добили моба, под
// которым сидел заяц, — заяц открылся (applyReveal) и жив; а своё же событие
// «defeated» из потока приходит то раньше ответа удара, то позже, и вторая
// по счёту отметка гасила уже открытого зайца — он пропадал до F5.
import type { QueryClient } from "@tanstack/react-query";
import type { PackedCells } from "./unpackMap";
import { addLocalDefeated } from "./localDefeated";
import { attachCellIndex, cellIndex } from "./cellIndex";
import { readCellDetails, type MapLike } from "./patchMapCache";

type MapData = { packed: PackedCells | null } & Record<string, unknown>;

const MAP_KEY = ["beta-raid-map"];

/**
 * Погасить клетку. `runner` — добит показанный беглец; по умолчанию — объект
 * самой клетки, и тогда открытый на ней беглец остаётся живым.
 */
export function markCellDefeated(qc: QueryClient, q: number, r: number, runner = false): void {
  // Локальная отметка: переживает рефетчи карты, пока сервер не подтвердит.
  addLocalDefeated(`${q},${r}`);
  qc.setQueryData(MAP_KEY, (old: MapData | undefined) => {
    const packed = old?.packed;
    if (!packed) return old;
    const at = cellIndex(packed);
    const index = at.get(`${q},${r}`) ?? -1;
    if (index < 0 || packed.defeated.includes(index)) return old;
    // Добит объект клетки, а на ней уже показан беглец из-под него — он жив.
    if (!runner && (packed.runners ?? []).includes(index)) return old;
    // Новые колонки — тот же набор клеток: индекс переносим, иначе его
    // пересобирали бы все, кто читает карту по «q,r» (берег рыбалки и др.).
    const next = { ...packed, defeated: [...packed.defeated, index] };
    attachCellIndex(next, at);
    return { ...old, packed: next };
  });
}

/** Клетка сейчас показывает именно этого беглеца — удар идёт по нему, а не по объекту клетки. */
export function shownRunnerAt(qc: QueryClient, q: number, r: number, objectId: string): boolean {
  const map = qc.getQueryData(MAP_KEY) as MapLike;
  if (!map?.packed) return false;
  const cur = readCellDetails(map, q, r);
  return cur.runner && cur.objectId === objectId;
}
