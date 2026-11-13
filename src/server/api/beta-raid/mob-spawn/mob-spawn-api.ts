// Точка возрождения моба — ручки окна клетки в режиме бога (правила — mob-spawn.ts).
//
// Точку находят по клетке: родной (моб убит и ждёт) или той, где моб сейчас
// бродит. Включить можно только на клетке с живым мобом: точка запоминает,
// какой он, и эта клетка становится родной.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { requireAdmin } from "@/server/auth";
import { sqlStr } from "@/server/api/raid-shared";
import { CELL_LAYER, deadHpSql } from "@/server/api/beta-raid/runners";
import {
  RESPAWN_MIN,
  ROAM_CELLS,
  SPAWN_WEATHER,
  STEP_MIN,
  spawnWeathers,
  type MobSpawnView,
} from "@/lib/raid/mobSpawn";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { weatherNowSql } from "./mob-spawn-weather-sql";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";

const cell = z.object({ q: z.number().int(), r: z.number().int() });
const oneOf = (list: readonly number[]) => z.number().refine((v) => list.includes(v));

type SpawnRow = {
  id: string;
  respawn_min: number;
  roam: number;
  step_min: number;
  home_q: number;
  home_r: number;
  alive: boolean;
  due_in: number | null;
  weather: string | null;
  weathers: string[] | null;
  weather_now: boolean;
  point_q: number | null;
  point_r: number | null;
};

async function spawnAt(mapId: string, q: number, r: number): Promise<SpawnRow | null> {
  const rows = (await mcpExec(
    `SELECT s.id, s.respawn_min, s.roam, s.step_min, s.home_q, s.home_r,
            s.dead_at IS NULL AS alive, s.weather, s.weathers, ${weatherNowSql("s")} AS weather_now,
            p.q AS point_q, p.r AS point_r,
            CASE WHEN s.dead_at IS NULL THEN NULL
                 ELSE GREATEST(0, ceil(extract(epoch FROM
                   s.dead_at + make_interval(mins => s.respawn_min) - now()) / 60))::int END AS due_in
       FROM yuplink.raid_mob_spawn s
       LEFT JOIN yuplink.raid_spawn_point p ON p.id = s.point_id
      WHERE s.map_id = ${sqlStr(mapId)}
        AND ((s.home_q = ${q} AND s.home_r = ${r}) OR (s.cur_q = ${q} AND s.cur_r = ${r}))
      ORDER BY (s.cur_q = ${q} AND s.cur_r = ${r}) DESC NULLS LAST
      LIMIT 1;`,
    { wrapJson: true },
  )) as SpawnRow[];
  return rows?.[0] ?? null;
}

const view = (s: SpawnRow): MobSpawnView => ({
  id: s.id,
  respawnMin: Number(s.respawn_min),
  roam: Number(s.roam),
  stepMin: Number(s.step_min),
  home: { q: Number(s.home_q), r: Number(s.home_r) },
  alive: s.alive === true,
  dueInMin: s.due_in == null ? null : Number(s.due_in),
  weathers: spawnWeathers(s.weathers, s.weather),
  weatherNow: s.weather_now !== false,
  point: s.point_q == null ? null : { q: Number(s.point_q), r: Number(s.point_r) },
});

/** Точка на клетке (или null) и можно ли её здесь включить (живой моб). */
export const adminMobSpawnAt = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => cell.parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    const found = await spawnAt(mapId, data.q, data.r);
    const mob = (await mcpExec(
      `SELECT 1 AS ok FROM yuplink.raid_map_cells c
        WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${data.q} AND c.r = ${data.r}
          AND c.object_id LIKE 'boss:%' AND NOT ${deadHpSql("c", CELL_LAYER)};`,
      { wrapJson: true },
    )) as unknown[];
    return { spawn: found ? view(found) : null, canCreate: (mob?.length ?? 0) > 0 };
  });

/** Включить или поправить точку на клетке. */
export const adminSaveMobSpawn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    cell
      .extend({
        respawnMin: oneOf(RESPAWN_MIN),
        roam: oneOf(ROAM_CELLS),
        stepMin: oneOf(STEP_MIN),
        /** Погода точки (§8.49б) — любая из списка; пусто — любая. */
        weathers: z.array(z.enum(SPAWN_WEATHER)).max(SPAWN_WEATHER.length).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    const m = sqlStr(mapId);
    const weathers = spawnWeathers(data.weathers);
    if (weathers.length && isIslandMapId(mapId)) throw new Error("На острове погоды нет");
    const w = weathers.length ? `ARRAY[${weathers.map(sqlStr).join(", ")}]::text[]` : "NULL";
    const found = await spawnAt(mapId, data.q, data.r);
    if (found) {
      await mcpExec(
        `UPDATE yuplink.raid_mob_spawn
            SET respawn_min = ${data.respawnMin}, roam = ${data.roam}, step_min = ${data.stepMin},
                weathers = ${w}, weather = NULL,
                next_step_at = LEAST(next_step_at, now() + make_interval(mins => ${data.stepMin})),
                updated_at = now()
          WHERE id = ${sqlStr(found.id)};`,
      );
    } else {
      // Моб — тот, что стоит на клетке сейчас: его id и настройки.
      const rows = (await mcpExec(
        `INSERT INTO yuplink.raid_mob_spawn
           (id, map_id, home_q, home_r, object_id, object_config, respawn_min, roam, step_min,
            cur_q, cur_r, next_step_at, weathers)
         SELECT ${sqlStr(`msp_${nanoid(10)}`)}, c.map_id, c.q, c.r, c.object_id, c.object_config,
                ${data.respawnMin}, ${data.roam}, ${data.stepMin}, c.q, c.r,
                now() + make_interval(secs => random() * ${data.stepMin * 60}), ${w}
           FROM yuplink.raid_map_cells c
          WHERE c.map_id = ${m} AND c.q = ${data.q} AND c.r = ${data.r}
            AND c.object_id LIKE 'boss:%' AND NOT ${deadHpSql("c", CELL_LAYER)}
         ON CONFLICT (map_id, home_q, home_r) DO NOTHING
         RETURNING id;`,
        { wrapJsonCte: true },
      )) as unknown[];
      if (!rows?.length) throw new Error("На клетке нет живого моба");
    }
    const { startMobSpawner } = await import("./mob-spawn");
    startMobSpawner();
    const saved = await spawnAt(mapId, data.q, data.r);
    return { spawn: saved ? view(saved) : null };
  });

/** Убрать точку: моб остаётся где стоит, больше не возрождается и не бродит. */
export const adminRemoveMobSpawn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    await mcpExec(
      `DELETE FROM yuplink.raid_mob_spawn
        WHERE id = ${sqlStr(data.id)} AND map_id = ${sqlStr(mapId)};`,
    );
    return { ok: true as const };
  });
