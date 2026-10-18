// Колонки объединённых клеток (group_id, icon_scale) в raid_map_cells.
//
// Дорастание идемпотентное и кэшируется на процесс: зовётся перед первым
// SELECT снимка (map-base) и перед выгрузкой пачки с объединением — иначе
// на проде без миграции /map-blob упал бы всем разом.
//
// «Одна постройка на блок» держится на клиенте (кисть отказывает — useAdminBrush)
// и правилом отрисовки (лид = первая клетка блока с постройкой). Уникального
// индекса нарочно нет: редактор карт кладёт постройку кистью-площадью на N
// клеток разом, и индекс ронял бы всё сохранение невнятной ошибкой базы.
import { mcpExec } from "../../db/mcpClient";

let ready: Promise<void> | null = null;

export function ensureGroupColumns(): Promise<void> {
  if (ready) return ready;
  ready = mcpExec(
    `ALTER TABLE yuplink.raid_map_cells
       ADD COLUMN IF NOT EXISTS group_id   text,
       ADD COLUMN IF NOT EXISTS icon_scale numeric;
     CREATE INDEX IF NOT EXISTS raid_map_cells_group_idx
       ON yuplink.raid_map_cells (map_id, group_id) WHERE group_id IS NOT NULL;`,
    { wrapJson: false },
  )
    .then(() => undefined)
    .catch((e: unknown) => {
      // Не запоминаем провал — следующий заход попробует снова.
      ready = null;
      console.warn("[merge] ensureGroupColumns не отработал:", e);
      throw e;
    });
  return ready;
}

/**
 * Снять группу с блоков, где осталась одна клетка: ластик/«Забыть» по одной
 * клетке черновика или стирание в редакторе карт оставляют сироту, а сирота
 * блоком не рисуется, но «уже в другом блоке» для кисти объединения.
 */
export function dropOrphanGroupsSql(mapIdSql: string): string {
  return `UPDATE yuplink.raid_map_cells c SET group_id = NULL, icon_scale = NULL
    WHERE c.map_id = ${mapIdSql} AND c.group_id IS NOT NULL
      AND (SELECT count(*) FROM yuplink.raid_map_cells m
            WHERE m.map_id = c.map_id AND m.group_id = c.group_id) < 2;`;
}
