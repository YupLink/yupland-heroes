// Сохранённые карты (владелец, 04.11.2026: остров Ангелины «не удалять ни в
// коем случае»). Удалить такую карту не даёт сама база (raid_map_keep, триггер
// map.kept, migrations/island-keep-01); здесь — чтобы «Новый остров»,
// «Обучение с нуля» и портал отказывали заранее, а не падали на полпути.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export async function isKeptMap(mapId: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM yuplink.raid_map_keep WHERE map_id = ${sqlStr(mapId)} LIMIT 1;`,
    { wrapJson: true },
  )) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

/** Остров сохранён — «island.kept» (сносить и пересоздавать нельзя). */
export async function requireNotKept(mapId: string | null): Promise<void> {
  if (mapId && (await isKeptMap(mapId))) throw new Error("island.kept");
}
