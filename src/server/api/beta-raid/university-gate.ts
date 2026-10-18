// «Игрок стоит у университета» — общая проверка для всех его действий.
//
// По ТЗ фишки и лайки нельзя ни оставить, ни забрать удалённо: до института
// надо дойти. Причём до ЛЮБОГО — положил в одном, забрал в другом; поэтому
// проверяется не конкретная клетка, а та, на которую игрок показал, и его
// собственная позиция рядом с ней.
import { areNeighbors } from "./helpers";
import { loadCellBuilding } from "./building-action";
import { ownCell } from "./encounter-where";
import { isBuilt } from "@/lib/buildingEffect";
import { universityLevel, universityBonus } from "@/lib/university";

export type UniversityHere = {
  q: number;
  r: number;
  name: string;
  /** Уровень: 0 — ещё стройка, работать нечему. */
  level: number;
  bonus: number;
  /** Достроен ли до последнего тира — окно показывает это отдельной строкой. */
  maxed: boolean;
};

/**
 * Университет на клетке (q,r), рядом с которым стоит игрок.
 *
 * Кидает понятную ошибку вместо молчаливого null: все вызывающие — действия
 * игрока, и каждому нужен один и тот же отказ.
 */
export async function universityAt(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
): Promise<UniversityHere> {
  // Читаем постройку тем же модулем, что и окно стройки: тир лежит отдельной
  // строкой состояния, и свой запрос рано или поздно разошёлся бы с общим.
  const b = await loadCellBuilding(mapId, Math.floor(q), Math.floor(r));
  if (!b) throw new Error("Здесь нет постройки");
  if (b.effect !== "university") {
    throw new Error("Это не университет");
  }

  const pos = await ownCell(wallet);
  const near = !!pos && (areNeighbors(pos.q, pos.r, q, r) || (pos.q === q && pos.r === r));
  if (!near) throw new Error("Сначала подойди к университету");

  const level = universityLevel(b.tier);
  if (level <= 0) throw new Error("Университет ещё не построен");
  return {
    q: Math.floor(q),
    r: Math.floor(r),
    name: b.name,
    level,
    bonus: universityBonus(level),
    maxed: isBuilt(b.tier, b.tiers.length),
  };
}
