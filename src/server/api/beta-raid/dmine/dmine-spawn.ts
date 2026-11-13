// Появление грибов на жилах (владелец, 22.10.2026: «золотая жила может
// сгенерировать золотой гриб или дарай гриб; алмазная — только алмазные …
// рядом с клеткой месторождения тоже, но шанс в 10 раз меньше») — шаг
// минутного обхода (dmine-sweep).
//
// Всё решает функция базы raid_mushroom_spawn_hour (migrations/mushroom-03):
// ключ часа (первый процесс в новом часу бросает, остальные — NULL; повтор
// моста того же вызова — по ключу вызова тот же итог, рассылка не теряется;
// пропущенные часы не догоняются), броски по жилам всех карт, годная пустая
// клетка, на клетке — более редкий вид, лимиты вида по всем мирам, журнал
// raid_mushroom_spawn. Шансы — settings.mushroom_spawn.
//
// Здесь — только рассылка: новые грибы одной дельтой на карту за час (журнал
// карты, словарь шаблона и обликов), карта у всех обновляется без F5.
import { randomUUID } from "node:crypto";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { CellPatch, MapDeltaAssets } from "@/lib/raid/mapDelta";
import { dmineAssets } from "@/server/api/beta-raid/dmine/dmine-announce";

/** Бросок часа; op — ключ этого вызова (мост повторяет текст вслепую — ключ тот же). */
export const spawnHourSql = (op: string): string =>
  `SELECT yuplink.raid_mushroom_spawn_hour(${sqlStr(op)}) AS res`;

export type SpawnedCell = { map: string; q: number; r: number; kind: string; skin: string };
export type SpawnRes = { hour: string; spawned: number; building: string; cells: SpawnedCell[] };

/** Ответ функции базы (jsonb объектом или строкой) → итог; NULL (час уже брошен) — null. */
export function spawnResOf(rows: unknown): SpawnRes | null {
  const row = Array.isArray(rows) ? (rows[0] as { res?: unknown } | undefined) : undefined;
  let res = row?.res;
  if (typeof res === "string") {
    try {
      res = JSON.parse(res);
    } catch {
      return null;
    }
  }
  if (!res || typeof res !== "object") return null;
  const o = res as Partial<SpawnRes>;
  const cells = Array.isArray(o.cells) ? o.cells : [];
  return {
    hour: String(o.hour ?? ""),
    spawned: Number(o.spawned) || 0,
    building: String(o.building ?? ""),
    cells: cells
      .filter((c) => c && typeof c.map === "string")
      .map((c) => ({ ...c, q: Number(c.q), r: Number(c.r) })),
  };
}

/** Новые грибы по картам → дельта клеток: постройка-гриб с обликом вида. */
export function spawnPatches(res: SpawnRes): Map<string, CellPatch[]> {
  const out = new Map<string, CellPatch[]>();
  for (const c of res.cells) {
    const list = out.get(c.map) ?? [];
    list.push({
      q: c.q,
      r: c.r,
      buildingId: res.building,
      buildingSkinId: c.skin,
      buildingConfig: { effect: "mine" },
    });
    out.set(c.map, list);
  }
  return out;
}

/** Словарь шаблона и всех обликов дельты — одним объектом. */
async function assetsOf(buildingId: string, skins: string[]): Promise<MapDeltaAssets> {
  const buildings: Record<string, unknown> = {};
  for (const skin of skins)
    Object.assign(buildings, (await dmineAssets(buildingId, skin)).buildings);
  return { buildings };
}

/** Шаг обхода: бросок часа и рассылка. Отдаёт, сколько грибов появилось. */
export async function spawnMushrooms(): Promise<number> {
  const sql = spawnHourSql(`spawn:${randomUUID()}`);
  const res = spawnResOf(await mcpExec(sql, { wrapJson: true }));
  if (!res || res.cells.length === 0) return 0;
  await announceSpawn(res);
  return res.spawned;
}

/**
 * Рассылка вставших грибов — одной дельтой на карту. Тот же вид ответа отдаёт
 * и возврат съеденных (raid_mushroom_respawn_due, dmine-respawn).
 */
export async function announceSpawn(res: SpawnRes): Promise<void> {
  const { recordMapChange } = await import("@/server/api/beta-raid/map-journal");
  for (const [mapId, patches] of spawnPatches(res)) {
    const skins = [...new Set(patches.map((p) => String(p.buildingSkinId)))];
    try {
      await recordMapChange(mapId, { patches }, () => assetsOf(res.building, skins));
    } catch (e) {
      console.warn(
        "[dmine] грибы появились, рассылка не прошла:",
        mapId,
        e instanceof Error ? e.message : e,
      );
    }
  }
}
