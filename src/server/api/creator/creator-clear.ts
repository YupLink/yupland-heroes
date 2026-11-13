// «Очистить всё» мира креатора (владелец, 07.11.2026: «кнопка — очистить всё,
// полностью все клетки, чтобы начать делать из пустоты»). Мир остаётся (имя,
// автор, общий доступ, старт героя), все клетки становятся пустыми, состояние
// поверх них уходит (creator-sql.clearStateSql). Игрокам мир уезжает
// пересборкой (recordMapChange full), а не правкой каждой из 4096 клеток.
import { mcpExec } from "@/server/db/mcpClient";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import { clearStateSql, hallsSql, wipeCellsSql } from "./creator-map-sql";

export async function clearWork(mapId: string): Promise<void> {
  // Предохранитель: очищается только мир креатора — живой мир и острова никогда.
  if (!isCreatorMapId(mapId)) throw new Error("creator.not_yours");
  const { readDaraiHold, settleDaraiHold } = await import("../beta-raid/map-darai-hold");
  // Снимок обеспечения наград ДО очистки: снятые объекты вернут резерв в пул.
  const hold = await readDaraiHold(mapId, null);
  const halls = ((await mcpExec(hallsSql(mapId), { wrapJson: true }).catch(() => [])) ??
    []) as Array<{ q: number; r: number }>;
  await mcpExec(wipeCellsSql(mapId), { wrapJson: false });
  // Ратуши — штатно: реестр, касса, привязка лавок (как при сносе кистью).
  const { handleBuildingChange } = await import("../beta-raid/town-resolve");
  for (const h of halls) await handleBuildingChange(mapId, Number(h.q), Number(h.r), null, null);
  for (const s of clearStateSql(mapId)) {
    await mcpExec(s, { wrapJson: false }).catch((e) =>
      console.warn("[creator] очистка:", mapId, e instanceof Error ? e.message : e),
    );
  }
  await settleDaraiHold(hold);
  const { purgeMapBase } = await import("../beta-raid/map-base");
  const { dropVoidCache } = await import("../beta-raid/voidCells");
  const { dropFleeCache } = await import("../beta-raid/flee-cells");
  purgeMapBase(mapId);
  dropVoidCache(mapId);
  dropFleeCache(mapId);
  const { noteMapRebuilt } = await import("../beta-raid/map-change-hooks");
  await noteMapRebuilt(mapId);
  const { publishRaid } = await import("@/server/raidLive");
  publishRaid({ mapId, type: "restored" });
}
