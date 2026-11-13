// Карта — чей-то демо-остров (demo-island.ts)? Лёгкая проверка без генератора:
// портал демо-острова никуда не ведёт — ни выхода, ни платной починки.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { isCreatorMapId } from "@/lib/raid/creator/ids";

export const DEMO_PORTAL_TEXT = "Портал демо-острова никуда не ведёт";

/** Портал работы креатора (isle_cw_…) — тоже никуда: работы вне сети порталов. */
export const CREATOR_PORTAL_TEXT = "Портал шаблона никуда не ведёт";

/** Текст отказа портала на этой карте (демо-остров или работа креатора). */
export const noExitText = (mapId: string): string =>
  isCreatorMapId(mapId) ? CREATOR_PORTAL_TEXT : DEMO_PORTAL_TEXT;

export async function isDemoMap(mapId: string): Promise<boolean> {
  if (isCreatorMapId(mapId)) return true;
  if (!isIslandMapId(mapId)) return false;
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM yuplink.raid_demo_island WHERE map_id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}
