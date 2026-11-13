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

/**
 * Вышел порталом: задание пройдено, «Сумка острова» снята, карта острова сносится.
 * Ресурсы сверх потолка выноса остаются на острове (§8.114) — кроме админов: у них
 * за время на острове идут доходы основного мира. Ответ — что срезано.
 */
export async function finishIsland(
  wallet: string,
  mapId: string,
): Promise<import("@/lib/raid/island/exitCap").ResAmounts> {
  const { raidOwner } = await import("../owner");
  const { markFinished } = await import("./island-row");
  const { dropIslandBag } = await import("./island-move");
  const { isAdminWallet } = await import("@/server/auth");
  const account = await raidOwner(wallet);
  const cut = isAdminWallet(wallet)
    ? {}
    : await (await import("./island-exit-cap")).applyExitCap(account, mapId);
  await markFinished(account);
  await dropIslandBag(account);
  // Друг прошёл обучение — вехи пригласившего могли дозреть (05.11.2026).
  void import("@/server/referralQualify").then((m) => m.noteReferralPurchase(wallet));
  // Фоном: ответ портала не ждёт уборку (два десятка DELETE).
  void dropFinishedIsland(mapId).catch((e) =>
    console.warn("[island] снос после выхода:", mapId, e instanceof Error ? e.message : e),
  );
  return cut;
}

/**
 * Карта пройденного острова не нужна (владелец, 14.10.2026: «чтобы не занимала
 * место и не была обузой»): игрок уже в мире, вернуться туда нельзя. Сносится
 * в любом случае — вместе со всем, что на ней осталось; что игрок забрал с
 * собой, остаётся у него. Накопленное шахтами начисляется хозяину до сноса,
 * остаток их 7 дней сгорает (dropIsland → island-mine-claim, 20.10). Строка
 * задания остаётся без карты — «прошёл» (миграция island-05).
 */
async function dropFinishedIsland(mapId: string): Promise<void> {
  if (!isIslandMapId(mapId)) return;
  const { dropIsland } = await import("./island-create");
  await dropIsland(mapId);
}
