// Что уезжает игроку из-под глухого тумана: ничего, кроме координат.
//
// Клиент зону прячет (useFogView), но ответ карты — обычный JSON во вкладке:
// в нём лежали id объекта, декора, постройки и признак «повержен», а по id
// объекта словарь отдавал имя, картинку и meta — у босса это HP и таблица
// наград. Разведка зоны сводилась к «открой Network». Раз клиент прячет —
// сервер обязан не отдавать, и вырезать надо ДО packCells: словари ассетов
// строятся по упакованным клеткам, иначе течь просто переезжает в словарь.
//
// terrain_id теперь уезжает тоже — под куполом местность цела, но игроку её
// знать не положено: купол на то и глухой. Стену на клиенте держит сам
// признак купола (packed.voidFog), а не тип местности, как было раньше.
import { isVoidFlag, type RawCell } from "./packCells";

/**
 * Вычистить содержимое клеток под глухим туманом.
 *
 * `canSeeVoid` — тот же ответ, что у canIgnoreVoid: админ рисует зону и
 * обязан видеть её целиком, иначе её нечем отлаживать. Ему клетка уезжает
 * ровно как раньше, плюс сам признак купола.
 *
 * Возвращает ещё и ключи спрятанных клеток: по ним чистятся привязанные к
 * координатам данные (тиры построек), которые до клеток не относятся.
 */
export function sanitizeVoidCells(
  rows: RawCell[],
  canSeeVoid: boolean,
): { cells: RawCell[]; hiddenKeys: Set<string> } {
  const hiddenKeys = new Set<string>();
  const cells: RawCell[] = [];
  for (const c of rows) {
    if (canSeeVoid || !isVoidFlag(c.void_fog)) {
      cells.push(c);
      continue;
    }
    hiddenKeys.add(`${c.q},${c.r}`);
    // Пустая клетка с одним признаком: «здесь глухо». Ни местности, ни
    // дороги, ни объекта, ни декора, ни постройки.
    cells.push({
      q: c.q,
      r: c.r,
      terrain_id: null,
      road_id: null,
      object_id: null,
      decoration_id: null,
      building_id: null,
      void_fog: true,
    });
  }
  return { cells, hiddenKeys };
}

/**
 * Оставить в словаре только то, что реально встречается на карте ПОСЛЕ
 * зачистки. Списки id берём из packCells — там уже нет ничего из зоны.
 */
export function keepById<T extends { id: string }>(rows: T[] | null, ids: string[]): T[] {
  const live = new Set(ids);
  return (rows ?? []).filter((row) => live.has(row.id));
}

/** Выбросить из таблицы «q,r» → значение всё, что стоит в спрятанной зоне. */
export function dropHiddenKeys<T>(
  table: Record<string, T>,
  hidden: Set<string>,
): Record<string, T> {
  if (hidden.size === 0) return table;
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(table)) {
    if (!hidden.has(key)) out[key] = value;
  }
  return out;
}
