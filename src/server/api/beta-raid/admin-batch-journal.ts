// Журнал карты после выгрузки кисти: дельтой клеток или «карта перестроена».
//
// Вынесено из admin-live-batch.ts (лимит строк) без изменения правил, кроме
// одного: настройки постройки (buildingConfig) — тоже слой дельты. Эффект
// клетки решает, шахта ли она (§8.59 п. 9), и «Лавка Алхимика», ставшая шахтой
// одним эффектом, без него оставалась бы у игроков проходимой до перекачки.
import type { CellPatch } from "@/lib/raid/mapDelta";
import type { AdminCellPatch } from "@/server/api/beta-raid/admin-cell-patch";
import { deltaBuildingConfig } from "@/server/api/beta-raid/delta-building-config";

/** Патчи дельты по применённым правкам (без «alive» — его шлёт правда слоя). */
export function batchDeltaPatches(applied: AdminCellPatch[]): CellPatch[] {
  return applied
    .filter(
      (c) =>
        c.terrainId !== undefined ||
        c.roadId !== undefined ||
        c.decorationId !== undefined ||
        c.objectId !== undefined ||
        c.buildingSkinId !== undefined ||
        c.buildingConfig !== undefined ||
        c.tier !== undefined ||
        c.voidFog !== undefined ||
        c.groupId !== undefined ||
        c.iconScale !== undefined,
    )
    .map((c) => ({
      q: c.q,
      r: c.r,
      ...(c.terrainId !== undefined ? { terrainId: c.terrainId ?? null } : {}),
      ...(c.roadId !== undefined ? { roadId: c.roadId ?? null } : {}),
      ...(c.decorationId !== undefined ? { decorationId: c.decorationId ?? null } : {}),
      // Живость — из черновика: кисть может положить объект сразу
      // «добытым» (alive: false), и дельта не должна оживлять его.
      ...(c.objectId !== undefined
        ? { objectId: c.objectId ?? null, alive: c.alive !== false, runner: false }
        : {}),
      ...(c.buildingSkinId !== undefined ? { buildingSkinId: c.buildingSkinId ?? null } : {}),
      // Только эффект: прочие настройки (награды, цели порталов) карта игрокам не отдаёт.
      ...(c.buildingConfig !== undefined
        ? { buildingConfig: deltaBuildingConfig(c.buildingConfig) }
        : {}),
      ...(c.tier !== undefined ? { tier: c.tier } : {}),
      ...(c.voidFog !== undefined ? { voidFog: c.voidFog } : {}),
      // Блоки: без этого объединение не доехало бы до игроков и второй
      // вкладки админа до F5 — и не подняло бы editSeq редактора карт.
      ...(c.groupId !== undefined ? { groupId: c.groupId ?? null } : {}),
      ...(c.iconScale !== undefined ? { iconScale: c.iconScale ?? null } : {}),
    }));
}

/**
 * Разослать выгрузку. Постройки меняют окна и список ратуш — тогда
 * «перестроена»; так же и `rebuild` — сменились члены блоков-шахт, которых
 * дельта не передаёт (mine-block-sync).
 */
export async function journalBatch(
  mapId: string,
  applied: AdminCellPatch[],
  rebuild: boolean,
): Promise<void> {
  const { noteAdminPatches, noteMapRebuilt, noteCellsChanged } =
    await import("@/server/api/beta-raid/map-change-hooks");
  const touchesTown = applied.some((c) => c.buildingId !== undefined);
  if (rebuild || touchesTown || applied.length > 500) {
    await noteMapRebuilt(mapId);
    return;
  }
  const patches = batchDeltaPatches(applied);
  if (patches.length > 0) await noteAdminPatches(mapId, patches);
  // «alive» в патче — не слой: слой объектов клетки перечитывается из базы.
  const alive = applied.filter((c) => c.alive !== undefined && c.objectId === undefined);
  if (alive.length > 0)
    await noteCellsChanged(
      mapId,
      alive.map((c) => `${c.q},${c.r}`),
    );
}
