// Точка спавна — ручки окна клетки в режиме бога (правила — lib/raid/spawnPoint).
// Сохранить = пересобрать: старые мобы точки сняты (не раненые), новые записи
// возрождения расставлены по свободным клеткам радиуса; встают минутным
// проходом (mob-spawn) — сразу или в свою погоду. Награда Darai снятых — в пул.
// Сама пересборка — spawn-point-save (общая с постановкой по шаблону).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SPAWN_WEATHER } from "@/lib/raid/mobSpawn";
import { POINT_COUNT, POINT_MAX_ROWS, POINT_RADIUS, isPointRespawn } from "@/lib/raid/spawnPoint";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";

export const cell = z.object({ q: z.number().int(), r: z.number().int() });
const oneOf = (list: readonly number[]) => z.number().refine((v) => list.includes(v));
export const mobIn = z.object({
  mob: z.string().min(1).max(64),
  count: oneOf(POINT_COUNT),
  weathers: z.array(z.enum(SPAWN_WEATHER)).max(SPAWN_WEATHER.length).default([]),
  respawnMin: z.number().refine(isPointRespawn),
  reward: z.unknown().nullable().default(null),
});
export const pointBody = z.object({
  radius: oneOf(POINT_RADIUS),
  mobs: z.array(mobIn).min(1).max(POINT_MAX_ROWS),
});
const saveIn = cell.merge(pointBody);

export const adminSpawnPointAt = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => cell.parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    const { pointAt } = await import("./spawn-point-save");
    return { point: await pointAt(mapId, data.q, data.r) };
  });

/** Поставить или поправить точку: мобы пересобраны, встают минутным проходом. */
export const adminSaveSpawnPoint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveIn.parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    const { savePointAt } = await import("./spawn-point-save");
    return savePointAt(mapId, data.q, data.r, data.radius, data.mobs);
  });

/** Убрать точку: не раненые мобы уходят с карты, записи и точка стёрты. */
export const adminRemoveSpawnPoint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cell.parse(d))
  .handler(async ({ data }) => {
    const { mapId } = await requireGodAdmin();
    const { removePointAt } = await import("./spawn-point-save");
    await removePointAt(mapId, data.q, data.r);
    return { ok: true as const };
  });
