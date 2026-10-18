// Портал острова пускает в основной мир только с ачивками (§8.57; владелец,
// 17.10.2026: «не пропускать в портал раньше, чем он выполнит все ачивки
// хотя бы на 1-2 уровень»): все 8 — обычная редкость. Держит и починку
// портала, и сам проход — обойти окно кнопкой не выйдет.
import { isIslandMapId } from "@/lib/raid/island/ids";
import { islandGateDone, islandGateOk } from "@/lib/achievements/tracks";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { loadAchCounts } from "./read";

/** null — пускает; иначе сколько ачивок из 8 уже готово. */
export async function islandGateBlock(wallet: string, mapId: string): Promise<number | null> {
  if (!isIslandMapId(mapId)) return null;
  const counts = await loadAchCounts(await raidOwner(wallet));
  return islandGateOk(counts) ? null : islandGateDone(counts);
}

export const islandGateText = (done: number) =>
  `Сначала ачивки: все 8 — «Обычная». Готово ${done} из 8.`;

/** Бросить, если портал острова ещё закрыт ачивками. */
export async function requireIslandGate(wallet: string, mapId: string): Promise<void> {
  const done = await islandGateBlock(wallet, mapId);
  if (done !== null) throw new Error(islandGateText(done));
}
