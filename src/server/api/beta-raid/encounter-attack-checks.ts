// Проверки входа удара энкаунтера (encounter-attack): та ли цель на клетке,
// стоит ли герой рядом, дотянется ли через воду, не в пустоте ли клетка и
// жив ли ещё объект. Порядок проверок — тот же, что был в самом ударе.
import { loadEncounterTarget, type EncounterTarget } from "@/server/api/beta-raid/encounter-target";
import {
  applyCellOverride,
  loadCellObject,
  priceOnMap,
  requireCellObject,
  type CellObject,
} from "@/server/api/beta-raid/cell-override";
import { targetFromSnapshot } from "@/server/api/beta-raid/boss-snapshot";
import { ensureObjectHp, type ObjectHpRow } from "@/server/api/beta-raid/encounter-hp";
import { myMapId, playerCell, requireAdjacent } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";

export type AttackSpot = {
  mapId: string;
  cell: CellObject;
  target: EncounterTarget;
  hpRow: ObjectHpRow;
};

export async function resolveAttackTarget(
  wallet: string,
  data: { objectId: string; q: number; r: number },
): Promise<AttackSpot> {
  const mapId = await myMapId(wallet);
  // Каждая клетка — самостоятельный экземпляр: параметры и награды можно
  // задать ей отдельно, не трогая другие копии того же босса.
  //
  // И объект клетки обязан совпасть с присланным. Без этой сверки цель боя
  // задавал клиент: на любой пустой траве объявлялся любой сундук из
  // справочника, и его награда забиралась за одну энергию.
  const cell = await loadCellObject(mapId, data.q, data.r);
  requireCellObject(cell.objectId, data.objectId);
  // Шаблон, а нет его — снимок клетки: удаление заготовки не должно
  // превращать живого босса в непроходимую пустоту (boss-snapshot).
  const tpl =
    (await loadEncounterTarget(data.objectId)) ?? targetFromSnapshot(data.objectId, cell.snapshot);
  if (!tpl) throw new Error("Объект не найден");
  const target = priceOnMap(applyCellOverride(tpl, cell.override, cell.terrainBg), mapId);
  const pos = await playerCell(wallet);
  requireAdjacent(pos, data.q, data.r);
  // Цель плавает — значит и герой должен: с берега до неё не дотянуться.
  // Водность клетки пришла вместе с объектом, лишнего запроса нет.
  const { requireWaterReach } = await import("@/server/api/beta-raid/water-reach");
  await requireWaterReach(mapId, cell.water, pos);
  await requireNotVoid(wallet, mapId, data.q, data.r);

  // Слой берётся из самой клетки: верхний объект или спрятавшийся под ним
  // беглец — тот же выбор, который карта нарисовала игроку (cell-override).
  const hpRow = await ensureObjectHp({
    mapId,
    q: data.q,
    r: data.r,
    layer: cell.layer,
    target,
  });
  if (hpRow.current_hp <= 0) {
    throw new Error(`${target.badgeLabel} уже опустошён`);
  }
  return { mapId, cell, target, hpRow };
}
