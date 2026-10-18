// Мёртвая ссылка декора: клетка ссылается на шаблон, которого уже нет.
//
// Внешнего ключа от raid_map_cells к mystic_item_template нет, и удалённый
// шаблон оставлял id на клетке. Словарь снимка собирается по живым шаблонам
// (map-base), так что клиент получал id без записи в словаре: картинку не
// грузил (useImageCache), рисовал вечную зелёную точку (drawDecoration) и
// считал клетку стеной (hexPassable.walkable) — «две мёртвые клетки»
// (23,39)/(24,39) на «Мире Альфа», жалоба 20.09. Сервер к тому времени уже
// пускал (decorBlocksSql), но маршрут у игрока не строился, а тап молчал.
//
// Здесь — две затычки: игроку такой id в снимок не уезжает вовсе (нет id —
// нет ни точки, ни стены), а полное сохранение гекс-редактора не пишет его
// обратно из устаревшего черновика.
import type { RawCell } from "./packCells";
import { sqlStr } from "../raid-shared";

/**
 * Обнулить decoration_id, которого нет в словаре. Словарь пуст — не трогаем:
 * пустой ответ базы при живом декоре обнулил бы ВСЮ карту, и клиент проложил
 * бы маршруты сквозь стены, которые сервер держит. Строки не удаляются и не
 * переставляются — номера клеток (биты тумана) остаются на месте.
 */
export function dropDeadDecor(cells: RawCell[], known: ReadonlySet<string>): RawCell[] {
  if (known.size === 0) return cells;
  let touched = false;
  const out = cells.map((c) => {
    if (!c.decoration_id || known.has(c.decoration_id)) return c;
    touched = true;
    return { ...c, decoration_id: null };
  });
  return touched ? out : cells;
}

/**
 * Снять мёртвые ссылки декора с клеток одного сохранения гекс-редактора.
 * Редактор пишет `decoration_id = EXCLUDED.decoration_id` как есть: шаблон,
 * удалённый пока черновик лежал в браузере, вернулся бы на карту. Штамп
 * `saved_at` — тот же, которым сохранение помечает свои клетки.
 */
export function dropDeadDecorSql(mapId: string, stamp: string): string {
  return `UPDATE yuplink.raid_map_cells c
             SET decoration_id = NULL
           WHERE c.map_id = ${sqlStr(mapId)} AND c.saved_at = ${sqlStr(stamp)}
             AND c.decoration_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM yuplink.mystic_item_template t
                              WHERE t.id = c.decoration_id);`;
}
