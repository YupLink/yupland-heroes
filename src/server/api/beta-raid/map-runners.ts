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

/**
 * Чьи шаблоны нужны словарю объектов карты: всё, что показано на клетках, и
 * беглецы, спрятанные под живым верхним.
 *
 * Спрятанного в колонках не видно, и раньше его шаблон в словарь не попадал,
 * если такого же не было на виду где-то ещё. Добили моба — под ним открылся
 * заяц, а нарисовать его нечем: безымянный тёмный жетон без кнопки «забрать»
 * до F5. Под куполом беглецов не отдаём — словарь не должен выдавать зону.
 */
export function dictObjectIds(
  shown: string[],
  runners: RunnerRow[],
  hidden: Set<string>,
): string[] {
  const out = [...shown];
  for (const run of runners) if (!hidden.has(`${run.q},${run.r}`)) out.push(run.objectId);
  return out;
}
