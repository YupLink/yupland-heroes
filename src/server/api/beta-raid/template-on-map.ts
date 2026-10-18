// Стоит ли шаблон предмета на картах — вопрос ДО удаления.
//
// adminDeleteItem удалял шаблон, не глядя на raid_map_cells: внешнего ключа
// от клеток к шаблонам нет, и клетка оставалась с мёртвой ссылкой. Для декора
// это «две мёртвые клетки» (23,39)/(24,39) «Мира Альфа»: зелёная точка без
// имени, через которую не пройти (жалоба 20.09). У боссов свой порядок
// (raid-boss-templates: снимок в клетку + зачистка копий); у предметов проще
// и честнее — пока стоит на карте, не удалять: снять кистью или в редакторе,
// потом удалять. Считаем по ВСЕМ картам, а не только по живой: черновик
// завтра могут сделать боевым, и мёртвая ссылка приедет вместе с ним.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type TemplateUsage = {
  /** Клеток со ссылкой на шаблон — по всем картам. */
  total: number;
  /** По картам, чтобы админ знал, где именно снимать. */
  maps: Array<{ name: string; count: number }>;
};

/**
 * Слои, где живёт id шаблона предмета: местность, дорога (склейка «id,id» —
 * разбираем как map-base), декор, постройка, объект (голый id или с префиксом
 * вида «chest:<id>» — тот же разбор, что objectKnownSql; боссы — своя
 * таблица, их тут нет).
 */
export async function templateOnMaps(id: string): Promise<TemplateUsage> {
  const v = sqlStr(id);
  const bare = `CASE WHEN c.object_id LIKE '%:%'
                     THEN split_part(c.object_id, ':', 2) ELSE c.object_id END`;
  const rows = (await mcpExec(
    `SELECT COALESCE(m.name, c.map_id) AS name, count(*)::int AS count
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.raid_maps m ON m.id = c.map_id
      WHERE c.decoration_id = ${v}
         OR c.terrain_id = ${v}
         OR c.building_id = ${v}
         OR (c.object_id IS NOT NULL AND c.object_id NOT LIKE 'boss:%' AND ${bare} = ${v})
         OR (c.road_id IS NOT NULL AND ${v} = ANY (
               SELECT btrim(p) FROM unnest(string_to_array(c.road_id, ',')) AS p))
      GROUP BY 1
      ORDER BY 2 DESC, 1;`,
    { wrapJson: true },
  )) as Array<{ name: string; count: number | string }> | null;
  const maps = (rows ?? []).map((r) => ({ name: String(r.name), count: Number(r.count) || 0 }));
  return { total: maps.reduce((sum, m) => sum + m.count, 0), maps };
}

/** Текст отказа админу: где и сколько стоит. Стиль — как соседние ошибки items.ts. */
export function templateOnMapsError(usage: TemplateUsage): string {
  const where = usage.maps.map((m) => `${m.name}: ${m.count}`).join(", ");
  return `Шаблон стоит на карте (клеток: ${usage.total} — ${where}). Сначала снимите его с клеток кистью или в редакторе, потом удаляйте`;
}
