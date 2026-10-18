// «Игрок стоит у постройки „Турнир“» — общая проверка окна турниров.
//
// Как у музея (museum-gate.ts): проверяется клетка, на которую тапнули, — на
// ней постройка с поведением 'tournament', — и что игрок стоит на ней или
// рядом. Отказы — ключами перевода (tour.err.*), игрок прочтёт на своём языке.
import { areNeighbors } from "../beta-raid/helpers";
import { loadCellBuilding } from "../beta-raid/building-action";
import { myMapId, ownCell } from "../beta-raid/encounter-where";

/** Поведение постройки «Турнир» (buildingEffect: белый список эффектов). */
export const TOUR_EFFECT = "tournament";

/** Проверка пройдена — карта Арены (плата за запись пишется в журнал сделок с её клеткой). */
export async function requireTourHere(wallet: string, q: number, r: number): Promise<string> {
  const mapId = await myMapId(wallet);
  const [b, pos] = await Promise.all([
    loadCellBuilding(mapId, Math.floor(q), Math.floor(r)),
    ownCell(wallet),
  ]);
  // Сравниваем строкой: эффект турнира в общем списке заводит клиентская часть.
  const effect: string | null = b ? b.effect : null;
  if (effect !== TOUR_EFFECT) throw new Error("tour.err.not_here");
  const near = !!pos && (areNeighbors(pos.q, pos.r, q, r) || (pos.q === q && pos.r === r));
  if (!near) throw new Error("tour.err.far");
  return mapId;
}
