// Мир строителей (lib/landPlace): какой карта — в settings 'builder_world'
// = {"mapId": "..."} (ставит api.cron.builder-world-setup). Кэш минута: мир
// создают раз в жизни, а спрашивают на каждое действие с землёй и портал.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export const BUILDER_WORLD_KEY = "builder_world";
const TTL_MS = 60_000;
let hit: { at: number; id: string | null } | null = null;

/** id карты мира строителей; null — мир ещё не создан. */
export async function builderWorldId(): Promise<string | null> {
  if (hit && Date.now() - hit.at < TTL_MS) return hit.id;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(BUILDER_WORLD_KEY)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ value: unknown }>;
  let id: string | null = null;
  try {
    const raw = rows?.[0]?.value;
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as { mapId?: unknown };
    id = typeof v?.mapId === "string" && v.mapId ? v.mapId : null;
  } catch {
    id = null;
  }
  hit = { at: Date.now(), id };
  return id;
}

/** Сбросить кэш (после создания мира). */
export function dropBuilderWorldCache(): void {
  hit = null;
}

/** Это мир строителей? */
export async function isBuilderWorld(mapId: string | null | undefined): Promise<boolean> {
  if (!mapId) return false;
  return (await builderWorldId()) === mapId;
}
