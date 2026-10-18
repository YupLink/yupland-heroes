// Портал острова ведёт в основной мир — не в комнату сети, как порталы этажей:
// у острова пары в мире нет и не нужно, в мире ничего ради него не строится.
// Новичок выходит к замку мира, админ на тесте — туда, откуда пришёл.
import { isIslandMapId } from "@/lib/raid/island/ids";
import type { MapCell } from "./island-move";

/** Выход портала острова; null — карта не остров (обычный портал). */
export async function islandPortalExit(wallet: string, mapId: string): Promise<MapCell | null> {
  if (!isIslandMapId(mapId)) return null;
  const { raidOwner } = await import("../owner");
  const { loadIsland } = await import("./island-row");
  const row = await loadIsland(await raidOwner(wallet));
  // Чужой остров не бывает «своим порталом»: на нём стоит только хозяин.
  if (!row || row.mapId !== mapId) throw new Error("island.not_yours");
  // Ачивки острова не готовы — портал не пускает (§8.57).
  const { requireIslandGate } = await import("../../achievements/gate");
  await requireIslandGate(wallet, mapId);
  if (row.back) return row.back;
  const { mainWorldStart } = await import("./island-move");
  return mainWorldStart();
}

/** Вышел порталом: задание пройдено, «Сумка острова» снята, карта острова сносится. */
export async function finishIsland(wallet: string, mapId: string): Promise<void> {
  const { raidOwner } = await import("../owner");
  const { markFinished } = await import("./island-row");
  const { dropIslandBag } = await import("./island-move");
  const account = await raidOwner(wallet);
  await markFinished(account);
  await dropIslandBag(account);
  // Фоном: ответ портала не ждёт уборку (два десятка DELETE).
  void dropFinishedIsland(mapId).catch((e) =>
    console.warn("[island] снос после выхода:", mapId, e instanceof Error ? e.message : e),
  );
}

/**
 * Карта пройденного острова не нужна (владелец, 14.10.2026: «чтобы не занимала
 * место и не была обузой»): игрок уже в мире, вернуться туда нельзя. Сносится
 * в любом случае — вместе со всем, что на ней осталось; что игрок забрал с
 * собой, остаётся у него. Строка задания остаётся без карты — «прошёл»
 * (миграция island-05).
 */
async function dropFinishedIsland(mapId: string): Promise<void> {
  if (!isIslandMapId(mapId)) return;
  const { dropIsland } = await import("./island-create");
  await dropIsland(mapId);
}
