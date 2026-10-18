// Пачка правок в очередь кисти одним махом — для генератора зоны.
//
// Вынесено из useAdminBrush (правило ≤250 строк): там остаётся сам хук, здесь —
// чистая арифметика. queueCell кладёт клетки по одной, и каждая тянет за собой
// commit: копию очереди, запись localStorage и перерисовку карты. На пять тысяч
// клеток зоны это квадратичная запись — панель зависала на десятки секунд.
// Здесь очередь и база копируются ОДИН раз, правки ложатся на месте, и commit
// наверху тоже один.
import type { CellDetails, CellPatch, DraftState } from "./patchMapCache";
import { mergeCellPatch, type DraftStep } from "./mergeCellPatch";

/** Снимок клетки «как было» — из кэша карты (useAdminBrush.read). */
export type ReadBefore = (q: number, r: number) => CellDetails;
/** Гард одной правки: урезать слои (блок) или отбросить целиком (null). */
export type PatchGuard = (patch: CellPatch, before: CellDetails) => CellPatch | null;

/**
 * Очередь после пачки правок. Семантика той же nextDraft по каждой клетке:
 * база снимается ДО правки и не переснимается, схлопнувшаяся в «как было»
 * правка уходит вместе со снимком и попадает в reverted — карту по ней надо
 * вернуть. nextDraft сама не зовётся: она копирует очередь на каждый вызов.
 */
export function queueCellsDraft(
  draft: DraftState,
  patches: CellPatch[],
  readBefore: ReadBefore,
  guard: PatchGuard,
): DraftStep {
  const queue = { ...draft.queue };
  const base = { ...draft.base };
  const reverted: string[] = [];
  for (const patch of patches) {
    const before = readBefore(patch.q, patch.r);
    const p = guard(patch, before);
    if (!p) continue;
    const key = `${p.q},${p.r}`;
    const start = base[key] ?? before;
    const merged = mergeCellPatch(queue[key], p, start);
    if (merged) {
      queue[key] = merged;
      base[key] = start;
      continue;
    }
    delete queue[key];
    delete base[key];
    reverted.push(key);
  }
  return { next: { queue, base }, reverted };
}
