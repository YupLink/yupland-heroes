// Как слой беглецов ложится на карту, которую видит игрок.
//
// Клетка рисуется ОДНИМ объектом — так устроены и колонки карты, и тап, и
// карточка соседа. Беглец этого не меняет: пока верхний объект клетки жив,
// показан он, а беглец под ним не виден вовсе — он там и прячется. Забрали
// сундук или добили босса — клетка показывает беглеца, и он становится
// доступен. Ровно тот же выбор делает бой (cell-override.loadCellObject),
// поэтому нарисованное и ударяемое всегда совпадают.
//
// Отличие у беглеца одно, и оно уезжает клиенту отдельным списком: клетку он НЕ
// запирает. Стоит он не в клетке, а в своём слое, и правила прохода (step-facts
// на сервере, hexPassable на клиенте) его не видят — иначе гриб, севший в
// узком месте, закрыл бы проход, а обойти его нечем.
import type { RawCell } from "./packCells";
import type { RunnerRow } from "./runners";

export type RunnerOverlay = {
  /** Клетки карты, где объект уже подменён на показанного беглеца. */
  cells: RawCell[];
  /** Ключи «q,r», на которых показан именно беглец. */
  runnerKeys: Set<string>;
  /** Ключи клеток, чей ПОКАЗАННЫЙ объект повержен. */
  defeatedKeys: Set<string>;
};

/**
 * Наложить беглецов на клетки.
 *
 * `known` — объекты, для которых есть чем показать (шаблон или снимок). Беглец
 * с оборванной ссылкой не показывается вовсе, как и такой же объект клетки:
 * тёмный кружок без имени и кнопки хуже пустого места.
 */
export function overlayRunners(opts: {
  rows: RawCell[];
  runners: RunnerRow[];
  known: Set<string>;
  /** Клетки с поверженным объектом самой клетки (слой 0). */
  deadCells: Set<string>;
  /** Клетки с поверженным беглецом (слой 1). */
  deadRunners: Set<string>;
}): RunnerOverlay {
  const { rows, runners, known, deadCells, deadRunners } = opts;
  const byKey = new Map<string, RunnerRow>();
  for (const run of runners) {
    if (known.has(run.objectId)) byKey.set(`${run.q},${run.r}`, run);
  }

  const runnerKeys = new Set<string>();
  const defeatedKeys = new Set<string>();
  const cells = rows.map((cell) => {
    const key = `${cell.q},${cell.r}`;
    const top = cell.object_id;
    const topAlive = !!top && !deadCells.has(key);
    const run = byKey.get(key);
    if (run && !topAlive) {
      runnerKeys.add(key);
      if (deadRunners.has(key)) defeatedKeys.add(key);
      return { ...cell, object_id: run.objectId };
    }
    if (top && deadCells.has(key)) defeatedKeys.add(key);
    return cell;
  });

  return { cells, runnerKeys, defeatedKeys };
}
