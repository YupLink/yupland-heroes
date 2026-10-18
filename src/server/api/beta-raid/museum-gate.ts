// «Игрок стоит у музея» — общая проверка для его действий.
//
// Музей — тот же фарм коллекций, что живёт в разделе Фишки, только на карте:
// подошёл к любому — увидел свои коллекции и забрал билеты. Как и в
// университете, проверяется не конкретная клетка, а та, на которую тапнул, и
// то, что игрок стоит рядом с ней.
import { areNeighbors } from "./helpers";
import { loadCellBuilding } from "./building-action";
import { ownCell } from "./encounter-where";

export type MuseumHere = {
  q: number;
  r: number;
  name: string;
  built: boolean;
  /** Тир клетки: 0 — стройка, 1 — рабочий музей, дальше идут улучшения. */
  tier: number;
  /** Надбавка к сбору билетов, %. С третьего тира — по 20% за уровень. */
  bonusPct: number;
};

/**
 * Надбавка музея за тир: третий даёт +20%, четвёртый +40% и так далее.
 * Второй (рабочий) — без надбавки, первый — стройка.
 */
export function museumBonusPct(tier: number): number {
  return Math.max(0, Math.floor(tier) - 1) * 20;
}

export async function museumAt(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
): Promise<MuseumHere> {
  const b = await loadCellBuilding(mapId, Math.floor(q), Math.floor(r));
  if (!b) throw new Error("Здесь нет постройки");
  if (b.effect !== "museum") throw new Error("Это не музей");
  const pos = await ownCell(wallet);
  const near = !!pos && (areNeighbors(pos.q, pos.r, q, r) || (pos.q === q && pos.r === r));
  if (!near) throw new Error("Сначала подойди к музею");
  // Первый тир (индекс 0) — стройка, дальше уже рабочий музей. Как у
  // университета: игрок ждёт готовности после первой достройки, а тиры выше
  // это уже улучшения облика.
  const built = b.tier >= 1;
  return {
    q: Math.floor(q),
    r: Math.floor(r),
    name: b.name,
    built,
    tier: b.tier,
    bonusPct: built ? museumBonusPct(b.tier) : 0,
  };
}
