// Отметка «на клетке шахта» после правки карты (ПРАВИЛА §8.59 п. 9).
//
// Снимок карты приносит готовый список шахт: его считает сервер тем же SQL,
// что и шаг (mine-cell-sql). Дельта же несёт только постройку клетки и её
// настройки — отметку приходится вывести из них по той же лестнице, что у
// cellBuildingEffect: эффект клетки → эффект шаблона → имя.
//
// Эффект шаблона кладёт в запись словаря построек сервер (buildings.ts →
// effect; у облика — эффект базовой постройки). Запись кисти админа поля не
// знает — тогда, как и сервер для шаблона без meta.effect, угадываем по имени.
import { cellBuildingEffect } from "@/lib/buildingEffect";
import type { CellPatch } from "@/lib/raid/mapDelta";

/** Запись словаря построек карты — из неё нужны только эффект и имя. */
export type BuildingEntry = { name?: unknown; effect?: unknown } | null | undefined;

/** Шахта ли постройка — по записи словаря и настройкам самой клетки. */
export function isMineEntry(entry: BuildingEntry, cellConfig: unknown): boolean {
  const name = typeof entry?.name === "string" ? entry.name : null;
  // effect: null в записи снимка — «у шаблона эффекта нет», имя уже не смотрим.
  const meta = entry && "effect" in entry ? { effect: entry.effect ?? null } : null;
  return cellBuildingEffect(cellConfig, meta, name) === "mine";
}

/**
 * Отметка после правки: true/false — правка решила; undefined — постройку
 * клетки не тронула (или тронула так, что решить нечем), остаётся прежняя.
 *
 * `before` — постройка в колонке клетки ДО правки (у облика — «skin:<id>»).
 */
export function mineAfterPatch(
  patch: CellPatch,
  entryOf: (id: string) => BuildingEntry,
  before: string | null,
): boolean | undefined {
  if (patch.buildingId === null) return false;
  if (typeof patch.buildingId === "string") {
    const skin = patch.buildingSkinId ? entryOf(`skin:${patch.buildingSkinId}`) : undefined;
    const entry = entryOf(patch.buildingId) ?? skin;
    if (patch.buildingConfig !== undefined) return isMineEntry(entry, patch.buildingConfig);
    // Та же постройка без настроек (повторный мазок): эффект, назначенный
    // клетке в режиме бога, правка не несёт — прежняя отметка вернее.
    if (patch.buildingId === before) return undefined;
    return isMineEntry(entry, null);
  }
  // Поменялись только настройки — постройка та же, что стояла.
  if (patch.buildingConfig !== undefined && before) {
    return isMineEntry(entryOf(before), patch.buildingConfig);
  }
  return undefined;
}
