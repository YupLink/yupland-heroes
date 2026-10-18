// Что лопата сделает с клеткой (ПРАВИЛА §8.24) — зеркало сервера для кнопки:
// бугорок (всё на клетке закопано) — «Выкопать», мешочек — «Закопать»,
// обычный или свой магический сундук — «Закопать», пустая земля, где можно
// стоять, — «Копать». Живой объект (сначала бой), декор (сначала рубка),
// корабль, постройка, объект, вода, купол, нет местности — ничего; клетка
// города — тоже: тап по ней открывает окно города. Под зданием (и всей
// площадью большого) не копают и не закапывают — только выкопать старое
// (владелец 03.10). Решает сервер (loot-bag/bag-dig, plain-chest/pchest-dig,
// main-tool/ground-dig).
import type { LootBagCell } from "@/lib/lootBag";
import type { ChestMark } from "@/lib/magicChest";
import type { Cell } from "@/components/beta-raid/unpackMap";
import type { ShovelAct } from "@/components/beta-raid/tool/shovelOffer";

export function shovelActAt(o: {
  cell: Cell | undefined;
  bag: LootBagCell | undefined;
  chest: ChestMark | undefined;
  ship: boolean;
  water: boolean;
  /** Клетка — часть большого здания (блок с постройкой, mergeBlocks). */
  inBuilding?: boolean;
}): ShovelAct | null {
  const { cell } = o;
  if (o.ship || cell?.decorationId) return null;
  if (cell?.objectId && !cell.objectDefeated) return null;
  const building = !!cell?.buildingId || o.inBuilding === true;
  if (o.bag) return o.bag.buried ? "unbury" : building ? null : "bury";
  if (o.chest) return !building && (o.chest.plain || o.chest.mine) ? "bury" : null;
  if (!cell?.terrainId || cell.voidFog || building || cell.objectId || o.water) return null;
  return cell.townHall ? null : "dig";
}
