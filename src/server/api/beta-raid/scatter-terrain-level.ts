// Уровень МЕСТНОСТИ для автораздачи (владелец, 25.09): у типа местности есть
// «уровень» (meta.level шаблона), и мобов можно раскидать только на местности
// уровня n или n–n. Местность без уровня под такой фильтр не попадает.
import { mcpExec } from "../../db/mcpClient";
import type { LevelRange } from "@/lib/raid/levelRange";

/** Текст запроса отдельно — тест читает правило «уровень только числом». */
export const terrainsAtLevelSql = (r: LevelRange): string =>
  `SELECT t.id FROM yuplink.mystic_item_template t
    WHERE t.kind = 'terrain' AND COALESCE(t.active, true)
      AND jsonb_typeof(t.meta->'level') = 'number'
      AND (t.meta->>'level')::numeric BETWEEN ${Math.floor(r.from)} AND ${Math.floor(r.to)}
    ORDER BY t.id;`;

/** id местностей нужного уровня. */
export async function terrainsAtLevel(r: LevelRange): Promise<string[]> {
  const rows = ((await mcpExec(terrainsAtLevelSql(r), { wrapJson: true })) ?? []) as Array<{
    id: string;
  }>;
  return rows.map((x) => String(x.id));
}

/** Подпись диапазона для отчёта: «5» или «1–10». */
export const levelLabel = (r: LevelRange): string =>
  r.from === r.to ? String(r.from) : `${r.from}–${r.to}`;
