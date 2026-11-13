// Куда перелезть лестницей (§8.121) — то же правило, что у сервера
// (move-step-ladder): через одну клетку по прямой, середина непроходима
// (вода или преграда-декор; не моб, не постройка, не шахта, не купол),
// приземление — свободная суша без постройки. Окончательно решает сервер.
import { DIRS, isVoidCell, isWaterCell } from "../usePathfinding";
import type { Cell } from "../unpackMap";
import type { TerrainInfo } from "../hexStepCost";
import type { Hex } from "./ladderMode";

const liveObject = (c: Cell) => !!c.objectId && !c.objectDefeated && !c.runner;

export function ladderOverCell(
  c: Cell | undefined,
  terrains: Record<string, TerrainInfo>,
): boolean {
  if (!c?.terrainId || isVoidCell(c) || liveObject(c) || c.buildingId || c.mine) return false;
  return isWaterCell(c, terrains) || !!c.decorationId;
}

export function ladderLandCell(
  c: Cell | undefined,
  terrains: Record<string, TerrainInfo>,
): boolean {
  if (!c?.terrainId || isVoidCell(c) || liveObject(c) || c.buildingId || c.mine) return false;
  return !c.decorationId && !isWaterCell(c, terrains);
}

export function ladderTargets(
  pos: Hex | null,
  cells: Record<string, Cell>,
  terrains: Record<string, TerrainInfo>,
): Hex[] {
  if (!pos) return [];
  const out: Hex[] = [];
  for (const d of DIRS) {
    const mid = cells[`${pos.q + d.q},${pos.r + d.r}`];
    const to = { q: pos.q + 2 * d.q, r: pos.r + 2 * d.r };
    if (ladderOverCell(mid, terrains) && ladderLandCell(cells[`${to.q},${to.r}`], terrains))
      out.push(to);
  }
  return out;
}
