// Точка добычи по погоде — ручки окна клетки в режиме бога (правила — lib/raid/lootSpawn,
// база — loot-spawn-01). Сохраняется сразу, без «Выгрузить». Убрать — точка удаляется,
// мешочек, если лежит, остаётся до забора или сгорания.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { requireAdmin } from "@/server/auth";
import { sqlStr } from "@/server/api/raid-shared";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { RESPAWN_MIN, SPAWN_WEATHER } from "@/lib/raid/mobSpawn";
import {
  LOOT_SPAWN_ART_MAX,
  LOOT_SPAWN_KINDS,
  LOOT_SPAWN_RESOURCES,
  parseAmountRange,
  type LootSpawnKind,
  type LootSpawnView,
} from "@/lib/raid/lootSpawn";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";

const cell = z.object({ q: z.number().int(), r: z.number().int() });

type Row = {
  id: string;
  weather: string | null;
  kind: LootSpawnKind;
  ref: string;
  amount_min: number;
  amount_max: number;
  respawn_min: number;
  out: boolean;
};

async function spotAt(mapId: string, q: number, r: number): Promise<LootSpawnView | null> {
  const rows = (await mcpExec(
    `SELECT s.id, s.weather, s.kind, s.ref, s.amount_min, s.amount_max, s.respawn_min,
            (s.bag_id IS NOT NULL) AS out
       FROM yuplink.raid_loot_spawn s
      WHERE s.map_id = ${sqlStr(mapId)} AND s.q = ${q} AND s.r = ${r};`,
    { wrapJson: true },
  )) as Row[] | null;
  const s = rows?.[0];
  return s
    ? {
        id: s.id,
        weather: s.weather,
        kind: s.kind,
        ref: s.ref,
        min: Number(s.amount_min),
        max: Number(s.amount_max),
        respawnMin: Number(s.respawn_min),
        out: s.out === true,
      }
    : null;
}

/** Что можно положить: ссылка обязана быть в справочнике своего вида. */
async function refExists(kind: LootSpawnKind, ref: string): Promise<boolean> {
  if (kind === "resource") return (LOOT_SPAWN_RESOURCES as readonly string[]).includes(ref);
  const sql =
    kind === "custom"
      ? `SELECT 1 AS ok FROM yuplink.raid_custom_item WHERE id = ${sqlStr(ref)}`
      : `SELECT 1 AS ok FROM yuplink.mystic_item_template WHERE id = ${sqlStr(ref)} AND kind = 'artifact'`;
  const rows = (await mcpExec(sql, { wrapJson: true })) as unknown[] | null;
  return (rows?.length ?? 0) > 0;
}

export const adminLootSpawnAt = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => cell.parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    return { spot: await spotAt(mapId, data.q, data.r), island: isIslandMapId(mapId) };
  });

export const adminSaveLootSpawn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    cell
      .extend({
        weather: z.enum(SPAWN_WEATHER).nullish(),
        kind: z.enum(LOOT_SPAWN_KINDS),
        ref: z.string().min(1).max(80),
        range: z.string().min(1).max(20),
        respawnMin: z.number().refine((v) => (RESPAWN_MIN as readonly number[]).includes(v)),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    const range = parseAmountRange(data.range);
    if (!range) throw new Error("Количество — число или диапазон «1-10»");
    if (data.kind === "art" && range.max > LOOT_SPAWN_ART_MAX)
      throw new Error(`Артефактов в мешочке — не больше ${LOOT_SPAWN_ART_MAX}`);
    const weather = data.weather ?? null;
    if (weather && isIslandMapId(mapId)) throw new Error("На острове погоды нет");
    if (!(await refExists(data.kind, data.ref))) throw new Error("Такого нет в справочнике");
    const w = weather ? sqlStr(weather) : "NULL";
    await mcpExec(
      `INSERT INTO yuplink.raid_loot_spawn
         (id, map_id, q, r, weather, kind, ref, amount_min, amount_max, respawn_min)
       VALUES (${sqlStr(`lsp_${nanoid(10)}`)}, ${sqlStr(mapId)}, ${data.q}, ${data.r}, ${w},
               ${sqlStr(data.kind)}, ${sqlStr(data.ref)}, ${range.min}, ${range.max}, ${data.respawnMin})
       ON CONFLICT (map_id, q, r) DO UPDATE SET
         weather = EXCLUDED.weather, kind = EXCLUDED.kind, ref = EXCLUDED.ref,
         amount_min = EXCLUDED.amount_min, amount_max = EXCLUDED.amount_max,
         respawn_min = EXCLUDED.respawn_min, updated_at = now()
       RETURNING id;`,
      { wrapJsonCte: true },
    );
    const { startMobSpawner } = await import("../mob-spawn/mob-spawn");
    startMobSpawner();
    return { spot: await spotAt(mapId, data.q, data.r) };
  });

export const adminRemoveLootSpawn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    await mcpExec(
      `DELETE FROM yuplink.raid_loot_spawn WHERE id = ${sqlStr(data.id)} AND map_id = ${sqlStr(mapId)};`,
    );
    return { ok: true as const };
  });
