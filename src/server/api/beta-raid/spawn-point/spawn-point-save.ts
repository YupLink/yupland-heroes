// Сохранение точки спавна — общее для окна клетки и постановки по шаблону
// (spawn-template-api): пересборка мобов точки, пул наград Darai, дельта игрокам.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { parseRewardConfig, sqlStr } from "@/server/api/raid-shared";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { spawnWeathers, type SpawnWeather } from "@/lib/raid/mobSpawn";
import {
  POINT_MAX_MOBS,
  placementOrder,
  pointMobTotal,
  type SpawnPointMob,
  type SpawnPointView,
} from "@/lib/raid/spawnPoint";
import { pointAtSql, pointLiveSql, removePointSql, savePointSql } from "./spawn-point-sql";

type PointRow = {
  id: string;
  q: number;
  r: number;
  radius: number;
  mobs: unknown;
  slots: number;
  alive: number;
};

export async function pointAt(mapId: string, q: number, r: number): Promise<SpawnPointView | null> {
  const rows = (await mcpExec(pointAtSql(mapId, q, r), { wrapJson: true })) as PointRow[];
  const p = rows?.[0];
  if (!p) return null;
  const raw = typeof p.mobs === "string" ? (JSON.parse(p.mobs) as unknown) : p.mobs;
  return {
    id: p.id,
    q: Number(p.q),
    r: Number(p.r),
    radius: Number(p.radius),
    mobs: Array.isArray(raw) ? (raw as SpawnPointMob[]) : [],
    slots: Number(p.slots) || 0,
    alive: Number(p.alive) || 0,
  };
}

/** Шаблоны мобов существуют (raid_boss_template) — иначе на карту встал бы пустой «boss:». */
async function requireMobs(ids: string[]): Promise<void> {
  const uniq = [...new Set(ids)];
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.raid_boss_template WHERE id IN (${uniq.map(sqlStr).join(", ")})`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  if ((rows ?? []).length !== uniq.length) throw new Error("Такого моба нет — выбери из списка");
}

/**
 * Снять мобов точки и всё, что меняет карта: пул наград Darai (до и после) и
 * дельта клеток игрокам. run — сама запись (пересборка или удаление).
 */
export async function withCleared<T>(mapId: string, pointId: string | null, run: () => Promise<T>) {
  const live = pointId
    ? (((await mcpExec(pointLiveSql(pointId), { wrapJson: true })) ?? []) as Array<{
        q: number;
        r: number;
      }>)
    : [];
  const cells = live.map((c) => ({ q: Number(c.q), r: Number(c.r) }));
  const { readDaraiHold, settleDaraiHold } = await import("../map-darai-hold");
  const hold = cells.length ? await readDaraiHold(mapId, cells) : null;
  const out = await run();
  if (hold) await settleDaraiHold(hold);
  if (cells.length) {
    const hooks = await import("../map-change-hooks");
    await hooks.noteCellsChanged(
      mapId,
      cells.map((c) => `${c.q},${c.r}`),
    );
  }
  return out;
}

/** Строка мобов как пришла из формы или шаблона. */
export type MobInput = {
  mob: string;
  count: number;
  weathers: SpawnWeather[];
  respawnMin: number;
  reward?: unknown;
};

/**
 * Разобрать строки мобов: погода и награда в каноническом виде, проверки точки.
 * mapId — только для запрета погоды на острове ("" — карта не задана, шаблон).
 */
export async function normalizeMobs(mapId: string, input: MobInput[]): Promise<SpawnPointMob[]> {
  const mobs: SpawnPointMob[] = input.map((m) => ({
    mob: m.mob.trim(),
    count: m.count,
    weathers: spawnWeathers(m.weathers),
    respawnMin: m.respawnMin,
    reward: m.reward == null ? null : parseRewardConfig(m.reward),
  }));
  if (pointMobTotal(mobs) > POINT_MAX_MOBS)
    throw new Error(`На точке — до ${POINT_MAX_MOBS} мобов`);
  if (isIslandMapId(mapId) && mobs.some((m) => m.weathers.length))
    throw new Error("На острове погоды нет");
  await requireMobs(mobs.map((m) => m.mob));
  return mobs;
}

/** Поставить или пересобрать точку на клетке; мобы встают минутным проходом. */
export async function savePointAt(
  mapId: string,
  q: number,
  r: number,
  radius: number,
  input: MobInput[],
): Promise<{ point: SpawnPointView | null; placed: number; wanted: number }> {
  const mobs = await normalizeMobs(mapId, input);
  const before = await pointAt(mapId, q, r);
  const id = before?.id ?? `spt_${nanoid(10)}`;
  const placed = await withCleared(mapId, before?.id ?? null, async () => {
    const sql = savePointSql({ id, mapId, q, r, radius, mobs, order: placementOrder(mobs) });
    return Number(sqlRow<{ placed?: number }>((await mcpExec(sql)) as unknown[])?.placed) || 0;
  });
  // Мобы встают минутным проходом: будим его сейчас, а не через минуту.
  const { mobSpawnPass, startMobSpawner } = await import("../mob-spawn/mob-spawn");
  startMobSpawner();
  void mobSpawnPass().catch(() => undefined);
  return { point: await pointAt(mapId, q, r), placed, wanted: pointMobTotal(mobs) };
}

/** Убрать точку: не раненые мобы уходят с карты, записи и точка стёрты. */
export async function removePointAt(mapId: string, q: number, r: number): Promise<void> {
  const before = await pointAt(mapId, q, r);
  if (!before) return;
  await withCleared(mapId, before.id, () => mcpExec(removePointSql(mapId, before.id)));
}
