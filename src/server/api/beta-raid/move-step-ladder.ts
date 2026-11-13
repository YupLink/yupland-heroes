// Лестница (владелец, 08.11.2026; ПРАВИЛА §8.121): «перебраться через
// препятствие — переместиться через одну клетку; клетка, на которую ступаешь,
// должна быть свободна». Перелезать — только через НЕПРОХОДИМОЕ (вода,
// преграда-декор), не через моба и не через постройку. Энергия — как обычный
// шаг на клетку приземления. Одна лестница — один шаг, тратится тем же
// оператором, что сам шаг (move-step-sql, StepGuard.ladder).
import { jumpOver } from "@/lib/hero/mount";
import { loadStepFacts, type StepFacts } from "./step-facts";

type Hex = { q: number; r: number };

/** Живой объект держит клетку (то же правило, что stepBlockedReason). */
const liveObject = (f: StepFacts): boolean =>
  !!f.objectId && f.objectKnown && (!f.hpFound || Number(f.hpValue) > 0);

/** Над этой клеткой лестница перекидывается: вода (не мост) или преграда-декор. */
export function ladderOver(mid: StepFacts | null): boolean {
  if (!mid || !mid.terrainId || mid.voidFog) return false;
  if (liveObject(mid) || mid.mine || mid.building) return false;
  return (mid.water && !mid.bridge) || mid.decorationBlocks;
}

/** Куда лестница не ставит (сверх обычных отказов шага): вода, постройка, дверь. */
export function ladderLandRefusal(to: StepFacts): string | null {
  if (to.water || to.building || to.gate) return "braid.ladder_bad";
  return null;
}

/** Проверка до денег: прямая через одну, середина непроходима, не с корабля. */
export async function checkLadder(
  mapId: string,
  from: Hex,
  to: Hex,
  onShip: boolean,
): Promise<void> {
  if (onShip) throw new Error("braid.ladder_bad");
  const mid = jumpOver(from, to);
  if (!mid) throw new Error("braid.ladder_bad");
  if (!ladderOver(await loadStepFacts(mapId, mid.q, mid.r))) throw new Error("braid.ladder_bad");
}
